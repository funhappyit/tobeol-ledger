/**
 * 수집본을 Supabase 에 적재한다
 *
 * 수집 스크립트가 떨어뜨린 JSONL 을 읽어 items·item_characters·item_categories 에 넣는다.
 * 굿즈 한 건이 여러 표에 흩어지므로, 표별로 나눠 보내지 않고 배치를 통째로
 * load_items() 함수에 넘긴다(supabase/migrations/0005_items_source.sql).
 * 배치 하나가 한 트랜잭션이라 중간에 끊겨도 반쪽짜리 굿즈가 남지 않는다.
 *
 * RLS 를 우회해야 하므로 service_role 키가 필요하다. 이 키는 공개 저장소나
 * Vercel 환경변수에 두면 안 된다. 로컬 .env.local 과 GitHub Secrets 에만 둔다.
 *
 * 사용:
 *   node --import tsx --env-file=.env.local scripts/load-items.ts
 *   node --import tsx --env-file=.env.local scripts/load-items.ts --source pocket
 *   node --import tsx --env-file=.env.local scripts/load-items.ts --dry-run
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { CollectedItem, ItemSource } from '../src/lib/collect/types';

/**
 * 한 번에 넘길 건수.
 * 한 건이 1KB 남짓이라 500건이면 요청이 수백 KB 수준이다.
 * 더 키우면 요청 수는 줄지만 한 번 실패했을 때 다시 보낼 양이 늘어난다.
 */
const BATCH_SIZE = 500;

/** 정가는 엔화 기준이어야 한다. 다른 통화가 섞이면 플미 계산이 통째로 틀어진다 */
const REQUIRED_CURRENCY = 'JPY';

const SOURCES: { source: ItemSource; file: string }[] = [
  { source: 'official', file: 'items.jsonl' },
  { source: 'pocket', file: 'items-pocket.jsonl' },
  { source: 'mogumogu', file: 'items-mogumogu.jsonl' },
];

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    'batch-size': { type: 'string' },
    // 보내지 않고 무엇이 갈지만 확인한다
    'dry-run': { type: 'boolean', default: false },
  },
});

const only = values.source as ItemSource | undefined;
const batchSize = Number(values['batch-size'] ?? BATCH_SIZE);
const dryRun = values['dry-run'] === true;

if (only && !SOURCES.some((entry) => entry.source === only)) {
  console.error(`모르는 출처입니다: ${only} (official, pocket 중 하나)`);
  process.exit(1);
}

const url = process.env.NUXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || (!serviceKey && !dryRun)) {
  console.error('NUXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  console.error('`--env-file=.env.local` 을 붙여 실행했는지 확인해 주세요.');
  process.exit(1);
}

/** load_items() 에 넘기는 한 건의 모양. 컬럼 이름에 맞춘다 */
interface LoadRow {
  source: ItemSource;
  shopify_product_id: number | null;
  handle: string;
  jan: string | null;
  name_ko: string | null;
  name_ja: string | null;
  description_ko: string | null;
  product_type_ko: string | null;
  product_type_ja: string | null;
  vendor: string | null;
  list_price_jpy: number | null;
  image_url: string | null;
  source_url: string;
  /** null 은 품절이 아니라 확인하지 못했다는 뜻 */
  in_stock: boolean | null;
  released_on: string | null;
  preorder_on: string | null;
  purchase_limit: number | null;
  source_updated_at: string | null;
  tags_raw: string[];
  unmapped_tags: string[];
  restocked_on: string[];
  flags: string[];
  character_codes: string[];
  category_codes: string[];
}

function toRow(item: CollectedItem, fallbackSource: ItemSource): LoadRow {
  return {
    source: item.source ?? fallbackSource,
    shopify_product_id: item.shopifyProductId,
    handle: item.handle,
    jan: item.jan,
    name_ko: item.nameKo,
    name_ja: item.nameJa,
    description_ko: item.descriptionKo,
    product_type_ko: item.productTypeKo,
    product_type_ja: item.productTypeJa,
    vendor: item.vendor,
    list_price_jpy: item.listPriceJpy,
    image_url: item.imageUrl,
    source_url: item.sourceUrl,
    in_stock: item.inStock,
    released_on: item.parsed.releasedOn,
    preorder_on: item.parsed.preorderOn,
    purchase_limit: item.parsed.purchaseLimit,
    source_updated_at: item.updatedAt,
    tags_raw: item.tagsRaw,
    // 어휘표에 없어 분류되지 않은 태그. 어휘를 보강할 단서로 남긴다
    unmapped_tags: item.parsed.rest,
    restocked_on: item.parsed.restockedOn,
    flags: item.parsed.flags,
    character_codes: item.parsed.characterCodes,
    category_codes: item.parsed.categoryCodes,
  };
}

async function readJsonl(path: string): Promise<CollectedItem[]> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return [];
  }

  const items: CollectedItem[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    try {
      items.push(JSON.parse(trimmed) as CollectedItem);
    } catch {
      // 수집이 중간에 끊겨 깨진 줄은 건너뛴다
    }
  }

  return items;
}

