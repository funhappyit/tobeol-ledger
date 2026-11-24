/**
 * 치이카와 모구모구 본포 수집
 *
 * 공식몰과 같은 Shopify 스토어라 상품 JSON(`/collections/all/products.json`)을 그대로 받는다.
 * 680건이 요청 3번에 들어온다. 포켓 스토어처럼 상품마다 페이지를 긁을 필요가 없다.
 *
 * 공식몰 수집기(product.ts)를 그대로 쓰지 못하는 이유는 붙이는 말이 다르기 때문이다.
 *
 *   1. 발매일 태그가 자연어다.
 *      공식몰   `20261127`
 *      모구모구 `2026年11月13日発売商品`, `2025年9月12日 発売商品`, `2025年3月20日 新着商品`
 *      전각 공백·반각 공백·공백 없음이 섞이고 `発売`/`新着` 두 가지가 쓰인다.
 *
 *   2. 한국어 로케일이 없다(`/ko/` 가 404). 상품명을 사전으로 번역한다(mogumogu-name.ts).
 *
 *   3. product_type 을 종류 판정에 쓸 수 있다.
 *      공식몰은 로케일마다 값이 달라 못 믿었지만, 이 스토어는 일본어 하나뿐이라
 *      품목어(`箸置き`, `ミニお守り`)가 그대로 들어 있다. 태그보다 또렷해서 먼저 본다.
 *
 * 지역(`伏見稲荷`·`川越`·`小樽`)은 분류로 만들지 않고 rest 로 흘려보낸다.
 * tagsRaw 에 원문이 남아 도감 검색으로는 그대로 걸린다.
 */

import { fetchCatalogPage, MAX_PAGE_SIZE } from './catalog';
import { toIsoDate, splitTags } from './parse-tags';
import { pickImageUrl, pickListPriceJpy } from './product';
import { translateMogumoguName } from './mogumogu-name';
import {
  CATEGORY_TAGS,
  CHARACTER_TAGS,
  FLAG_TAGS,
  MOGUMOGU_CATEGORY_TAGS,
  MOGUMOGU_CHARACTER_TAGS,
  MOGUMOGU_FLAG_TAGS,
  MOGUMOGU_PRODUCT_TYPES,
} from './vocab';
import type { CollectedItem, ParsedTags, ShopifyProduct } from './types';

export const MOGUMOGU_ORIGIN = 'https://chiikawamogumogu.shop';

/**
 * 발매일 태그.
 *
 * `2026年11月13日発売商品` / `2025年9月12日 発売商品` / `2025年3月20日 新着商品`
 * 날짜와 `発売`·`新着` 사이 공백은 있을 때도 없을 때도 있고, 전각일 때도 있다
 * (자바스크립트의 `\s` 는 전각 공백 U+3000 도 잡는다).
 */
const RE_RELEASE_TAG = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(?:発売|新着)商品$/;

/** 캐릭터 표기는 공식몰 어휘에 모구모구 전용을 얹어 쓴다 */
const CHARACTERS: Record<string, { code: string }> = {
  ...CHARACTER_TAGS,
  ...MOGUMOGU_CHARACTER_TAGS,
};

const CATEGORIES: Record<string, { code: string }> = {
  ...CATEGORY_TAGS,
  ...MOGUMOGU_CATEGORY_TAGS,
};

const FLAGS: Record<string, string> = {
  ...FLAG_TAGS,
  ...MOGUMOGU_FLAG_TAGS,
};

/**
 * 발매일 태그를 `YYYY-MM-DD` 로. 태그 꼴이 아니거나 달력에 없는 날짜면 null.
 *
 * 스토어 원문에 `2025年20月20日 新着商品`(20월) 이 76건 있다.
 * 컬렉션 이름(`new2025-02-20`)으로 보면 2월 20일의 오타지만, 추측해서 고치지 않는다.
 * 날짜를 못 읽은 상품은 발매일 없이 두고, 태그 원문은 rest 에 남는다.
 */
export function parseReleaseTag(tag: string): string | null {
  const match = RE_RELEASE_TAG.exec(tag);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return toIsoDate(`${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`);
}

/**
 * 태그와 product_type 을 구조화 정보로 바꾼다.
 *
 * 공식몰(parse-tags.ts)과 나눠 둔 이유는 날짜 꼴과 어휘가 겹치지 않기 때문이다.
 * 재입고·예약·구매수량 제한 태그는 이 스토어에 없어서 비워 둔다.
 */
