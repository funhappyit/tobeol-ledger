/**
 * 상품 상세 조회와 정규화
 *
 * 공식몰은 로케일별 경로(`/ko/products/...`)로 번역된 상품명·설명을 그대로 내려준다.
 * 덕분에 상품명을 따로 번역할 필요가 없다. 태그는 어느 로케일이든 일본어 원문이다.
 *
 * 주의: product_type 은 로케일마다 값이 다를 수 있다.
 * (같은 상품이 일본어에서는 `ぬいぐるみ`, 한국어에서는 `마스코트` 로 내려온 사례가 있다)
 * 그래서 종류 판정은 product_type 이 아니라 태그를 기준으로 한다.
 */

import { httpGet } from './http';
import { parseTags, splitTags } from './parse-tags';
import type { CollectedItem, ShopifyProduct } from './types';

/** 로케일 코드를 경로 접두사로 바꾼다. 일본어(기본)는 접두사가 없다 */
function localePrefix(locale: string): string {
  if (!locale || locale === 'ja') {
    return '';
  }
  return `/${locale}`;
}

/** 상품 1건 조회. 없는 상품(404)은 null */
export async function fetchProduct(
  origin: string,
  locale: string,
  handle: string,
): Promise<ShopifyProduct | null> {
  const url = `${origin}${localePrefix(locale)}/products/${encodeURIComponent(handle)}.json`;
  const result = await httpGet(url);

  if (result.status === 404) {
    return null;
  }

  const body = JSON.parse(result.body) as { product?: ShopifyProduct };
  return body.product ?? null;
}

/** 상품 설명 HTML 을 읽을 수 있는 평문으로 바꾼다 */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) {
    return null;
  }

  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text.length > 0 ? text : null;
}

/** variants 중 최저 정가(엔). 가격이 없으면 null */
export function pickListPriceJpy(product: ShopifyProduct): number | null {
  const prices = product.variants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return null;
  }

  return Math.min(...prices);
}

/** 대표 이미지. position 이 가장 앞선 것 */
export function pickImageUrl(product: ShopifyProduct): string | null {
  if (!product.images || product.images.length === 0) {
    return null;
  }

  const sorted = [...product.images].sort((a, b) => a.position - b.position);
  return sorted[0]?.src ?? null;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 로케일별 응답을 하나의 적재용 레코드로 합친다.
 * ko 가 기준이고 ja 는 있으면 일본어 상품명을 채우는 용도로만 쓴다.
 *
 * currency 는 수집을 시작할 때 확인한 활성 통화다.
 * 상품 JSON 자체에는 통화 정보가 없어서 호출하는 쪽이 넘겨줘야 한다.
 */
export function normalizeProduct(
  origin: string,
  ko: ShopifyProduct | null,
  ja: ShopifyProduct | null,
  currency: string | null,
): CollectedItem | null {
  const primary = ko ?? ja;
  if (!primary) {
    return null;
  }

  const tagsRaw = splitTags(primary.tags);
  const variantSku = trimOrNull(primary.variants[0]?.sku ?? null);
  // 이 스토어는 handle 이 JAN 코드인 경우가 많지만 항상은 아니다
  const handleAsJan = /^\d{8,14}$/.test(primary.handle) ? primary.handle : null;

  return {
    source: 'official',
    shopifyProductId: primary.id,
    handle: primary.handle,
    jan: variantSku ?? handleAsJan,
    nameKo: ko ? trimOrNull(ko.title) : null,
    nameJa: ja ? trimOrNull(ja.title) : null,
    descriptionKo: ko ? htmlToText(ko.body_html) : null,
    productTypeKo: ko ? trimOrNull(ko.product_type) : null,
    productTypeJa: ja ? trimOrNull(ja.product_type) : null,
    vendor: trimOrNull(primary.vendor),
    listPriceJpy: pickListPriceJpy(primary),
    listPriceCurrency: currency,
    imageUrl: pickImageUrl(primary),
    sourceUrl: `${origin}/products/${primary.handle}`,
    tagsRaw,
    parsed: parseTags(tagsRaw),
    updatedAt: primary.updated_at,
    collectedAt: new Date().toISOString(),
  };
}
