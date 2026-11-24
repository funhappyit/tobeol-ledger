/**
 * 도감 데이터
 *
 * 수집 파일은 서버에서만 읽고, 화면에는 필요한 항목만 추려 내려보낸다.
 * 캐릭터 탭 건수는 거르기 전 전체를 기준으로 세야 해서 여기서 함께 계산한다.
 *
 * `counts=1` 은 건수만 받는 모드다.
 * 홈 화면은 캐릭터별 숫자만 필요한데, 그걸 위해 1만 건을 통째로 내려보내면
 * 응답이 수 MB가 된다(실제로 홈이 8MB 였다).
 *
 * `limit` 과 `offset` 은 도감을 두 번에 나눠 받기 위한 것이다.
 * 화면이 처음 그리는 카드는 120장인데 1만 1천 건을 함께 기다리게 하면
 * 첫 화면이 827KB 가 된다(실측). 먼저 120건만 보내고 나머지는 화면이 그려진 뒤에 받는다.
 */

import { ALL_CHARACTERS, countByCharacter, filterByCharacter, isKnownCharacter } from '@lib/items/dex';
import { packDexItems, toDexItem, type PackedDexItem } from '@lib/items/view';

export interface DexResponse {
  /** `counts=1` 로 부르면 빈 배열이다 */
  items: PackedDexItem[];
  /** 굿즈의 `img` 가 가리키는 이미지 주소 앞부분 */
  imageBases: string[];
  /** 캐릭터 코드별 건수. 탭 옆 숫자 */
  counts: Record<string, number>;
  /** 수집본에 섞인 통화. JPY 가 아니면 화면에서 경고한다 */
  currencies: string[];
  /** 거르기 전 전체 건수 */
  total: number;
}

/** 0 이상의 정수만 받는다. 그 밖의 값은 없는 것으로 친다 */
function toCount(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export default defineEventHandler(async (event): Promise<DexResponse> => {
  const query = getQuery(event);
  const character = typeof query.character === 'string' ? query.character : ALL_CHARACTERS;
  const countsOnly = query.counts === '1' || query.counts === 'true';
  const limit = toCount(query.limit);
  const offset = toCount(query.offset) ?? 0;

  if (!isKnownCharacter(character)) {
    throw createError({ statusCode: 404, statusMessage: '없는 캐릭터입니다' });
  }

  const { items, currencies } = await getItems();

  if (countsOnly) {
    return {
      items: [],
      imageBases: [],
      counts: Object.fromEntries(countByCharacter(items)),
      currencies,
      total: items.length,
    };
  }

  const picked = filterByCharacter(items, character);
  const sliced = limit === null ? picked.slice(offset) : picked.slice(offset, offset + limit);
  const packed = packDexItems(sliced.map(toDexItem));

  return {
    items: packed.items,
    imageBases: packed.imageBases,
    counts: Object.fromEntries(countByCharacter(items)),
    currencies,
    total: items.length,
  };
});
