/**
 * 재고 전용 스윕
 *
 * 이름·가격·태그는 건드리지 않고 "지금 살 수 있는지"만 다시 본다.
 * 전체 수집(collect-items.ts)보다 훨씬 가벼워서 자주 돌릴 수 있다.
 *
 * ── 왜 따로 떼어냈나
 *
 * 전체 수집은 로케일을 둘 받는다. 한국어 상품명과 일본어 상품명을 함께 담아야 해서다.
 * 그래서 공식몰 한 바퀴가 86요청이 된다.
 *
 * 재고는 로케일과 무관하다. 한 바퀴를 한 로케일로만 돌면 43요청으로 끝난다.
 * 상품명을 다시 받을 이유가 없으니 절반이 그대로 빠진다.
 *
 *   전체 수집   ko+ja 86요청 — 하루 1회
 *   재고 스윕   ko    43요청 — 30분마다
 *
 * 통화 확인(/meta.json)도 건너뛴다. 정가를 적재하지 않으므로 통화가 무엇이든
 * 틀어질 값이 없다. 요청 하나를 아끼는 것보다, 재고만 보는 경로에 가격 판단을
 * 끼워 넣지 않는 쪽이 낫다.
 *
 * ── 알 수 없는 재고는 내보내지 않는다
 *
 * `available` 을 한 품목에서도 못 읽으면 그 상품은 건너뛴다(pickInStock 이 null).
 * null 을 그대로 적재하면 어제까지 알고 있던 값을 "모름"으로 덮어쓰게 된다.
 * 모르게 된 것과 아직 모르는 것은 다르다. 빼고 보내면 DB 는 직전 값을 그대로 지킨다.
 *
 * ── 포켓 스토어는 대상이 아니다
 *
 * 그쪽은 재고를 애초에 못 본다. 상품 페이지의 구조화 데이터에 재고 표시가 없고,
 * 재고를 그리는 /api/ 는 robots.txt 가 막고 있다. 모르는 것을 품절로 적을 수는 없다.
 *
 * 사용 예:
 *   npx tsx scripts/collect-stock.ts                      # 공식몰 + 모구모구
 *   npx tsx scripts/collect-stock.ts --targets official   # 공식몰만
 *   npx tsx scripts/collect-stock.ts --max-pages 2        # 2페이지만 시험
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { MAX_PAGE_SIZE, fetchCatalogPage } from '../src/lib/collect/catalog';
import { createThrottle, getCurlVersion } from '../src/lib/collect/http';
import { MOGUMOGU_ORIGIN } from '../src/lib/collect/mogumogu';
import { pickInStock } from '../src/lib/collect/product';
import type { ItemSource } from '../src/lib/collect/types';

/** 재고를 볼 수 있는 스토어 */
interface StockTarget {
  source: ItemSource;
  origin: string;
  /**
   * 카탈로그를 받을 로케일.
   * 전체 수집이 기준으로 쓰는 로케일과 맞춘다. 로케일마다 상품 집합이 조금씩 달라서,
   * 다른 쪽을 쓰면 우리 DB 에 없는 handle 이 섞여 들어온다(적재에서 버려지긴 한다).
   */
  locale: string;
}

const TARGETS: StockTarget[] = [
  // collect-items.ts 의 기준 로케일이 ko 다
  { source: 'official', origin: 'https://chiikawamarket.jp', locale: 'ko' },
  // collect-mogumogu.ts 는 ja 로만 받는다. 이 스토어는 한국어 경로가 없다
  { source: 'mogumogu', origin: MOGUMOGU_ORIGIN, locale: 'ja' },
];

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'data/stock.jsonl' },
    targets: { type: 'string', default: 'official,mogumogu' },
    interval: { type: 'string' },
    'page-size': { type: 'string' },
    'max-pages': { type: 'string' },
  },
});

