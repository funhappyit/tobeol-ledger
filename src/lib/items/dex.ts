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
 * 탭에 노출할 캐릭터 순서.
 * 공식몰 태그 사용 빈도가 높은 주요 캐릭터를 앞에 둔다.
 * 여기에 없는 캐릭터는 어휘표 등록 순서대로 뒤에 붙는다.
 */
const TAB_ORDER = [
  'chiikawa',
  'hachiware',
  'usagi',
  'momonga',
  'kurimanju',
  'rakko',
  'shisa',
  'yoroisan',
  'furuhonya',
  'anoko',
  'dekatsuyo',
];

export interface DexTab {
  code: string;
  nameKo: string;
  href: string;
}

/** 코드 -> 한국어 이름. 어휘표는 태그 기준이라 코드 기준으로 한 번 뒤집어 둔다 */
const NAME_BY_CODE = new Map<string, string>();
for (const def of Object.values(CHARACTER_TAGS)) {
  if (!NAME_BY_CODE.has(def.code)) {
    NAME_BY_CODE.set(def.code, def.nameKo);
  }
}

/** 어휘표에 있는 캐릭터 코드 전체를 탭 순서대로 */
export function characterCodes(): string[] {
  const known = [...NAME_BY_CODE.keys()];
  const ordered = TAB_ORDER.filter((code) => NAME_BY_CODE.has(code));
  const rest = known.filter((code) => !ordered.includes(code));

  return [...ordered, ...rest];
}

/** 우리가 아는 캐릭터 코드인지. 모르는 경로로 들어오면 404 를 내기 위해 쓴다 */
export function isKnownCharacter(code: string): boolean {
  return code === ALL_CHARACTERS || NAME_BY_CODE.has(code);
}

/** 탭 목록. 맨 앞은 항상 전체 */
export function dexTabs(): DexTab[] {
  return [
    { code: ALL_CHARACTERS, nameKo: '전체', href: '/dex' },
    ...characterCodes().map((code) => ({
      code,
      nameKo: NAME_BY_CODE.get(code) ?? code,
      href: `/dex/${code}`,
    })),
  ];
}

/** 탭 제목에 쓸 이름 */
export function characterTitle(code: string): string {
  if (code === ALL_CHARACTERS) {
    return '전체';
  }
  return NAME_BY_CODE.get(code) ?? code;
}

/** 캐릭터로 거른다. 전체면 그대로 돌려준다 */
export function filterByCharacter(items: CollectedItem[], code: string): CollectedItem[] {
  if (code === ALL_CHARACTERS) {
    return items;
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
  }

  return counts;
}

/** 화면에 띄울 종류 필터 후보. 실제로 쓰인 종류만 건수 많은 순으로 */
export function categoryOptions(items: CollectedItem[]): { code: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    for (const code of item.parsed.categoryCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 검색용 문자열.
 * 한국어명·일본어명·원본 태그를 합쳐서 "ちいかわ" 로도 "치이카와" 로도 찾히게 한다.
 */
export function searchHaystack(item: CollectedItem): string {
  return [item.nameKo, item.nameJa, item.handle, ...item.tagsRaw]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}
