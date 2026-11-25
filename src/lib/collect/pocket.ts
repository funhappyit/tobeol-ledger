/**
 * 포켓 굿즈 스토어 수집
 *
 * 대상: https://chiikawa-pocket-goods-store.com
 * 공식몰(치이카와 마켓)과는 별개 스토어다. 게임 「ちいかわぽけっと」 굿즈를 판다.
 *
 * ── 왜 상품 페이지를 하나씩 읽는가
 *
 * 이 스토어의 robots.txt 는 `/api/` 를 막고 있다. 상품 목록 페이지(`/products/`)는
 * 그 `/api/` 를 호출해서 그리기 때문에 HTML 에 상품 링크가 한 개도 없다.
 * 대신 sitemap.xml 에 상품 URL 전량이 실려 있으므로, 목록은 sitemap 에서 얻고
 * 상세는 상품 페이지 HTML 에서 읽는다. 금지된 경로는 건드리지 않는다.
 *
 *   robots.txt:  Disallow: /api/
 *                Sitemap: https://.../sitemap.xml
 *
 * ── 상품 페이지에서 무엇을 읽는가
 *
 * 각 상품 페이지에 검색엔진용 구조화 데이터(schema.org Product)가 들어 있다.
 * HTML 을 긁어 모으는 것이 아니라 이 JSON 을 그대로 쓴다. 화면 구조가 바뀌어도 깨지지 않는다.
 *
 * ── 공식몰과 다른 점
 *
 * 태그가 없다. 그래서 발매일·재입고·구매 제한·캐릭터·종류를 태그에서 뽑을 수 없다.
 * 다만 상품명이 규칙적이어서 캐릭터와 종류는 이름에서 판정할 수 있다.
 * 발매일은 어디에도 없으므로 null 로 둔다(추측해서 넣지 않는다).
 */

import { httpGet } from './http';
import { translatePocketName } from './pocket-name';
import type { CollectedItem, ParsedTags } from './types';
import { CATEGORY_NAME_KEYWORDS, CHARACTER_TAGS } from './vocab';

export const POCKET_ORIGIN = 'https://chiikawa-pocket-goods-store.com';

/**
 * 상품명에 붙는 시리즈 접두사.
 *
 * 이게 중요한 함정이다. 어느 접두사에도 캐릭터명 `ちいかわ` 가 들어 있어서,
 * 상품명 전체에서 캐릭터를 찾으면 전 상품이 "치이카와" 굿즈로 잡힌다.
 * 캐릭터를 찾기 전에 반드시 접두사를 떼어내야 한다.
 *
 * 새 시리즈가 나오면 여기에만 추가하면 된다. 긴 접두사가 짧은 접두사의
 * 앞부분을 공유할 수 있어(`ちいかわぽけっと`·`ちいかわクリスマスマーケット`)
 * 긴 것부터 맞춘다.
 */
const NAME_PREFIXES = ['ちいかわクリスマスマーケット', 'ちいかわぽけっと'].sort(
  (a, b) => b.length - a.length,
);

/** 페이지 제목 끝에 붙는 스토어 이름. `상품명 | 【公式】…` 형태다 */
const RE_TITLE_SUFFIX = /\s*[|｜]\s*【公式】.*$/;

const RE_OG = /<meta[^>]+property="og:([a-z:]+)"[^>]+content="([^"]*)"/g;

/** 상품 URL 의 handle 부분. 32자 16진수 */
const RE_HANDLE = /^\/products\/([0-9a-f]{32})\/?$/;

const RE_LOC = /<loc>([^<]+)<\/loc>/g;

const RE_JSON_LD = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

/** Shopify CDN 이미지 주소에 붙는 버전. 이미지가 올라간 시각(초) */
const RE_IMAGE_VERSION = /[?&]v=(\d{9,12})(?:&|$)/;

/** 구조화 데이터의 가격 정보 */
interface PocketOffer {
  price?: string | number;
  priceCurrency?: string;
}

/**
 * 상품 페이지의 schema.org 구조화 데이터 (쓰는 필드만).
 *
 * 두 가지 형태로 내려온다.
 *   Product      — 단품. 가격이 offers 에 바로 붙는다
 *   ProductGroup — 사이즈·색상 변형이 있는 상품. 가격은 hasVariant 안의 Product 마다 붙는다
 *
 * 변형을 따로 세지 않고 한 건으로 다룬다. 상품 주소가 하나뿐이라 handle 도 하나뿐이고
 * (토벌 기록이 handle 기준이다), 공식몰 수집도 variants 를 한 건으로 묶기 때문이다.
 */
