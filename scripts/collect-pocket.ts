/**
 * 포켓 굿즈 스토어 수집 스크립트
 *
 * sitemap 에서 상품 URL 전량을 받고, 상품 페이지마다 구조화 데이터를 읽어
 * JSONL(한 줄에 한 상품)로 떨어뜨린다. 공식몰 수집본과는 다른 파일에 쓴다.
 *
 * 공식몰과 달리 목록 일괄 조회가 없어서 상품 수만큼 요청해야 한다(현재 259건).
 * 남의 상용 스토어이므로 요청 간격을 두고, 중간에 몇 건 실패해도 멈추지 않는다.
 *
 * 사용 예:
 *   npx tsx scripts/collect-pocket.ts --limit 10   # 10건만 시험 수집
 *   npx tsx scripts/collect-pocket.ts              # 전량 수집
 *   npx tsx scripts/collect-pocket.ts --reparse    # 요청 없이 분류만 다시
 *
 * `--reparse` 는 어휘표(vocab.ts)를 보강한 뒤 쓴다.
 * 이미 받아 둔 파일의 상품명을 다시 해석하므로 스토어에 요청을 보내지 않는다.
 *
 * PowerShell 에서는 `npm run collect:pocket -- --limit 10` 형태로 인자가 전달되지 않으므로
 * 위처럼 npx 로 직접 실행한다.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { createThrottle, getCurlVersion } from '../src/lib/collect/http';
import {
  POCKET_ORIGIN,
  fetchPocketItem,
  fetchPocketProductUrls,
  normalizePocketItem,
} from '../src/lib/collect/pocket';
import type { CollectedItem } from '../src/lib/collect/types';

const { values } = parseArgs({
  options: {
    origin: { type: 'string' },
    out: { type: 'string', default: 'data/items-pocket.jsonl' },
    limit: { type: 'string' },
    interval: { type: 'string' },
    // 요청 없이, 이미 받아 둔 파일의 상품명만 다시 해석한다
    reparse: { type: 'boolean', default: false },
  },
});

const origin = values.origin ?? process.env.CHIIKAWA_POCKET_ORIGIN ?? POCKET_ORIGIN;
const outPath = values.out as string;
const limit = values.limit ? Number(values.limit) : null;
const intervalMs = Number(values.interval ?? process.env.COLLECT_REQUEST_INTERVAL_MS ?? 1000);

/** 몇 건마다 진행 상황을 출력할지 */
const PROGRESS_EVERY = 20;

/** 이 비율을 넘게 실패하면 멈춘다. 스토어가 막기 시작한 것일 수 있다 */
const FAILURE_LIMIT_RATIO = 0.2;

function explain429(): void {
  const version = getCurlVersion();

  console.error(
    [
      '',
      '스토어가 429(요청 과다)로 막았습니다.',
      `지금 쓰는 curl: ${version ?? '확인 실패'}`,
      '',
      '시도해 볼 것:',
      '  1. 요청 간격을 늘린다           --interval 3000',
      '  2. 잠시 뒤 다시 실행한다',
      '  3. 다른 curl 로 보낸다          COLLECT_CURL_PATH=/usr/bin/curl',
    ].join('\n'),
  );
}

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

/**
 * 요청 없이 분류만 다시 한다.
 * 상품명(nameJa)과 주소는 그대로 두고 parsed 만 새로 만든다.
 */
async function reparse(): Promise<void> {
  const existing = await readExisting(outPath);
  console.log(`다시 해석: ${outPath} (${existing.length.toLocaleString()}건)`);

  const before = existing.filter((item) => item.parsed.categoryCodes.length === 0).length;

  const items = existing.map((item) => {
    const reparsed = normalizePocketItem(
      {
        '@type': 'Product',
        name: item.nameJa ?? '',
        image: item.imageUrl ? [item.imageUrl] : [],
        url: item.sourceUrl,
        offers: {
          price: item.listPriceJpy ?? undefined,
          priceCurrency: item.listPriceCurrency ?? undefined,
        },
      },
      { origin, collectedAt: item.collectedAt },
    );

    // 해석에 실패하면 원본을 그대로 둔다. 다시 받을 수 없는 자료를 잃지 않기 위해서다
    return reparsed ?? item;
  });

  const after = items.filter((item) => item.parsed.categoryCodes.length === 0).length;

  await write(items);

  console.log(`종류 미분류: ${before}건 -> ${after}건`);
  console.log(`출력: ${outPath}`);
}

async function collect(): Promise<void> {
  console.log(`수집 대상: ${origin}`);
  console.log(`요청 간격: ${intervalMs}ms`);

  const throttle = createThrottle(intervalMs);

  const allUrls = await fetchPocketProductUrls(origin);
  const urls = limit === null ? allUrls : allUrls.slice(0, limit);

  console.log(`sitemap 상품: ${allUrls.length.toLocaleString()}건`);
  if (limit !== null) {
    console.log(`이번에 받을 건수: ${urls.length.toLocaleString()}건`);
  }
  console.log(`curl: ${getCurlVersion() ?? '확인 전'}`);

  const items: CollectedItem[] = [];
  const failures: { url: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < urls.length; i += 1) {
    await throttle();

    const url = urls[i];

    try {
      const item = await fetchPocketItem(url, origin);

      if (!item) {
        failures.push({ url, reason: '구조화 데이터 없음' });
      } else if (seen.has(item.handle)) {
        // sitemap 에 같은 상품이 두 번 실린 경우
      } else {
        seen.add(item.handle);
        items.push(item);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ url, reason });

      // 한 건 실패로 전체를 버리지 않는다. 다만 연달아 실패하면 멈춘다
      if (failures.length > Math.max(5, urls.length * FAILURE_LIMIT_RATIO)) {
        console.error(`실패가 너무 많아 중단합니다 (${failures.length}건)`);
        break;
      }
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === urls.length) {
      console.log(`  ${i + 1}/${urls.length} — 수집 ${items.length}건, 실패 ${failures.length}건`);
    }
  }

  if (items.length === 0) {
    throw new Error('한 건도 수집하지 못했습니다. 파일을 덮어쓰지 않고 끝냅니다.');
  }

  await write(items);

  const noCategory = items.filter((item) => item.parsed.categoryCodes.length === 0).length;
  const noCharacter = items.filter((item) => item.parsed.characterCodes.length === 0).length;
  const noPrice = items.filter((item) => item.listPriceJpy === null).length;

  console.log('');
  console.log(`완료: ${items.length.toLocaleString()}건 수집`);
  console.log(`종류를 못 찾은 굿즈: ${noCategory}건 (vocab.ts 보강 후 --reparse)`);
  console.log(`캐릭터가 없는 굿즈: ${noCharacter}건`);
  // 구조화 데이터가 없는 페이지는 가격이 /api/ 로만 내려온다. 그 경로는 쓰지 않는다
  console.log(`정가를 못 읽은 굿즈: ${noPrice}건 (상품 페이지에 가격이 없음)`);
  console.log(`출력: ${outPath}`);

  if (failures.length > 0) {
    console.log('');
    console.log(`실패 ${failures.length}건:`);
    for (const failure of failures.slice(0, 10)) {
      console.log(`  ${failure.url} — ${failure.reason}`);
    }
    if (failures.length > 10) {
      console.log(`  ... 그 외 ${failures.length - 10}건`);
    }
  }
}

(values.reparse ? reparse() : collect()).catch((error) => {
  console.error(error);

  if (error instanceof Error && error.message.includes('HTTP 429')) {
    explain429();
  }

  process.exit(1);
});
