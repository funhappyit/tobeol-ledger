/**
 * 도감 화면용 조회 보조
 *
 * 캐릭터 탭은 URL 경로(`/dex/chiikawa`)로 나누고, 종류·검색은 화면에서 거른다.
 * 캐릭터를 경로로 둔 이유는 "치이카와 도감" 같은 단위가 공유·북마크의 기본 단위이기 때문이다.
 */

import type { CollectedItem } from '../collect/types';
import { CHARACTER_TAGS } from '../collect/vocab';

/** 전체 탭을 나타내는 코드. 캐릭터 코드와 겹치지 않는 값이어야 한다 */
export const ALL_CHARACTERS = 'all';

/**
 * 주요 캐릭터로 묶이지 않는 굿즈를 모으는 탭.
 * 등장 빈도가 낮은 캐릭터와, 캐릭터 태그가 아예 없는 굿즈(식품·지역 한정 등)가 여기로 온다.
 */
export const OTHER_CHARACTERS = 'others';

/**
 * 탭으로 따로 세울 캐릭터.
 * 공식몰 태그 사용 빈도가 높은 순이고, 여기에 없는 캐릭터는 "다른 친구들"로 합쳐진다.
 * 탭이 너무 많으면 고르기 어려워져서 일부러 끊었다.
 */
const MAIN_CHARACTERS = [
  'chiikawa',
  'hachiware',
  'usagi',
  'momonga',
  'rakko',
  'kurimanju',
  'shisa',
  'furuhonya',
];

/**
 * 탭 색.
 * 캐릭터를 글자뿐 아니라 색으로도 구분할 수 있게 한 것이라 의미 있는 값은 아니다.
 * 밝은 화면·어두운 화면 모두에서 쓰려고 바탕에는 이 색을 그대로 깔지 않고
 * 표면색과 섞어 쓴다(main.css 의 .dex-tab 참고).
 */
const TINTS: Record<string, string> = {
  [ALL_CHARACTERS]: '#b9b2a4',
  chiikawa: '#f3b6c6',
  hachiware: '#9fc9ea',
  usagi: '#f2cf72',
  momonga: '#c3bbe8',
  rakko: '#cbb196',
  kurimanju: '#a9cf9a',
  shisa: '#f0b478',
  furuhonya: '#e3a9a9',
  [OTHER_CHARACTERS]: '#92cdc5',
};

export interface DexTab {
  code: string;
  nameKo: string;
  /** 탭 배지에 넣을 한 글자 */
  short: string;
  href: string;
  tint: string;
}

/** 코드 -> 한국어 이름. 어휘표는 태그 기준이라 코드 기준으로 한 번 뒤집어 둔다 */
const NAME_BY_CODE = new Map<string, string>();
for (const def of Object.values(CHARACTER_TAGS)) {
  if (!NAME_BY_CODE.has(def.code)) {
    NAME_BY_CODE.set(def.code, def.nameKo);
  }
}

/** 탭으로 세우지 않고 "다른 친구들"로 합칠 캐릭터 코드 */
function minorCharacterCodes(): string[] {
  return [...NAME_BY_CODE.keys()].filter((code) => !MAIN_CHARACTERS.includes(code));
}

/** 경로로 쓸 수 있는 값인지. 모르는 경로로 들어오면 404 를 내기 위해 쓴다 */
export function isKnownCharacter(code: string): boolean {
  return code === ALL_CHARACTERS || code === OTHER_CHARACTERS || NAME_BY_CODE.has(code);
}

/** 탭에 세울 코드 전체. 전체 -> 주요 캐릭터 -> 다른 친구들 순 */
export function characterCodes(): string[] {
  return [...MAIN_CHARACTERS.filter((code) => NAME_BY_CODE.has(code)), OTHER_CHARACTERS];
}

export function characterTitle(code: string): string {
  if (code === ALL_CHARACTERS) {
    return '전체';
  }
  if (code === OTHER_CHARACTERS) {
    return '다른 친구들';
  }
  return NAME_BY_CODE.get(code) ?? code;
}

export function dexTabs(): DexTab[] {
  const make = (code: string): DexTab => {
    const nameKo = characterTitle(code);

    return {
      code,
      nameKo,
      // 배지에는 이름의 첫 글자를 쓴다
      short: [...nameKo][0] ?? '?',
      href: code === ALL_CHARACTERS ? '/dex' : `/dex/${code}`,
      tint: TINTS[code] ?? TINTS[OTHER_CHARACTERS]!,
    };
  };

  return [make(ALL_CHARACTERS), ...characterCodes().map(make)];
}

/** 이 굿즈가 "다른 친구들"에 속하는지. 주요 캐릭터가 하나도 안 붙은 경우다 */
function isOther(item: CollectedItem): boolean {
  return !item.parsed.characterCodes.some((code) => MAIN_CHARACTERS.includes(code));
}

/** 캐릭터로 거른다. 전체면 그대로 돌려준다 */
export function filterByCharacter(items: CollectedItem[], code: string): CollectedItem[] {
  if (code === ALL_CHARACTERS) {
    return items;
  }
  if (code === OTHER_CHARACTERS) {
    return items.filter(isOther);
  }

  return items.filter((item) => item.parsed.characterCodes.includes(code));
}

/** 탭 옆에 띄울 건수. 캐릭터 태그가 여러 개인 굿즈는 각 탭에 중복 집계된다 */
export function countByCharacter(items: CollectedItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  counts.set(ALL_CHARACTERS, items.length);

  for (const item of items) {
    for (const code of item.parsed.characterCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    if (isOther(item)) {
      counts.set(OTHER_CHARACTERS, (counts.get(OTHER_CHARACTERS) ?? 0) + 1);
    }
  }

  return counts;
}

/** "다른 친구들" 안에 실제로 들어 있는 캐릭터 이름들. 화면 설명문에 쓴다 */
export function minorCharacterNames(): string[] {
  return minorCharacterCodes().map((code) => NAME_BY_CODE.get(code) ?? code);
}
