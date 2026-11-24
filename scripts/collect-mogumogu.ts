/**
 * 치이카와 모구모구 본포 수집 스크립트
 *
 * 공식몰과 같은 Shopify 라 카탈로그 일괄 조회를 쓴다.
 * 680건이 250건씩 3번에 들어오므로 요청이 거의 없다(포켓은 259건에 259번).
 *
 * 사용 예:
 *   npx tsx scripts/collect-mogumogu.ts             # 전량 수집
 *   npx tsx scripts/collect-mogumogu.ts --limit 50  # 50건만 시험 수집
 *   npx tsx scripts/collect-mogumogu.ts --reparse   # 요청 없이 분류·번역만 다시
 *
 * `--reparse` 는 어휘표(vocab.ts)나 번역 사전(mogumogu-name.ts)을 보강한 뒤 쓴다.
 * 받아 둔 파일을 다시 해석하므로 스토어에 요청을 보내지 않는다.
 *
 * PowerShell 에서는 `npm run ... -- --limit 50` 형태로 인자가 전달되지 않으므로
 * 위처럼 npx 로 직접 실행한다.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { fetchShopCurrency } from '../src/lib/collect/currency';
import { getCurlVersion } from '../src/lib/collect/http';
import { hasJapanese, translateMogumoguName } from '../src/lib/collect/mogumogu-name';
import {
  MOGUMOGU_ORIGIN,
  fetchAllMogumoguProducts,
  normalizeMogumoguProduct,
  parseMogumoguTags,
} from '../src/lib/collect/mogumogu';
import type { CollectedItem } from '../src/lib/collect/types';

const { values } = parseArgs({
  options: {
    origin: { type: 'string' },
    out: { type: 'string', default: 'data/items-mogumogu.jsonl' },
    limit: { type: 'string' },
    // 요청 없이, 받아 둔 파일의 분류와 번역만 다시 한다
    reparse: { type: 'boolean', default: false },
    // 정가(엔)가 아닌 통화로 응답할 때도 받는다. 조사 목적에만 쓴다
    'allow-any-currency': { type: 'boolean', default: false },
  },
});

const origin = values.origin ?? process.env.CHIIKAWA_MOGUMOGU_ORIGIN ?? MOGUMOGU_ORIGIN;
const outPath = values.out as string;
const limit = values.limit ? Number(values.limit) : null;

/** 플미 계산의 기준이 엔이라, 다른 통화로 내려오면 정가로 믿을 수 없다 */
const REQUIRED_CURRENCY = 'JPY';

/** 이미 받아 둔 수집본을 읽는다 */
async function readExisting(path: string): Promise<CollectedItem[]> {
  const raw = await readFile(path, 'utf8');
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

async function write(items: CollectedItem[]): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  // 중간에 끊겨 반쪽짜리 파일이 남지 않도록 다 모은 뒤 한 번에 쓴다
  await writeFile(outPath, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
}

/** 수집 결과를 요약해 출력한다. 수집과 --reparse 가 같은 기준으로 보고하도록 모아 둔다 */
function report(items: CollectedItem[]): void {
  const noCategory = items.filter((item) => item.parsed.categoryCodes.length === 0);
  const noCharacter = items.filter((item) => item.parsed.characterCodes.length === 0).length;
  const noRelease = items.filter((item) => item.parsed.releasedOn === null).length;
  const noPrice = items.filter((item) => item.listPriceJpy === null).length;
  const untranslated = items.filter((item) => item.nameKo !== null && hasJapanese(item.nameKo));

  console.log('');
  console.log(`완료: ${items.length.toLocaleString()}건`);
  console.log(`종류를 못 찾은 굿즈: ${noCategory.length}건 (vocab.ts 보강 후 --reparse)`);
  console.log(`캐릭터가 없는 굿즈: ${noCharacter}건`);
  // 스토어 원문에 `2025年20月20日`(20월) 같은 잘못된 날짜가 있다. 추측해서 고치지 않는다
  console.log(`발매일을 못 읽은 굿즈: ${noRelease}건`);
  console.log(`정가를 못 읽은 굿즈: ${noPrice}건`);
  console.log(
    `번역이 남은 굿즈: ${untranslated.length}건 (mogumogu-name.ts 보강 후 --reparse)`,
  );

  for (const item of untranslated.slice(0, 15)) {
    console.log(`  ${item.nameKo}`);
  }
  if (untranslated.length > 15) {
    console.log(`  ... 그 외 ${untranslated.length - 15}건`);
  }

  for (const item of noCategory.slice(0, 10)) {
    console.log(`  종류 미분류: ${item.nameJa} (product_type: ${item.productTypeJa ?? '없음'})`);
  }

  console.log(`출력: ${outPath}`);
}

/**
 * 요청 없이 분류와 번역만 다시 한다.
 * 받아 둔 일본어 상품명(nameJa)과 태그 원문(tagsRaw)만으로 충분하다.
 */
async function reparse(): Promise<void> {
  const existing = await readExisting(outPath);
  console.log(`다시 해석: ${outPath} (${existing.length.toLocaleString()}건)`);

  const items = existing.map((item) => ({
    ...item,
    nameKo: item.nameJa ? translateMogumoguName(item.nameJa) : item.nameKo,
    parsed: parseMogumoguTags(item.tagsRaw, item.productTypeJa),
  }));

  await write(items);
  report(items);
}

async function collect(): Promise<void> {
  console.log(`수집 대상: ${origin}`);
  console.log(`curl: ${getCurlVersion() ?? '확인 전'}`);

  const currency = await fetchShopCurrency(origin);
  console.log(`스토어 통화: ${currency ?? '확인 실패'}`);

  if (currency !== REQUIRED_CURRENCY && !values['allow-any-currency']) {
    throw new Error(
      [
        currency === null
          ? '스토어 통화를 확인하지 못했습니다.'
          : `스토어가 ${currency} 로 응답하고 있습니다.`,
        `정가는 ${REQUIRED_CURRENCY} 기준이어야 플미 계산이 맞습니다.`,
        '조사 목적으로 그대로 받으려면 --allow-any-currency 를 붙이세요.',
      ].join('\n'),
    );
  }

  const products = await fetchAllMogumoguProducts({
    origin,
    onPage: (page, count) => console.log(`  ${page}페이지 — ${count}건`),
  });

  console.log(`카탈로그 상품: ${products.length.toLocaleString()}건`);

  const target = limit === null ? products : products.slice(0, limit);
  if (limit !== null) {
    console.log(`이번에 쓸 건수: ${target.length.toLocaleString()}건`);
  }

  const items: CollectedItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const product of target) {
    const item = normalizeMogumoguProduct(product, currency, { origin });

    if (!item) {
      skipped += 1;
      continue;
    }

    // 카탈로그 페이지가 겹쳐 같은 상품이 두 번 올 수 있다
    if (seen.has(item.handle)) {
      continue;
    }

    seen.add(item.handle);
    items.push(item);
  }

  if (items.length === 0) {
    throw new Error('한 건도 수집하지 못했습니다. 파일을 덮어쓰지 않고 끝냅니다.');
  }

  await write(items);

  if (skipped > 0) {
    console.log(`handle 이나 상품명이 없어 건너뛴 상품: ${skipped}건`);
  }

  report(items);
}

(values.reparse ? reparse() : collect()).catch((error) => {
  console.error(error);
  process.exit(1);
});
