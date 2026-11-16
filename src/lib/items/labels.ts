/**
 * 코드 -> 표시 이름
 *
 * 어휘표(vocab.ts)는 "일본어 태그 -> 코드" 방향이라 화면에서 쓰기 불편하다.
 * 화면은 코드만 들고 있으므로 반대 방향 표를 만들어 둔다.
 */

import { CATEGORY_TAGS, CHARACTER_TAGS } from '../collect/vocab';

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
const CATEGORY_NAMES = invert(CATEGORY_TAGS);

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
