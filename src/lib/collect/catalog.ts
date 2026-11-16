/**
 * 카탈로그 일괄 조회
 *
 * 상품을 하나씩 `/products/{handle}.json` 으로 받으면 9천여 건 × 로케일 2개 = 1만 8천 번이라
 * 스토어에 부담이 크고 실제로 429 로 막힌다.
 *
 * 공식몰의 에이전트 정책(agents.md)이 안내하는 `/collections/all` 에는
 * 한 번에 최대 250건을 돌려주는 JSON 경로가 있다. 이쪽을 쓰면 전체를 40번 이내로 받는다.
 *
 *   GET /collections/all/products.json?limit=250&page=1      (일본어)
 *   GET /ko/collections/all/products.json?limit=250&page=1   (한국어)
 *
 * 응답 상품에는 개별 조회와 같은 필드(title, handle, tags, variants, images)가 들어 있다.
 * 다만 tags 가 문자열이 아니라 배열로 온다(파서는 두 형태를 모두 받는다).
 */

import { httpGet } from './http';
import type { ShopifyProduct } from './types';

/** 한 번에 받을 수 있는 최대 건수 (Shopify 상한) */
export const MAX_PAGE_SIZE = 250;

/** 로케일 코드를 경로 접두사로 바꾼다. 일본어(기본)는 접두사가 없다 */
function localePrefix(locale: string): string {
  if (!locale || locale === 'ja') {
    return '';
  }
  return `/${locale}`;
}

export function catalogPageUrl(
  origin: string,
  locale: string,
  page: number,
  limit = MAX_PAGE_SIZE,
): string {
  return `${origin}${localePrefix(locale)}/collections/all/products.json?limit=${limit}&page=${page}`;
}

/**
 * 카탈로그 한 페이지를 받는다.
 * 마지막 페이지를 넘어가면 빈 배열이 돌아온다.
 */
export async function fetchCatalogPage(
  origin: string,
  locale: string,
  page: number,
  limit = MAX_PAGE_SIZE,
): Promise<ShopifyProduct[]> {
  const result = await httpGet(catalogPageUrl(origin, locale, page, limit), { timeoutMs: 60000 });

  if (!result.ok) {
    throw new Error(`HTTP ${result.status} ${catalogPageUrl(origin, locale, page, limit)}`);
  }

  const body = JSON.parse(result.body) as { products?: ShopifyProduct[] };
  return body.products ?? [];
}

/** 상품 배열을 id 로 찾을 수 있게 만든다 */
export function indexById(products: ShopifyProduct[]): Map<number, ShopifyProduct> {
  const map = new Map<number, ShopifyProduct>();

  for (const product of products) {
    map.set(product.id, product);
  }

  return map;
}
