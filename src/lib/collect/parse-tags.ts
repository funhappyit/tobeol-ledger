/**
 * 공식몰 태그 문자열을 구조화 정보로 변환한다.
 *
 * 태그 예시:
 *   "20220423, PC・スマホグッズ, ちいかわ, ぬいぐるみ, マスコット"
 *   "RE20261008, PRE20261127, 2個/1会計, 海外NG, シーサー祭り"
 *
 * 분류에 실패한 태그는 버리지 않고 rest 에 원문 그대로 남긴다.
 * 어휘표(vocab.ts)가 늘어나도 재수집 없이 다시 해석할 수 있어야 하기 때문이다.
 */

import { CATEGORY_TAGS, CHARACTER_TAGS, FLAG_TAGS } from './vocab';
import type { ParsedTags } from './types';

const RE_RELEASE = /^(\d{8})$/;
const RE_RESTOCK = /^RE(\d{8})$/;
const RE_PREORDER = /^PRE(\d{8})$/;
/** 예: `2個/1会計` — 1회계당 구매 가능 수량 */
const RE_PURCHASE_LIMIT = /^(\d+)個\/1会計$/;

/**
 * `YYYYMMDD` 를 `YYYY-MM-DD` 로 바꾼다.
 * 실제 달력에 없는 날짜(예: 20261352)는 null 을 돌려준다.
 */
export function toIsoDate(yyyymmdd: string): string | null {
  if (!/^\d{8}$/.test(yyyymmdd)) {
    return null;
  }

  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // 2월 30일 같은 값을 걸러내기 위해 실제 Date 로 되돌려 확인한다
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** 태그 원문을 배열로 정규화한다. Shopify 는 문자열 또는 배열로 내려준다 */
export function splitTags(tags: string | string[] | null | undefined): string[] {
  if (!tags) {
    return [];
  }

  const list = Array.isArray(tags) ? tags : tags.split(',');

  return list.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}

/** 태그 배열을 구조화 정보로 변환한다 */
export function parseTags(tags: string | string[] | null | undefined): ParsedTags {
  const list = splitTags(tags);

  const releaseDates: string[] = [];
  const restockedOn: string[] = [];
  const characterCodes: string[] = [];
  const categoryCodes: string[] = [];
  const flags: string[] = [];
  const rest: string[] = [];
  let preorderOn: string | null = null;
  let purchaseLimit: number | null = null;

  for (const tag of list) {
    const restock = RE_RESTOCK.exec(tag);
    if (restock) {
      const iso = toIsoDate(restock[1]);
      if (iso) {
        restockedOn.push(iso);
        continue;
      }
    }

    const preorder = RE_PREORDER.exec(tag);
    if (preorder) {
      const iso = toIsoDate(preorder[1]);
      if (iso) {
        // 예정일이 여러 개면 가장 이른 것을 쓴다
        if (preorderOn === null || iso < preorderOn) {
          preorderOn = iso;
        }
        continue;
      }
    }

    const release = RE_RELEASE.exec(tag);
    if (release) {
      const iso = toIsoDate(release[1]);
      if (iso) {
        releaseDates.push(iso);
        continue;
      }
    }

    const limit = RE_PURCHASE_LIMIT.exec(tag);
    if (limit) {
      const value = Number(limit[1]);
      // 제한이 여러 개면 더 엄격한(작은) 쪽을 남긴다
      if (purchaseLimit === null || value < purchaseLimit) {
        purchaseLimit = value;
      }
      continue;
    }

    const character = CHARACTER_TAGS[tag];
    if (character) {
      if (!characterCodes.includes(character.code)) {
        characterCodes.push(character.code);
      }
      continue;
    }

    const category = CATEGORY_TAGS[tag];
    if (category) {
      if (!categoryCodes.includes(category.code)) {
        categoryCodes.push(category.code);
      }
      continue;
    }

    const flag = FLAG_TAGS[tag];
    if (flag) {
      if (!flags.includes(flag)) {
        flags.push(flag);
      }
      continue;
    }

    rest.push(tag);
  }

  releaseDates.sort();
  restockedOn.sort();

  return {
    releasedOn: releaseDates.length > 0 ? releaseDates[0] : null,
    restockedOn,
    preorderOn,
    characterCodes,
    categoryCodes,
    purchaseLimit,
    flags,
    rest,
  };
}