export interface PocketProductLd {
  '@type'?: string;
  name?: string;
  description?: string;
  image?: string[] | string;
  url?: string;
  offers?: PocketOffer;
  /** ProductGroup 에만 있다. 상품 handle 과 같은 값 */
  productGroupID?: string;
  /** ProductGroup 의 변형 목록 */
  hasVariant?: { name?: string; offers?: PocketOffer }[];
  /** 무엇이 변형되는지. 예: `["サイズ"]` */
  variesBy?: string[];
}

/** 상품으로 받아들일 @type */
const PRODUCT_TYPES = new Set(['Product', 'ProductGroup']);

/** sitemap XML 에서 상품 URL 만 골라낸다. 안내·FAQ 같은 일반 페이지는 버린다 */
export function extractProductUrls(xml: string, origin: string = POCKET_ORIGIN): string[] {
  const host = new URL(origin).host;
  const seen = new Set<string>();
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  RE_LOC.lastIndex = 0;
  while ((match = RE_LOC.exec(xml)) !== null) {
    let url: URL;
    try {
      url = new URL(match[1].trim());
    } catch {
      continue;
    }

    if (url.host !== host || !RE_HANDLE.test(url.pathname)) {
      continue;
    }

    const normalized = `${origin}${url.pathname}`;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }

  return urls;
}