const outPath = values.out as string;
const intervalMs = Number(values.interval ?? process.env.COLLECT_REQUEST_INTERVAL_MS ?? 1000);
const pageSize = Math.min(Number(values['page-size'] ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE);
const maxPages = values['max-pages'] ? Number(values['max-pages']) : null;

const wanted = (values.targets as string)
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

const unknown = wanted.filter((name) => !TARGETS.some((target) => target.source === name));
if (unknown.length > 0) {
  console.error(`재고를 볼 수 없는 스토어입니다: ${unknown.join(', ')}`);
  console.error(`가능한 값: ${TARGETS.map((target) => target.source).join(', ')}`);
  process.exit(1);
}

const targets = TARGETS.filter((target) => wanted.includes(target.source));

/** 적재 스크립트가 읽는 한 줄 */
interface StockRow {
  source: ItemSource;
  handle: string;
  inStock: boolean;
}

interface SweepResult {
  rows: StockRow[];
  /** 재고를 읽을 수 없어 내보내지 않은 상품 수 */
  unknown: number;
  pages: number;
}

async function sweep(target: StockTarget, throttle: () => Promise<void>): Promise<SweepResult> {
  const rows: StockRow[] = [];
  const seen = new Set<string>();
  let unknownCount = 0;
  let page = 1;

  while (true) {
    await throttle();
    const products = await fetchCatalogPage(target.origin, target.locale, page, pageSize);

    if (products.length === 0) {
      break;
    }

    for (const product of products) {
      const handle = product.handle?.trim();
      if (!handle || seen.has(handle)) {
        continue;
      }
      seen.add(handle);

      const inStock = pickInStock(product);

      // 모르는 것은 보내지 않는다. 알고 있던 값을 덮어쓰지 않기 위해서다
      if (inStock === null) {
        unknownCount += 1;
        continue;
      }

      rows.push({ source: target.source, handle, inStock });
    }

    console.log(`  [${target.source}] ${page}페이지까지 ${rows.length.toLocaleString()}건`);

    if (products.length < pageSize) {
      break;
    }
    if (maxPages !== null && page >= maxPages) {
      break;
    }

    page += 1;
  }

  return { rows, unknown: unknownCount, pages: page };
}

async function main(): Promise<void> {
  console.log(`재고 스윕 대상: ${targets.map((target) => target.source).join(', ')}`);
  console.log(`페이지당 ${pageSize}건 / 요청 간격: ${intervalMs}ms`);
  console.log('');

  const throttle = createThrottle(intervalMs);
  const all: StockRow[] = [];
  let requests = 0;

  for (const target of targets) {
    console.log(`[${target.source}] ${target.origin} (${target.locale})`);

    const result = await sweep(target, throttle);
    all.push(...result.rows);
    requests += result.pages;

    const buyable = result.rows.filter((row) => row.inStock).length;
    console.log(
      `  소계: ${result.rows.length.toLocaleString()}건 — 토벌 가능 ${buyable.toLocaleString()}` +
        (result.unknown > 0 ? ` / 재고 못 읽음 ${result.unknown.toLocaleString()}(제외)` : ''),
    );
    console.log('');
  }

  // 중간에 끊겨 반쪽짜리 파일이 남지 않도록 다 모은 뒤 한 번에 쓴다
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, all.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');

  const buyable = all.filter((row) => row.inStock).length;
  console.log(`완료: ${all.length.toLocaleString()}건 (토벌 가능 ${buyable.toLocaleString()})`);
  console.log(`요청 ${requests}회 / 출력: ${outPath}`);
}

main().catch((error) => {
  console.error(error);

  // 429 는 원인이 바로 와닿지 않는 에러라 따로 안내를 붙인다
  if (error instanceof Error && error.message.includes('HTTP 429')) {
    console.error('');
    console.error('카탈로그 조회가 429(요청 과다)로 막혔습니다.');
    console.error(`현재 전송에 쓰는 curl: ${getCurlVersion() ?? '확인 실패(Node fetch 사용 중)'}`);
    console.error('요청 간격을 늘려 보세요(--interval 3000).');
  }

  process.exit(1);
});