// 빈 문자열로 선언만 돼 있는 경우가 있어 falsy 로 본다
const supabase = serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

interface LoadResult {
  touched: number;
  price_rows: number;
  unknown_characters: string[];
  unknown_categories: string[];
}

async function main(): Promise<void> {
  const targets = only ? SOURCES.filter((entry) => entry.source === only) : SOURCES;

  console.log(`대상: ${new URL(url!).host}`);
  console.log(`배치 크기: ${batchSize}건${dryRun ? ' (전송하지 않음)' : ''}`);
  console.log('');

  const unknownChars = new Set<string>();
  const unknownCats = new Set<string>();
  let grandTotal = 0;
  let grandPrice = 0;

  for (const target of targets) {
    const path = join(process.cwd(), 'data', target.file);
    const items = await readJsonl(path);

    if (items.length === 0) {
      console.log(`[${target.source}] ${target.file} — 수집본이 없습니다. 건너뜁니다.`);
      console.log('');
      continue;
    }

    // 엔화가 아닌 정가가 섞이면 플미 계산이 틀어진다. 적재 전에 멈춘다
    const wrongCurrency = items.filter(
      (item) => item.listPriceCurrency !== null && item.listPriceCurrency !== REQUIRED_CURRENCY,
    );

    if (wrongCurrency.length > 0) {
      const found = [...new Set(wrongCurrency.map((item) => item.listPriceCurrency))].join(', ');
      throw new Error(
        `[${target.source}] 정가가 ${REQUIRED_CURRENCY} 가 아닌 굿즈가 ${wrongCurrency.length}건 있습니다(${found}). 다시 수집해 주세요.`,
      );
    }

    const rows = items.map((item) => toRow(item, target.source));
    const batches = Math.ceil(rows.length / batchSize);

    console.log(`[${target.source}] ${rows.length.toLocaleString()}건 — ${batches}배치`);

    let touched = 0;
    let priceRows = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const nth = Math.floor(i / batchSize) + 1;

      if (dryRun) {
        console.log(`  ${nth}/${batches} — ${batch.length}건 (전송 안 함)`);
        touched += batch.length;
        continue;
      }

      const { data, error } = await supabase!.rpc('load_items', { payload: batch });

      if (error) {
        throw new Error(`[${target.source}] ${nth}번째 배치 실패: ${error.message}`);
      }

      const result = data as unknown as LoadResult;
      touched += result.touched;
      priceRows += result.price_rows;

      for (const code of result.unknown_characters ?? []) {
        unknownChars.add(code);
      }
      for (const code of result.unknown_categories ?? []) {
        unknownCats.add(code);
      }

      console.log(`  ${nth}/${batches} — ${result.touched}건 적재`);
    }

    console.log(`  소계: ${touched.toLocaleString()}건, 정가 이력 ${priceRows}행`);
    console.log('');

    grandTotal += touched;
    grandPrice += priceRows;
  }

  console.log(`완료: ${grandTotal.toLocaleString()}건, 정가 이력 ${grandPrice.toLocaleString()}행`);

  // 수집 쪽 어휘가 DB 분류 표보다 앞서 나간 경우다. 적재를 막지는 않지만 알려 준다
  if (unknownChars.size > 0) {
    console.log('');
    console.log(`DB 에 없는 캐릭터 코드: ${[...unknownChars].join(', ')}`);
    console.log('  characters 표에 추가해야 해당 분류가 붙습니다.');
  }
  if (unknownCats.size > 0) {
    console.log('');
    console.log(`DB 에 없는 종류 코드: ${[...unknownCats].join(', ')}`);
    console.log('  categories 표에 추가해야 해당 분류가 붙습니다.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
