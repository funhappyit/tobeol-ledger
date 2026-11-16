/**
 * 수집 시점의 활성 통화 확인
 *
 * 공식몰은 Shopify Markets 를 쓰기 때문에 같은 URL 이라도 요청한 쪽의 지역에 따라
 * 가격을 다른 통화로 내려준다. 그런데 상품 JSON(`/products/{handle}.json`)에는
 * 통화 표시가 전혀 없어서, 응답만 보고는 1430 이 엔인지 원인지 구분할 수 없다.
 *
 * 실제로 같은 상품이 어떤 때는 1430(엔), 어떤 때는 14100(원)으로 내려온 것을 확인했다.
 * 정가(엔)는 플미 계산의 기준값이라 통화가 섞이면 결과 전체가 무의미해진다.
 *
 * 다행히 스토어프론트 HTML 에는 활성 통화가 박혀 있다:
 *   Shopify.currency = {"active":"JPY","rate":"1.0"};
 *
 * 그래서 수집을 시작하기 전에 이 값을 읽어 JPY 인지 확인하고, 아니면 수집을 멈춘다.
 */

import { fetchWithRetry } from './http';

const RE_SHOPIFY_CURRENCY = /Shopify\.currency\s*=\s*(\{[^}]*\})/;

/** 스토어프론트 HTML 에서 활성 통화 코드를 뽑는다. 못 찾으면 null */
export function parseActiveCurrency(html: string): string | null {
  const match = RE_SHOPIFY_CURRENCY.exec(html);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as { active?: unknown };
    if (typeof parsed.active === 'string' && /^[A-Z]{3}$/.test(parsed.active)) {
      return parsed.active;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 지금 이 환경에서 공식몰이 어떤 통화로 응답하는지 확인한다.
 * 상품 1건의 페이지만 받으면 되므로 수집 1회당 한 번만 호출한다.
 */
export async function fetchActiveCurrency(origin: string, probeHandle: string): Promise<string | null> {
  // 확인에 실패하면 null 을 돌려준다. 호출하는 쪽에서 "통화를 확인하지 못했다"로 다루고
  // 수집을 멈추면 되므로, 여기서 예외를 던져 올릴 이유가 없다.
  try {
    const response = await fetchWithRetry(`${origin}/products/${encodeURIComponent(probeHandle)}`);

    if (!response.ok) {
      return null;
    }

    return parseActiveCurrency(await response.text());
  } catch {
    return null;
  }
}
