/**
 * 굿즈 마스터 수집 스크립트
 *
 * 공식몰의 카탈로그 일괄 조회(`/collections/all/products.json`)로 한 번에 250건씩 받아
 * JSONL(한 줄에 한 상품)로 떨어뜨린다. DB 적재는 다음 단계에서 이 파일을 읽어 수행한다.
 *
 * 로케일을 둘 받는 이유는 한국어 상품명(ko)과 일본어 상품명(ja)을 함께 담기 위해서다.
 * 태그·정가는 어느 쪽이든 같다.
 *
 * 사용 예:
 *   npx tsx scripts/collect-items.ts --limit 100     # 100건만 시험 수집
 *   npx tsx scripts/collect-items.ts                 # 전량 수집
 *   npx tsx scripts/collect-items.ts --locales ko    # 한국어만 (요청 수 절반)
 *
 * PowerShell 에서는 `npm run collect -- --limit 50` 형태로 인자가 전달되지 않으므로
 * 위처럼 npx 로 직접 실행한다.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { createThrottle } from '../src/lib/collect/http';
import { fetchPresentmentCurrency, fetchShopCurrency } from '../src/lib/collect/currency';
import { MAX_PAGE_SIZE, fetchCatalogPage, indexById } from '../src/lib/collect/catalog';
import { normalizeProduct } from '../src/lib/collect/product';
import type { CollectedItem } from '../src/lib/collect/types';

/** 정가는 엔화 기준이어야 한다. 다른 통화로 수집하면 플미 계산이 통째로 틀어진다 */
const REQUIRED_CURRENCY = 'JPY';

const { values } = parseArgs({
  options: {
    origin: { type: 'string' },
    out: { type: 'string', default: 'data/items.jsonl' },
    locales: { type: 'string', default: 'ko,ja' },
    limit: { type: 'string' },
    interval: { type: 'string' },
    'page-size': { type: 'string' },
    // 통화가 JPY 가 아니어도 그대로 수집한다. 조사 목적이 아니면 쓰지 말 것
    'allow-any-currency': { type: 'boolean', default: false },
    // 표시 통화까지 확인한다. 상품 페이지(700KB 이상)를 받아야 해서 느리다
    'verify-presentment': { type: 'boolean', default: false },
  },
});

const origin = values.origin ?? process.env.CHIIKAWA_MARKET_ORIGIN ?? 'https://chiikawamarket.jp';
const outPath = values.out as string;
const locales = (values.locales as string)
  .split(',')
  .map((locale) => locale.trim())
  .filter((locale) => locale.length > 0);
const limit = values.limit ? Number(values.limit) : null;
const intervalMs = Number(values.interval ?? process.env.COLLECT_REQUEST_INTERVAL_MS ?? 1000);
const pageSize = Math.min(Number(values['page-size'] ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE);

/** 기준 로케일. 이 로케일에 없는 상품은 수집하지 않는다 */
const primaryLocale = locales[0] ?? 'ko';

async function main(): Promise<void> {
  console.log(`수집 대상: ${origin}`);
  console.log(`로케일: ${locales.join(', ')} / 페이지당 ${pageSize}건 / 요청 간격: ${intervalMs}ms`);

  const throttle = createThrottle(intervalMs);

  // 상품 JSON 에는 통화 표시가 없고, 같은 URL 이라도 요청한 지역에 따라
  // 엔화가 아닌 통화로 내려오는 경우가 있다. 시작 전에 통화를 확인한다.
  await throttle();
  let currency = await fetchShopCurrency(origin);
  console.log(`스토어 통화: ${currency ?? '확인 실패'}`);

  if (values['verify-presentment']) {
    await throttle();
    const sample = await fetchCatalogPage(origin, primaryLocale, 1, 1);
    if (sample[0]) {
      await throttle();
      const presentment = await fetchPresentmentCurrency(origin, sample[0].handle);
      console.log(`표시 통화: ${presentment ?? '확인 실패'}`);
      currency = presentment;
    }
  }

  if (currency !== REQUIRED_CURRENCY && !values['allow-any-currency']) {
    const reason =
      currency === null
        ? '공식몰의 통화를 확인하지 못했습니다(요청이 막혔거나 응답 형식이 바뀌었을 수 있습니다).'
        : `공식몰이 ${currency} 로 응답하고 있습니다.`;

    console.error(
      [
        '',
        `중단: ${reason}`,
        `정가는 ${REQUIRED_CURRENCY} 기준이어야 하며, 다른 통화로 수집하면 플미 계산이 전부 틀어집니다.`,
        '잠시 뒤 다시 실행하거나, 요청 간격(--interval)을 늘려 보세요.',
        '조사 목적으로 그대로 받으려면 --allow-any-currency 를 붙이세요.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(dirname(outPath), { recursive: true });

  const items: CollectedItem[] = [];
  const seen = new Set<number>();
  let page = 1;
  let skipped = 0;

  while (true) {
    await throttle();
    const primary = await fetchCatalogPage(origin, primaryLocale, page, pageSize);

    if (primary.length === 0) {
      break;
    }

    // 보조 로케일(일본어 상품명 등)은 같은 페이지를 받아 id 로 맞춘다
    const secondary = new Map<string, Map<number, (typeof primary)[number]>>();
    for (const locale of locales.slice(1)) {
      await throttle();
      secondary.set(locale, indexById(await fetchCatalogPage(origin, locale, page, pageSize)));
    }

    for (const product of primary) {
      if (seen.has(product.id)) {
        continue;
      }
      seen.add(product.id);

      const ko = primaryLocale === 'ko' ? product : (secondary.get('ko')?.get(product.id) ?? null);
      const ja = primaryLocale === 'ja' ? product : (secondary.get('ja')?.get(product.id) ?? null);

      const item = normalizeProduct(origin, ko, ja, currency);
      if (item) {
        items.push(item);
      } else {
        skipped += 1;
      }

      if (limit !== null && items.length >= limit) {
        break;
      }
    }

    console.log(`  ${page}페이지까지 ${items.length.toLocaleString()}건`);

    if (limit !== null && items.length >= limit) {
      break;
    }
    if (primary.length < pageSize) {
      break;
    }

    page += 1;
  }

  // 중간에 끊겨 반쪽짜리 파일이 남지 않도록 다 모은 뒤 한 번에 쓴다
  await writeFile(outPath, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');

  console.log(`완료: ${items.length.toLocaleString()}건 수집 (건너뜀 ${skipped})`);
  console.log(`출력: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
