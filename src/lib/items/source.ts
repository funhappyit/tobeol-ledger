/**
 * 굿즈 목록 조회
 *
 * 지금은 수집 스크립트가 떨어뜨린 JSONL 파일을 그대로 읽는다.
 * Supabase 가 준비되면 이 파일의 구현만 바꾸면 되도록, 화면 쪽에서는
 * 아래 함수들만 쓰고 파일 경로나 JSONL 형식을 알지 못하게 한다.
 *
 * 스토어마다 파일을 따로 두는 이유:
 *   수집 주기가 다르고, 한쪽 수집이 실패해도 다른 쪽 수집본이 멀쩡하게 남는다.
 *   파일이 없으면 그 스토어 굿즈만 빠지고 화면은 그대로 뜬다.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CollectedItem, ItemSource } from '../collect/types';

/**
 * 읽을 수집본.
 *
 * `source` 는 레코드에 출처가 적혀 있지 않을 때 쓸 기본값이다.
 * 공식몰만 수집하던 시기의 items.jsonl 에는 source 필드가 없어서,
 * 그 파일에서 읽은 레코드는 여기서 'official' 로 채운다(재수집 불필요).
 */
const SOURCES: { path: string; source: ItemSource }[] = [
  { path: join(process.cwd(), 'data', 'items.jsonl'), source: 'official' },
  { path: join(process.cwd(), 'data', 'items-pocket.jsonl'), source: 'pocket' },
];

export interface ItemListResult {
  items: CollectedItem[];
  /** 수집본에 섞인 통화 목록. JPY 외의 값이 있으면 화면에서 경고를 띄운다 */
  currencies: string[];
}

/** JSONL 한 줄씩 읽어 굿즈 목록을 만든다. 파일이 없으면 빈 목록 */
async function readJsonl(path: string, fallbackSource: ItemSource): Promise<CollectedItem[]> {
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
      const item = JSON.parse(trimmed) as CollectedItem;
      items.push(item.source ? item : { ...item, source: fallbackSource });
    } catch {
      // 수집이 중간에 끊겨 깨진 줄은 건너뛴다
    }
  }

  return items;
}

/**
 * 발매일 최신순. 발매일이 없는 굿즈는 뒤로 보내고, 그들끼리는 최종 수정 시각 최신순으로.
 *
 * 포켓 스토어는 발매일을 공개하지 않아 전부 발매일이 없다.
 * 그대로 두면 수백 건이 아무 순서 없이 뒤에 쌓이므로, 최소한 신상이 앞에 오게 한다.
 */
function compareByRelease(a: CollectedItem, b: CollectedItem): number {
  const left = a.parsed.releasedOn;
  const right = b.parsed.releasedOn;

  if (left && right) {
    return right.localeCompare(left);
  }
  if (left) {
    return -1;
  }
  if (right) {
    return 1;
  }

  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
}

export async function getItems(): Promise<ItemListResult> {
  const groups = await Promise.all(
    SOURCES.map((entry) => readJsonl(entry.path, entry.source)),
  );

  const items: CollectedItem[] = [];
  const currencies = new Set<string>();
  // 두 스토어의 handle 형식은 겹치지 않지만, 같은 파일을 두 번 읽는 설정 실수를 막아 둔다
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.handle)) {
        continue;
      }
      seen.add(item.handle);
      items.push(item);

      if (item.listPriceCurrency) {
        currencies.add(item.listPriceCurrency);
      }
    }
  }

  items.sort(compareByRelease);

  return { items, currencies: [...currencies] };
}

// 이미지 주소 가공은 클라이언트에서도 쓰므로 image.ts 로 옮겼다.
// 이 파일은 node:fs 를 import 하기 때문에 클라이언트에서 import 하면 빌드가 깨진다.
