/**
 * 굿즈 마스터 수집 스크립트
 *
 * sitemap 에서 전체 상품 handle 을 받고, 상품별로 상세 JSON 을 조회해
 * JSONL(한 줄에 한 상품)로 떨어뜨린다. DB 적재는 다음 단계에서 이 파일을 읽어 수행한다.
 *
 * 전량 수집은 1만 건이 넘어 한 번에 오래 걸리므로, 이미 수집한 handle 은 건너뛰고
 * 중단된 지점부터 이어서 받을 수 있게 했다(--resume).
 *
 * 사용 예:
 *   npm run collect -- --limit 30                 # 30건만 시험 수집
 *   npm run collect -- --resume                   # 전량 수집, 중단 지점부터
 *   npm run collect -- --locales ko               # 한국어만 (요청 수 절반)
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { createThrottle } from '../src/lib/collect/http';
import { fetchPresentmentCurrency, fetchShopCurrency } from '../src/lib/collect/currency';
import { fetchAllProductHandles } from '../src/lib/collect/sitemap';
import { fetchProduct, normalizeProduct } from '../src/lib/collect/product';
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
    resume: { type: 'boolean', default: false },
    // 통화가 JPY 가 아니어도 그대로 수집한다. 조사 목적이 아니면 쓰지 말 것
    'allow-any-currency': { type: 'boolean', default: false },
    // 캐시를 무시하고 sitemap 에서 상품 목록을 다시 받는다
    'refresh-handles': { type: 'boolean', default: false },
    // 표시 통화까지 확인한다. 상품 페이지(700KB 이상)를 받아야 해서 느리다
    'verify-presentment': { type: 'boolean', default: false },
  },
});

/**
 * 상품 목록 캐시 경로.
 * sitemap 11개를 모두 받으면 10MB 가 넘는다. 목록은 자주 바뀌지 않으므로
 * 한 번 받아 두고 재사용하고, 새 상품을 반영할 때만 --refresh-handles 로 다시 받는다.
 */
const HANDLE_CACHE_PATH = 'data/handles.json';

const origin = values.origin ?? process.env.CHIIKAWA_MARKET_ORIGIN ?? 'https://chiikawamarket.jp';
const outPath = values.out as string;
const locales = (values.locales as string)
  .split(',')
  .map((locale) => locale.trim())
  .filter((locale) => locale.length > 0);
const limit = values.limit ? Number(values.limit) : null;
const intervalMs = Number(values.interval ?? process.env.COLLECT_REQUEST_INTERVAL_MS ?? 300);

/** 이미 수집한 handle 을 읽어 둔다 (--resume) */
async function readCollectedHandles(path: string): Promise<Set<string>> {
  const collected = new Set<string>();

  if (!existsSync(path)) {
    return collected;
  }

  const content = await readFile(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const item = JSON.parse(trimmed) as CollectedItem;
      if (item.handle) {
        collected.add(item.handle);
      }
    } catch {
      // 중간에 끊겨 깨진 줄은 무시하고 다시 받는다
    }
  }

  return collected;
}

/** 상품 목록 캐시를 읽는다. 없거나 깨져 있으면 null */
async function readHandleCache(): Promise<string[] | null> {
  if (!existsSync(HANDLE_CACHE_PATH)) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readFile(HANDLE_CACHE_PATH, 'utf8')) as unknown;
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed as string[];
    }
  } catch {
    return null;
  }

  return null;
}

async function writeHandleCache(handles: string[]): Promise<void> {
  await mkdir(dirname(HANDLE_CACHE_PATH), { recursive: true });
  await writeFile(HANDLE_CACHE_PATH, JSON.stringify(handles), 'utf8');
}

async function main(): Promise<void> {
  console.log(`수집 대상: ${origin}`);
  console.log(`로케일: ${locales.join(', ')} / 요청 간격: ${intervalMs}ms`);

  const throttle = createThrottle(intervalMs);

  let handles = values['refresh-handles'] ? null : await readHandleCache();

  if (handles) {
    console.log(`상품 목록 캐시 사용: ${handles.length.toLocaleString()}건 (${HANDLE_CACHE_PATH})`);
    console.log('새 상품을 반영하려면 --refresh-handles 를 붙이세요');
  } else {
    console.log('sitemap 에서 상품 목록을 받는 중...');
    handles = await fetchAllProductHandles(
      origin,
      (done, total) => process.stdout.write(`\r  sitemap ${done}/${total}`),
      throttle,
    );
    process.stdout.write('\n');
    console.log(`상품 ${handles.length.toLocaleString()}건 확인`);
    await writeHandleCache(handles);
  }

  if (handles.length === 0) {
    console.log('수집할 상품이 없습니다.');
    return;
  }

  // 상품 JSON 에는 통화 표시가 없고, 같은 URL 이라도 요청한 지역에 따라
  // 엔화가 아닌 통화로 내려오는 경우가 있다. 시작 전에 통화를 확인한다.
  await throttle();
  let currency = await fetchShopCurrency(origin);
  console.log(`스토어 통화: ${currency ?? '확인 실패'}`);

  if (values['verify-presentment']) {
    await throttle();
    const presentment = await fetchPresentmentCurrency(origin, handles[0]);
    console.log(`표시 통화: ${presentment ?? '확인 실패'}`);
    // 표시 통화를 확인했다면 그쪽이 실제 응답에 적용된 값이므로 우선한다
    currency = presentment;
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

  const already = values.resume ? await readCollectedHandles(outPath) : new Set<string>();
  if (already.size > 0) {
    handles = handles.filter((handle) => !already.has(handle));
    console.log(`이미 수집한 ${already.size.toLocaleString()}건을 건너뜁니다`);
  }

  if (limit !== null) {
    handles = handles.slice(0, limit);
    console.log(`--limit 적용: ${handles.length}건만 수집합니다`);
  }

  await mkdir(dirname(outPath), { recursive: true });

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < handles.length; i += 1) {
    const handle = handles[i];

    try {
      const fetched: Record<string, Awaited<ReturnType<typeof fetchProduct>>> = {};
      for (const locale of locales) {
        await throttle();
        fetched[locale] = await fetchProduct(origin, locale, handle);
      }

      const item = normalizeProduct(origin, fetched.ko ?? null, fetched.ja ?? null, currency);
      if (!item) {
        skipped += 1;
      } else {
        await appendFile(outPath, `${JSON.stringify(item)}\n`, 'utf8');
        ok += 1;
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n  실패 ${handle}: ${message}`);
    }

    const done = i + 1;
    if (done % 10 === 0 || done === handles.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const perItem = elapsed / done;
      const remain = Math.round(perItem * (handles.length - done));
      process.stdout.write(
        `\r  ${done}/${handles.length} (성공 ${ok} / 없음 ${skipped} / 실패 ${failed}) 남은 시간 약 ${Math.floor(remain / 60)}분 ${remain % 60}초   `,
      );
    }
  }

  process.stdout.write('\n');
  console.log(`완료: 성공 ${ok} / 없음 ${skipped} / 실패 ${failed}`);
  console.log(`출력: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
