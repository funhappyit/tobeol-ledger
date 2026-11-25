/**
 * 재고 스윕 결과를 Supabase 에 적재한다
 *
 * collect-stock.ts 가 떨어뜨린 JSONL 을 읽어 load_stock() 에 넘긴다
 * (supabase/migrations/0008_stock_sweep.sql).
 * items 의 in_stock·stock_checked_at 두 열만 바뀐다. 이름·가격·분류는 그대로다.
 *
 * 배치가 크다. 한 줄이 60바이트 남짓(출처·handle·불린)이라 2천 건이어도 요청이
 * 120KB 수준이다. 전체 적재(load-items)의 500건과 다른 이유다.
 *
 * RLS 를 우회해야 하므로 service_role 키가 필요하다. 이 키는 공개 저장소나
 * Vercel 환경변수에 두면 안 된다. 로컬 .env.local 과 GitHub Secrets 에만 둔다.
 *
 * 사용:
 *   node --import tsx --env-file=.env.local scripts/load-stock.ts
 *   node --import tsx --env-file=.env.local scripts/load-stock.ts --dry-run
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { ItemSource } from '../src/lib/collect/types';

/** 한 번에 넘길 건수. 한 줄이 작아서 전체 적재보다 크게 잡는다 */
const BATCH_SIZE = 2000;

const { values } = parseArgs({
  options: {
    file: { type: 'string', default: 'stock.jsonl' },
    'batch-size': { type: 'string' },
    // 보내지 않고 무엇이 갈지만 확인한다
    'dry-run': { type: 'boolean', default: false },
  },
});

const fileName = values.file as string;
const batchSize = Number(values['batch-size'] ?? BATCH_SIZE);
const dryRun = values['dry-run'] === true;

const url = process.env.NUXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || (!serviceKey && !dryRun)) {
  console.error('NUXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  console.error('`--env-file=.env.local` 을 붙여 실행했는지 확인해 주세요.');
  process.exit(1);
}

/** 수집본 한 줄 */
interface StockRecord {
  source: ItemSource;
  handle: string;
  inStock: boolean;
}

/** load_stock() 에 넘기는 한 건의 모양. 컬럼 이름에 맞춘다 */
interface StockRow {
  source: ItemSource;
  handle: string;
  in_stock: boolean;
}

interface LoadResult {
  received: number;
  touched: number;
  changed: number;
}

async function readJsonl(path: string): Promise<StockRecord[]> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return [];
  }

  const records: StockRecord[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    try {
      records.push(JSON.parse(trimmed) as StockRecord);
    } catch {
      // 수집이 중간에 끊겨 깨진 줄은 건너뛴다
    }
  }

  return records;
}

// 빈 문자열로 선언만 돼 있는 경우가 있어 falsy 로 본다
const supabase = serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

async function main(): Promise<void> {
  const path = join(process.cwd(), 'data', fileName);
  const records = await readJsonl(path);

  console.log(`대상: ${new URL(url!).host}`);
  console.log(`배치 크기: ${batchSize}건${dryRun ? ' (전송하지 않음)' : ''}`);
  console.log('');

  if (records.length === 0) {
    console.log(`data/${fileName} — 수집본이 없습니다. 적재할 것이 없습니다.`);
    return;
  }

  /**
   * 재고를 모르는 줄은 수집 쪽에서 이미 빠져 있다. 그래도 한 번 더 걸러 둔다.
   * null 을 보내면 알고 있던 값을 "모름"으로 덮어쓰게 되고,
   * 적재 함수가 막아 주더라도 요청에 실어 보낼 이유는 없다.
   */
  const rows: StockRow[] = records
    .filter((record) => typeof record.inStock === 'boolean' && Boolean(record.handle))
    .map((record) => ({
      source: record.source,
      handle: record.handle,
      in_stock: record.inStock,
    }));

  const dropped = records.length - rows.length;
  if (dropped > 0) {
    console.log(`재고를 알 수 없는 ${dropped.toLocaleString()}건은 보내지 않습니다.`);
  }

  const batches = Math.ceil(rows.length / batchSize);
  console.log(`${rows.length.toLocaleString()}건 — ${batches}배치`);

  let touched = 0;
  let changed = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const nth = Math.floor(i / batchSize) + 1;

    if (dryRun) {
      console.log(`  ${nth}/${batches} — ${batch.length}건 (전송 안 함)`);
      continue;
    }

    const { data, error } = await supabase!.rpc('load_stock', { payload: batch });

    if (error) {
      throw new Error(`${nth}번째 배치 실패: ${error.message}`);
    }

    const result = data as unknown as LoadResult;
    touched += result.touched;
    changed += result.changed;

    console.log(`  ${nth}/${batches} — ${result.touched}건 갱신 (값 변동 ${result.changed})`);
  }

  if (dryRun) {
    return;
  }

  console.log('');
  console.log(`완료: ${touched.toLocaleString()}건 갱신, 그중 ${changed.toLocaleString()}건 변동`);

  /**
   * 보낸 것보다 갱신된 것이 적으면 DB 에 없는 handle 이 섞여 온 것이다.
   * 공식몰에 새로 올라온 굿즈는 전체 수집이 돌기 전까지 여기에 걸린다. 정상이다.
   */
  if (touched < rows.length) {
    const missing = rows.length - touched;
    console.log('');
    console.log(`DB 에 없는 굿즈 ${missing.toLocaleString()}건은 건너뛰었습니다.`);
    console.log('  전체 수집이 아직 받지 않은 신상일 수 있습니다.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
