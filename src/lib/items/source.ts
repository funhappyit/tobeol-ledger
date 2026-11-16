/**
 * 굿즈 목록 조회
 *
 * 지금은 수집 스크립트가 떨어뜨린 JSONL 파일을 그대로 읽는다.
 * Supabase 가 준비되면 이 파일의 구현만 바꾸면 되도록, 화면 쪽에서는
 * 아래 함수들만 쓰고 파일 경로나 JSONL 형식을 알지 못하게 한다.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CollectedItem } from '@/lib/collect/types';

const DATA_PATH = join(process.cwd(), 'data', 'items.jsonl');

export interface ItemListResult {
  items: CollectedItem[];
  /** 수집본에 섞인 통화 목록. JPY 외의 값이 있으면 화면에서 경고를 띄운다 */
  currencies: string[];
}

/** JSONL 한 줄씩 읽어 굿즈 목록을 만든다. 파일이 없으면 빈 목록 */
export async function getItems(): Promise<ItemListResult> {
  let raw: string;

  try {
    raw = await readFile(DATA_PATH, 'utf8');
  } catch {
    return { items: [], currencies: [] };
  }

  const items: CollectedItem[] = [];
  const currencies = new Set<string>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    try {
      const item = JSON.parse(trimmed) as CollectedItem;
      items.push(item);
      if (item.listPriceCurrency) {
        currencies.add(item.listPriceCurrency);
      }
    } catch {
      // 수집이 중간에 끊겨 깨진 줄은 건너뛴다
    }
  }

  // 최신 발매순. 발매일이 없는 것은 뒤로 보낸다
  items.sort((a, b) => {
    const left = a.parsed.releasedOn ?? '';
    const right = b.parsed.releasedOn ?? '';
    if (left === right) {
      return 0;
    }
    if (left === '') {
      return 1;
    }
    if (right === '') {
      return -1;
    }
    return right.localeCompare(left);
  });

  return { items, currencies: [...currencies] };
}

// 이미지 주소 가공은 클라이언트에서도 쓰므로 image.ts 로 옮겼다.
// 이 파일은 node:fs 를 import 하기 때문에 클라이언트에서 import 하면 빌드가 깨진다.
