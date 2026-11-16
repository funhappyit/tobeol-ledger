/**
 * 공식몰 sitemap 에서 전체 상품 handle 목록을 얻는다.
 *
 * 상품 목록 일괄 조회(`/products.json`)는 레이트리밋으로 막혀 있어서,
 * sitemap 으로 목록만 받고 상세는 상품별로 따로 조회한다.
 *
 * sitemap 인덱스에는 /en/, /ko/ 같은 로케일별 사본도 함께 들어 있다.
 * handle 은 로케일과 무관하게 같으므로 기본(일본어) 경로만 읽는다.
 */

import { httpGet } from './http';

const RE_LOC = /<loc>([^<]+)<\/loc>/g;

/** XML 엔티티를 되돌린다 */
function unescapeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractLocs(xml: string): string[] {
  const result: string[] = [];
  let match: RegExpExecArray | null;

  RE_LOC.lastIndex = 0;
  while ((match = RE_LOC.exec(xml)) !== null) {
    result.push(unescapeXml(match[1]));
  }

  return result;
}

/** sitemap 인덱스에서 기본 로케일의 상품 sitemap URL만 골라낸다 */
export async function fetchProductSitemapUrls(origin: string): Promise<string[]> {
  const xml = (await httpGet(`${origin}/sitemap.xml`)).body;
  const base = new URL(origin);

  return extractLocs(xml).filter((loc) => {
    const url = new URL(loc);
    if (url.host !== base.host) {
      return false;
    }
    // `/sitemap_products_1.xml` 은 받고 `/ko/sitemap_products_1.xml` 은 거른다
    return /^\/sitemap_products_\d+\.xml$/.test(url.pathname);
  });
}

/** 상품 sitemap 하나에서 handle 목록을 뽑는다 */
export async function fetchHandlesFromSitemap(sitemapUrl: string): Promise<string[]> {
  const xml = (await httpGet(sitemapUrl)).body;
  const handles: string[] = [];

  for (const loc of extractLocs(xml)) {
    const url = new URL(loc);
    const match = /^\/products\/(.+)$/.exec(url.pathname);
    if (match) {
      handles.push(decodeURIComponent(match[1]));
    }
  }

  return handles;
}

/**
 * 전체 상품 handle 목록. sitemap 사이에는 간격을 두고 요청한다.
 * 중복은 제거하고 sitemap 에 실린 순서를 유지한다.
 */
export async function fetchAllProductHandles(
  origin: string,
  onProgress?: (done: number, total: number) => void,
  throttle?: () => Promise<void>,
): Promise<string[]> {
  const sitemapUrls = await fetchProductSitemapUrls(origin);
  const seen = new Set<string>();
  const handles: string[] = [];

  for (let i = 0; i < sitemapUrls.length; i += 1) {
    if (throttle) {
      await throttle();
    }

    for (const handle of await fetchHandlesFromSitemap(sitemapUrls[i])) {
      if (!seen.has(handle)) {
        seen.add(handle);
        handles.push(handle);
      }
    }

    if (onProgress) {
      onProgress(i + 1, sitemapUrls.length);
    }
  }

  return handles;
}
