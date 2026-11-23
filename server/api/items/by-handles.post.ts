/**
 * 표시해 둔 굿즈의 상세를 한꺼번에 받아온다
 *
 * 구매 기록 창에서 "같이 산 굿즈"를 고를 때 쓴다.
 * 체크한 굿즈는 도감의 여러 캐릭터에 흩어져 있어서 지금 보고 있는 화면의 목록만으로는 모자라다.
 *
 * GET 이 아니라 POST 인 이유는 handle 이 수백 개가 되면 주소 길이 제한에 걸리기 때문이다.
 */

import { toDexItem, type DexItem } from '@lib/items/view';

/** 한 번에 받을 수 있는 최대 개수. 이보다 많이 표시했다면 검색으로 좁히게 한다 */
const MAX_HANDLES = 500;

export default defineEventHandler(async (event): Promise<{ items: DexItem[] }> => {
  const body = await readBody<{ handles?: unknown }>(event);
  const requested = Array.isArray(body?.handles) ? body.handles : [];

  const handles = new Set(
    requested.filter((value): value is string => typeof value === 'string').slice(0, MAX_HANDLES),
  );

  if (handles.size === 0) {
    return { items: [] };
  }

  const { items } = await getItems();

  return {
    items: items.filter((item) => handles.has(item.handle)).map(toDexItem),
  };
});