/** 상품 URL 에서 handle 을 뽑는다. 상품 URL 이 아니면 null */
export function handleFromUrl(url: string): string | null {
  try {
    const match = RE_HANDLE.exec(new URL(url).pathname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 상품 페이지 HTML 에서 상품 구조화 데이터를 꺼낸다.
 *
 * 한 페이지에 여러 JSON-LD 가 있을 수 있어(Organization, BreadcrumbList 등)
 * @type 이 Product 또는 ProductGroup 인 것만 고른다.
 *
 * 최상위만 본다. ProductGroup 안의 hasVariant 에도 Product 가 들어 있지만
 * 그것은 변형이지 별개 상품이 아니다.
 */
export function extractProductLd(html: string): PocketProductLd | null {
  let match: RegExpExecArray | null;

  RE_JSON_LD.lastIndex = 0;
  while ((match = RE_JSON_LD.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }

    // 배열로 여러 개를 한 블록에 담는 사이트도 있어서 평탄화해 둔다
    for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const type = (entry as PocketProductLd)['@type'];
      if (typeof type === 'string' && PRODUCT_TYPES.has(type)) {
        return entry as PocketProductLd;
      }
    }
  }

  return null;
}

/**
 * JSON-LD 가 없는 상품 페이지를 위한 대체 경로.
 *
 * 일부 시리즈(크리스마스 마켓 등)는 구조화 데이터가 없고 가격도 HTML 에 없다.
 * 가격은 robots.txt 가 막은 `/api/` 로만 내려오므로 가져오지 않는다.
 * 그래도 이름과 이미지는 og 메타태그에 있어서 도감에는 올릴 수 있다.
 * 정가는 null 로 남고 화면에는 "가격 미정"으로 나온다.
 */
export function extractOpenGraph(html: string): PocketProductLd | null {
  const og = new Map<string, string>();
  let match: RegExpExecArray | null;

  RE_OG.lastIndex = 0;
  while ((match = RE_OG.exec(html)) !== null) {
    if (!og.has(match[1])) {
      og.set(match[1], match[2]);
    }
  }

  // og:title 은 `상품명 | 【公式】스토어명` 형태다. 스토어명을 떼어낸다
  const title = (og.get('title') ?? '').replace(RE_TITLE_SUFFIX, '').trim();
  if (title.length === 0) {
    return null;
  }

  const image = og.get('image');

  return {
    '@type': 'Product',
    name: title,
    description: og.get('description'),
    image: image ? [image] : [],
    url: og.get('url'),
  };
}

/** 상품명에서 뽑아낸 분류 */
export interface PocketNameParts {
  /** 접두사와 괄호를 떼어낸 본문. 종류를 찾는 데 쓴다 */
  body: string;
  /** 괄호 안에 적힌 캐릭터 원문 */
  bracket: string | null;
  characterCodes: string[];
  categoryCodes: string[];
}

/** 종류 키워드를 긴 것부터. `ハンドタオル` 가 `タオル` 보다 먼저 걸려야 한다 */
const CATEGORY_KEYWORDS_BY_LENGTH = Object.keys(CATEGORY_NAME_KEYWORDS).sort(
  (a, b) => b.length - a.length,
);

/** 캐릭터 이름도 긴 것부터. 짧은 이름이 긴 이름의 일부인 경우를 피한다 */
const CHARACTER_NAMES_BY_LENGTH = Object.keys(CHARACTER_TAGS).sort((a, b) => b.length - a.length);

/**
 * 상품명을 분해한다.
 *
 * 예: `ちいかわぽけっと ピクニックなマスコット（ちいかわ）`
 *   접두사 = `ちいかわぽけっと`
 *   본문   = `ピクニックなマスコット`  -> 종류를 여기서 찾는다
 *   괄호   = `ちいかわ`                -> 캐릭터를 여기서 찾는다
 *
 * 캐릭터는 괄호 안에 적히는 것이 기본이고(변형별로 상품이 쪼개져 있다),
 * 괄호가 없으면 본문에서 찾는다. 접두사는 캐릭터 판정 전에 반드시 떼어낸다.
 */
export function parsePocketName(name: string): PocketNameParts {
  const prefix = NAME_PREFIXES.find((candidate) => name.startsWith(candidate));
  const withoutPrefix = (prefix ? name.slice(prefix.length) : name).trim();

  // 전각 괄호가 기본이지만 반각으로 적힌 것도 받는다.
  // 자를 위치(index)는 정규식을 돌린 그 문자열에서 센 값이므로, 자를 대상도 같은 문자열이어야 한다
  const bracketMatch = /[（(]([^）)]+)[）)]\s*$/.exec(withoutPrefix);
  const bracket = bracketMatch ? bracketMatch[1].trim() : null;
  const body = (bracketMatch ? withoutPrefix.slice(0, bracketMatch.index) : withoutPrefix).trim();

  // 괄호 안에 여러 캐릭터가 함께 적히는 경우가 있다
  const characterCodes = matchVocabulary(bracket ?? body, CHARACTER_NAMES_BY_LENGTH, (key) =>
    CHARACTER_TAGS[key].code,
  );

  const categoryCodes = matchVocabulary(body, CATEGORY_KEYWORDS_BY_LENGTH, (key) =>
    CATEGORY_NAME_KEYWORDS[key].code,
  );

  return { body, bracket, characterCodes, categoryCodes };
}

/**
 * 어휘표에서 문자열에 나오는 항목을 찾아 코드 목록으로 바꾼다.
 *
 * 맞춘 부분은 지워 가며 진행한다. 긴 키워드가 짧은 키워드를 품고 있을 때
 * (`ハンドタオル` 안에 `タオル` 가 있다) 둘 다 집히는 것을 막기 위한 것이다.
 * 키워드 목록이 긴 것부터 정렬돼 있어야 이 방식이 성립한다.
 */
function matchVocabulary(
  haystack: string,
  keywordsByLength: string[],
  toCode: (keyword: string) => string,
): string[] {
  let rest = haystack;
  const codes: string[] = [];

  for (const keyword of keywordsByLength) {
    if (!rest.includes(keyword)) {
      continue;
    }

    const code = toCode(keyword);
    if (!codes.includes(code)) {
      codes.push(code);
    }

    // 같은 키워드가 여러 번 나와도 모두 지운다
    rest = rest.split(keyword).join(' ');
  }

  return codes;
}

/** 이미지 주소의 버전 값을 시각으로. 발매일은 아니지만 최종 수정 시각의 근사치는 된다 */
function updatedAtFromImage(imageUrl: string | null): string | null {
  if (!imageUrl) {
    return null;
  }

  const match = RE_IMAGE_VERSION.exec(imageUrl);
  if (!match) {
    return null;
  }

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstImage(image: string[] | string | undefined): string | null {
  if (typeof image === 'string') {
    return image.trim() || null;
  }
  if (Array.isArray(image)) {
    const found = image.find((value) => typeof value === 'string' && value.trim().length > 0);
    return found ? found.trim() : null;
  }
  return null;
}

/** 가격 문자열을 엔으로. `"440.0"` -> 440 */
function toPriceJpy(price: string | number | undefined): number | null {
  if (price === undefined || price === null) {
    return null;
  }

  const value = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
}

/**
 * 정가(엔).
 * ProductGroup 은 가격이 변형마다 붙어 있어서 그중 최저가를 쓴다.
 * 공식몰 수집(variants 중 최저가)과 같은 기준이다.
 */
function pickListPriceJpy(ld: PocketProductLd): number | null {
  const direct = toPriceJpy(ld.offers?.price);
  if (direct !== null) {
    return direct;
  }

  const prices = (ld.hasVariant ?? [])
    .map((variant) => toPriceJpy(variant.offers?.price))
    .filter((price): price is number => price !== null);

  return prices.length > 0 ? Math.min(...prices) : null;
}

/** 통화. ProductGroup 은 변형에 붙어 있다 */
function pickCurrency(ld: PocketProductLd): string | null {
  if (ld.offers?.priceCurrency) {
    return ld.offers.priceCurrency;
  }

  for (const variant of ld.hasVariant ?? []) {
    if (variant.offers?.priceCurrency) {
      return variant.offers.priceCurrency;
    }
  }

  return null;
}

/**
 * 구조화 데이터를 적재용 레코드로 바꾼다.
 *
 * 포켓 스토어에 없는 정보는 추측하지 않고 null 로 둔다.
 *   발매일·재입고·예약일 — 어디에도 없다
 *   JAN·Shopify 상품 id — 페이지에 노출되지 않는다
 *   한국어 상품명·설명   — 이 스토어는 일본어만 제공한다
 */
export function normalizePocketItem(
  ld: PocketProductLd,
  options: { url?: string; origin?: string; collectedAt?: string } = {},
): CollectedItem | null {
  const origin = options.origin ?? POCKET_ORIGIN;
  const sourceUrl = (typeof ld.url === 'string' && ld.url) || options.url || null;
  // ProductGroup 은 handle 을 productGroupID 로도 들고 있다. 주소에서 못 읽으면 그쪽을 쓴다
  const handle =
    (sourceUrl ? handleFromUrl(sourceUrl) : null) ??
    (typeof ld.productGroupID === 'string' && /^[0-9a-f]{32}$/.test(ld.productGroupID)
      ? ld.productGroupID
      : null);
  const name = typeof ld.name === 'string' ? ld.name.trim() : '';

  if (!handle || name.length === 0) {
    return null;
  }

  const parts = parsePocketName(name);
  const imageUrl = firstImage(ld.image);
  const collectedAt = options.collectedAt ?? new Date().toISOString();

  const parsed: ParsedTags = {
    releasedOn: null,
    restockedOn: [],
    preorderOn: null,
    characterCodes: parts.characterCodes,
    categoryCodes: parts.categoryCodes,
    purchaseLimit: null,
    flags: [],
    // 종류를 못 찾은 상품명 본문을 남겨 둔다. 어휘표가 늘면 재수집 없이 다시 해석할 수 있다
    rest: parts.categoryCodes.length === 0 && parts.body.length > 0 ? [parts.body] : [],
  };

  return {
    source: 'pocket',
    shopifyProductId: null,
    handle,
    jan: null,
    // 이 스토어는 일본어 이름만 준다. 사전으로 옮긴 이름을 한국어 자리에 넣는다
    nameKo: translatePocketName(name),
    nameJa: name,
    descriptionKo: null,
    productTypeKo: null,
    productTypeJa: null,
    vendor: null,
    listPriceJpy: pickListPriceJpy(ld),
    listPriceCurrency: pickCurrency(ld),
    imageUrl,
    sourceUrl: sourceUrl ?? `${origin}/products/${handle}/`,
    // 재고를 확인할 길이 없다. 상품 페이지의 구조화 데이터(schema.org Product)에
    // availability 가 들어 있지 않고, 재고를 그리는 /api/ 는 robots.txt 가 막고 있다.
    // 모르는 것을 품절로 적으면 거짓이 되므로 null 로 둔다
    inStock: null,
    // 이 스토어는 태그를 제공하지 않는다. 빈 배열인 것이 정상이다
    tagsRaw: [],
    parsed,
    updatedAt: updatedAtFromImage(imageUrl) ?? collectedAt,
    collectedAt,
  };
}

/** sitemap 에서 상품 URL 전량을 받는다 */
export async function fetchPocketProductUrls(origin: string = POCKET_ORIGIN): Promise<string[]> {
  const result = await httpGet(`${origin}/sitemap.xml`, { timeoutMs: 60000 });

  if (!result.ok) {
    throw new Error(`HTTP ${result.status} ${origin}/sitemap.xml`);
  }

  return extractProductUrls(result.body, origin);
}

/** 상품 1건. 페이지가 없거나 구조화 데이터가 없으면 null */
export async function fetchPocketItem(
  url: string,
  origin: string = POCKET_ORIGIN,
): Promise<CollectedItem | null> {
  const result = await httpGet(url, { timeoutMs: 60000 });

  if (result.status === 404) {
    return null;
  }
  if (!result.ok) {
    throw new Error(`HTTP ${result.status} ${url}`);
  }

  // 구조화 데이터가 기본이고, 없는 페이지는 og 메타태그로 이름·이미지만 건진다
  const ld = extractProductLd(result.body) ?? extractOpenGraph(result.body);
  return ld ? normalizePocketItem(ld, { url, origin }) : null;
}
