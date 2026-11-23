/**
 * 도감 데이터
 *
 * 수집 파일은 서버에서만 읽고, 화면에는 필요한 항목만 추려 내려보낸다.
 * 캐릭터 탭 건수는 거르기 전 전체를 기준으로 세야 해서 여기서 함께 계산한다.
 *
 * `counts=1` 은 건수만 받는 모드다.
 * 홈 화면은 캐릭터별 숫자만 필요한데, 그걸 위해 1만 건을 통째로 내려보내면
 * 응답이 수 MB가 된다(실제로 홈이 8MB 였다).
 */

import { ALL_CHARACTERS, countByCharacter, filterByCharacter, isKnownCharacter } from '@lib/items/dex';
import { toDexItem, type DexItem } from '@lib/items/view';

export interface DexResponse {
  /** `counts=1` 로 부르면 빈 배열이다 */
  items: DexItem[];
  /** 캐릭터 코드별 건수. 탭 옆 숫자 */
  counts: Record<string, number>;
  /** 수집본에 섞인 통화. JPY 가 아니면 화면에서 경고한다 */
  currencies: string[];
  /** 거르기 전 전체 건수 */
  total: number;
}

export default defineEventHandler(async (event): Promise<DexResponse> => {
  const query = getQuery(event);
  const character = typeof query.character === 'string' ? query.character : ALL_CHARACTERS;
  const countsOnly = query.counts === '1' || query.counts === 'true';

  if (!isKnownCharacter(character)) {
    throw createError({ statusCode: 404, statusMessage: '없는 캐릭터입니다' });
  }

  const { items, currencies } = await getItems();

  return {
    items: countsOnly ? [] : filterByCharacter(items, character).map(toDexItem),
    counts: Object.fromEntries(countByCharacter(items)),
    currencies,
    total: items.length,
  };
});
