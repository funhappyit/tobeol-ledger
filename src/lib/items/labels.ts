/**
 * 코드 -> 표시 이름
 *
 * 어휘표(vocab.ts)는 "일본어 태그 -> 코드" 방향이라 화면에서 쓰기 불편하다.
 * 화면은 코드만 들고 있으므로 반대 방향 표를 만들어 둔다.
 */

import type { ItemSource } from '../collect/types';
import {
  CATEGORY_NAME_KEYWORDS,
  CATEGORY_TAGS,
  CHARACTER_TAGS,
  MOGUMOGU_CATEGORY_TAGS,
  MOGUMOGU_PRODUCT_TYPES,
} from '../collect/vocab';

function invert(source: Record<string, { code: string; nameKo: string }>): Map<string, string> {
  const result = new Map<string, string>();

  for (const def of Object.values(source)) {
    if (!result.has(def.code)) {
      result.set(def.code, def.nameKo);
    }
  }

  return result;
}

const CHARACTER_NAMES = invert(CHARACTER_TAGS);
/**
 * 종류 이름은 스토어별 어휘표를 모두 합쳐 만든다.
 * 스토어마다 나오는 코드가 달라서 하나만 쓰면 필터 단추에 코드가 그대로 보인다.
 *   공식몰 태그          CATEGORY_TAGS
 *   포켓 스토어 상품명    CATEGORY_NAME_KEYWORDS (`clear_file` 등)
 *   모구모구 태그·품목    MOGUMOGU_* (`magnet`, `japanese_goods` 등)
 */
const CATEGORY_NAMES = invert({
  ...CATEGORY_TAGS,
  ...CATEGORY_NAME_KEYWORDS,
  ...MOGUMOGU_CATEGORY_TAGS,
  ...MOGUMOGU_PRODUCT_TYPES,
});

/** 스토어 이름. 도감 카드의 출처 배지에 쓴다 */
const SOURCE_NAMES: Record<ItemSource, string> = {
  official: '공식몰',
  pocket: '포켓',
  mogumogu: '모구모구',
};

/** 굿즈 출처의 표시 이름. 모르는 값이면 null */
/**
 * 스토어 이름. 공식몰도 이름 그대로 돌려준다.
 *
 * 카드 배지용인 `sourceName` 과 나눠 둔다. 그쪽은 공식몰일 때 일부러 null 을 주는데,
 * 이름이 필요한 자리에서 그걸 쓰면 `official` 이라는 코드가 화면에 그대로 나온다.
 */
export function storeName(source: ItemSource): string {
  return SOURCE_NAMES[source] ?? source;
}

/**
 * 카드 배지에 쓸 스토어 이름.
 *
 * 공식몰은 null 이다. 1만 건 중 대부분이 공식몰이라 배지를 달면 소음이 된다.
 * 이름 자체가 필요하면 `storeName` 을 쓴다.
 */
export function sourceName(source: ItemSource | undefined): string | null {
  if (!source || source === 'official') {
    return null;
  }

  return storeName(source);
}

/** 캐릭터 코드의 한국어 이름. 모르는 코드면 코드 그대로 */
export function characterName(code: string): string {
  return CHARACTER_NAMES.get(code) ?? code;
}

/** 종류 코드의 한국어 이름. 모르는 코드면 코드 그대로 */
export function categoryName(code: string): string {
  return CATEGORY_NAMES.get(code) ?? code;
}

/** 엔화 금액을 사람이 읽는 형태로 */
export function formatJpy(value: number | null): string {
  if (value === null) {
    return '가격 미정';
  }

  return `${value.toLocaleString('ko-KR')}엔`;
}

/** YYYY-MM-DD 를 "2022년 4월 23일" 로 */
export function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return null;
  }

  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
