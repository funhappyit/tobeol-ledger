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

/**
 * 스토어별 상품 상세 주소의 앞부분.
 *
 * 세 스토어 모두 `{앞부분}/products/{handle}` 꼴이다. 공식몰만 한국어 경로(`/ko`)가 있고,
 * 모구모구는 일본어뿐이며 포켓은 Shopify 가 아니지만 경로 모양은 같다.
 *
 * 스토어 사실을 이 파일에 모아 둔다. 화면마다 주소를 박으면 스토어가 하나 늘 때
 * 고칠 자리를 찾아다니게 된다.
 */
const STORE_ORIGINS: Record<ItemSource, string> = {
  official: 'https://chiikawamarket.jp/ko',
  pocket: 'https://chiikawa-pocket-goods-store.com',
  mogumogu: 'https://chiikawamogumogu.shop',
};

/**
 * 굿즈의 스토어 상세 주소.
 *
 * 응답에 주소를 싣지 않고 여기서 만든다. `source` 와 `handle` 은 화면이 이미 들고 있고,
 * 1만 1천 건에 주소를 실으면 그것만으로 응답이 수백 KB 늘어난다.
 * 이미지 주소를 접두어 사전으로 쪼개 둔 것과 같은 이유다(view.ts 의 packDexItems).
 *
 * `source` 가 없으면 공식몰이다(DexItem 참고). 모르는 출처면 null 을 주고,
 * 카드는 링크를 걸지 않는다. 짐작한 주소로 내보내면 엉뚱한 곳으로 보내게 된다.
 */
export function storeProductUrl(
  source: ItemSource | undefined,
  handle: string | null | undefined,
): string | null {
  if (!handle) {
    return null;
  }

  const origin = STORE_ORIGINS[source ?? 'official'];
  if (!origin) {
    return null;
  }

  // handle 에 경로에서 뜻을 갖는 글자가 섞여 있어도 그대로 나가지 않게 한다
  return `${origin}/products/${encodeURIComponent(handle)}`;
}

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

/**
 * 재고를 언제 본 값인지. `11/25 16:13` 꼴.
 *
 * 도감 필터 안내와 카드 알약이 같은 글자를 써야 해서 한곳에 둔다.
 * 수집 주기가 30분~한 달이라 "지금"이라고 말할 수 없으니, 언제 본 값인지 늘 함께 밝힌다.
 *
 * ── 시간대를 한국으로 못박는 이유
 *
 * 예전에는 `date.getHours()` 를 썼다. 그 값은 코드가 도는 기계의 시간대를 따른다.
 * Vercel 은 UTC 로 돌아서, 서버가 렌더한 /dex 에는 `11/25 7시` 가 박히고
 * 브라우저는 같은 자리를 `11/25 16시` 로 다시 그렸다. 하이드레이션에서 9시간이 튀었다.
 *
 * 한국어 도감이라 한국 시각으로 읽는 것이 맞고, 무엇보다 서버와 브라우저가
 * 같은 글자를 내야 한다. 그래서 Asia/Seoul 로 고정한다.
 *
 * ── 분까지 적는 이유
 *
 * 공식몰 재고를 30분마다 받는다. `시` 단위로 적으면 16:13 과 16:43 이 똑같이
 * `16시` 가 되어, 30분 주기로 만든 의미가 글자에서 사라진다.
 *
 * hourCycle 을 h23 으로 못박는다. 이것을 두지 않으면 엔진에 따라 자정이
 * `24:00` 으로 나온다.
 */
const CHECKED_AT_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatCheckedAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts: Record<string, string> = {};
  for (const part of CHECKED_AT_FORMAT.formatToParts(date)) {
    parts[part.type] = part.value;
  }

  // 월·일은 앞의 0 을 떼고, 시·분은 두 자리로 둔다. `11/25 16:13`
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}
