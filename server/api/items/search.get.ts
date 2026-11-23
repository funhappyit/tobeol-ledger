/**
 * 굿즈 검색
 *
 * 구매 기록 창에서 "이 주문에 굿즈를 더 담을" 때 쓴다.
 * 도감 전체(1만 건)를 창에 내려보내면 응답이 수 MB가 되므로, 검색어로 좁혀 몇 건만 준다.
 */

import { getItems } from '@lib/items/source';
import { toDexItem, type DexItem } from '@lib/items/view';

/** 한 번에 돌려줄 최대 건수. 고르는 데는 이 정도면 충분하다 */
const LIMIT = 20;

export default defineEventHandler(async (event): Promise<{ items: DexItem[] }> => {
  const query = getQuery(event);
  const term = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';

  if (term.length === 0) {
    return { items: [] };
  }

  const { items } = await getItems();
  const found: DexItem[] = [];

  for (const item of items) {
    const view = toDexItem(item);
    if (view.search.includes(term)) {
      found.push(view);
      if (found.length >= LIMIT) {
        break;
      }
    }
  }

  return { items: found };
});