export function parseMogumoguTags(
  tags: string | string[] | null | undefined,
  productType?: string | null,
): ParsedTags {
  const list = splitTags(tags);

  const releaseDates: string[] = [];
  const characterCodes: string[] = [];
  const categoryCodes: string[] = [];
  const flags: string[] = [];
  const rest: string[] = [];

  // product_type 이 태그보다 품목이 또렷하다. 먼저 넣어 대표 종류가 되게 한다
  const byProductType = productType ? MOGUMOGU_PRODUCT_TYPES[productType.trim()] : undefined;
  if (byProductType) {
    categoryCodes.push(byProductType.code);
  }

  for (const tag of list) {
    const released = parseReleaseTag(tag);
    if (released) {
      releaseDates.push(released);
      continue;
    }

    const character = CHARACTERS[tag];
    if (character) {
      if (!characterCodes.includes(character.code)) {
        characterCodes.push(character.code);
      }
      continue;
    }

    const category = CATEGORIES[tag];
    if (category) {
      if (!categoryCodes.includes(category.code)) {
        categoryCodes.push(category.code);
      }
      continue;
    }

    const flag = FLAGS[tag];
    if (flag) {
      if (!flags.includes(flag)) {
        flags.push(flag);
      }
      continue;
    }

    // 지역·모티프 태그(`川越`, `おいも`, `和装`)와 읽지 못한 날짜가 여기로 온다.
    // 버리지 않으므로 어휘가 늘면 재수집 없이 다시 해석할 수 있다
    rest.push(tag);
  }

  releaseDates.sort();

  return {
    releasedOn: releaseDates.length > 0 ? releaseDates[0] : null,
    restockedOn: [],
    preorderOn: null,
    characterCodes,
    categoryCodes,
    purchaseLimit: null,
    flags,
    rest,
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 상품 JSON 한 건을 적재용 레코드로 바꾼다.
 *
 * `currency` 는 수집을 시작할 때 `/meta.json` 으로 확인한 스토어 통화다.
 * 상품 JSON 에는 통화 표시가 없어서 호출하는 쪽이 넘겨줘야 한다(공식몰과 같다).
 */
export function normalizeMogumoguProduct(
  product: ShopifyProduct,
  currency: string | null,
  options: { origin?: string; collectedAt?: string } = {},
): CollectedItem | null {
  const origin = options.origin ?? MOGUMOGU_ORIGIN;
  const handle = trimOrNull(product.handle);
  const nameJa = trimOrNull(product.title);

  if (!handle || !nameJa) {
    return null;
  }

  const tagsRaw = splitTags(product.tags);
  const sku = trimOrNull(product.variants?.[0]?.sku ?? null);

  return {
    source: 'mogumogu',
    shopifyProductId: product.id,
    handle,
    // 이 스토어의 sku 는 `CHTH-0089` 꼴 자체 품번이라 JAN 이 아니다.
    // 숫자만으로 된 sku 가 나오면 그때만 JAN 으로 본다
    jan: sku && /^\d{8,14}$/.test(sku) ? sku : null,
    nameKo: translateMogumoguName(nameJa),
    nameJa,
    // 상품 설명도 일본어뿐이다. 번역 사전은 상품명 기준이라 설명에 쓰면 어설픈 한국어가 된다.
    // 화면에 싣지 않는 값이기도 해서(items/view.ts) 비워 둔다. 자세한 내용은 sourceUrl 에 있다
    descriptionKo: null,
    productTypeKo: null,
    productTypeJa: trimOrNull(product.product_type),
    vendor: trimOrNull(product.vendor),
    listPriceJpy: pickListPriceJpy(product),
    listPriceCurrency: currency,
    imageUrl: pickImageUrl(product),
    sourceUrl: `${origin}/products/${handle}`,
    tagsRaw,
    parsed: parseMogumoguTags(tagsRaw, product.product_type),
    updatedAt: product.updated_at,
    collectedAt: options.collectedAt ?? new Date().toISOString(),
  };
}

/**
 * 카탈로그를 끝까지 받는다.
 * 빈 페이지가 오면 끝이고, 안전장치로 최대 페이지 수를 둔다.
 */
export async function fetchAllMogumoguProducts(
  options: { origin?: string; maxPages?: number; onPage?: (page: number, count: number) => void } = {},
): Promise<ShopifyProduct[]> {
  const origin = options.origin ?? MOGUMOGU_ORIGIN;
  const maxPages = options.maxPages ?? 20;
  const products: ShopifyProduct[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchCatalogPage(origin, 'ja', page, MAX_PAGE_SIZE);
    options.onPage?.(page, batch.length);

    if (batch.length === 0) {
      break;
    }

    products.push(...batch);

    if (batch.length < MAX_PAGE_SIZE) {
      break;
    }
  }

  return products;
}
