/**
 * 수집본 파일에서 굿즈 읽기
 *
 * 수집 스크립트가 떨어뜨린 JSONL 을 읽는다.
 * 배포 환경에서는 DB(db.ts)가 기본이고 이쪽은 받침이다.
 *   - 로컬 개발에서 DB 를 안 채웠을 때
 *   - DB 가 잠깐 응답하지 않을 때
 * 어느 쪽을 쓸지는 server/utils/items.ts 가 고른다.
 *
 * 스토어마다 파일을 따로 두는 이유:
 *   수집 주기가 다르고, 한쪽 수집이 실패해도 다른 쪽 수집본이 멀쩡하게 남는다.
 *   파일이 없으면 그 스토어 굿즈만 빠지고 화면은 그대로 뜬다.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CollectedItem, ItemSource } from '../collect/types';
import { mergeItems, type ItemListResult } from './sort';

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
  { path: join(process.cwd(), 'data', 'items-mogumogu.jsonl'), source: 'mogumogu' },
];

export type { ItemListResult };

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

      items.push({
        ...item,
        source: item.source ?? fallbackSource,
        // 재고를 담기 전에 받아 둔 수집본에는 이 값이 없다.
        // 없으면 "모름"이다. 품절로 적으면 없는 사실을 지어내는 것이 된다
        inStock: item.inStock ?? null,
      });
    } catch {
      // 수집이 중간에 끊겨 깨진 줄은 건너뛴다
    }
  }

  return items;
}

/** 수집본 파일에서 전량을 읽는다 */
export async function getItemsFromFiles(): Promise<ItemListResult> {
  const groups = await Promise.all(SOURCES.map((entry) => readJsonl(entry.path, entry.source)));

  return mergeItems(groups);
}

// 이미지 주소 가공은 클라이언트에서도 쓰므로 image.ts 로 옮겼다.
// 이 파일은 node:fs 를 import 하기 때문에 클라이언트에서 import 하면 빌드가 깨진다.
