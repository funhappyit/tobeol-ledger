/**
 * 수집 시점의 통화 확인
 *
 * 공식몰은 Shopify Markets 를 쓰기 때문에 같은 URL 이라도 요청한 쪽의 지역에 따라
 * 가격을 다른 통화로 내려준다. 그런데 상품 JSON(`/products/{handle}.json`)에는
 * 통화 표시가 전혀 없어서, 응답만 보고는 1430 이 엔인지 원인지 구분할 수 없다.
 *
 * 실제로 같은 상품이 어떤 때는 1430(엔), 어떤 때는 14100(원)으로 내려온 것을 확인했다.
 * 정가(엔)는 플미 계산의 기준값이라 통화가 섞이면 결과 전체가 무의미해진다.
 *
 * 확인 방법이 둘 있는데 비용 차이가 크다.
 *
 * 1. `/meta.json` — 수백 바이트. 스토어 자체 통화(`"currency":"JPY"`)를 준다.
 *    빠르고 안정적이라 매 수집마다 돌린다.
 * 2. 상품 페이지 HTML 의 `Shopify.currency = {"active":"JPY","rate":"1.0"}`
 *    — 지금 이 요청에 실제로 적용된 표시 통화라 더 정확하지만 페이지가 700KB 가 넘는다.
 *    매번 받기에는 너무 무거워서(실제로 타임아웃으로 수집이 막혔다) 선택 옵션으로 둔다.
 */

import { httpGet } from './http';

const RE_SHOPIFY_CURRENCY = /Shopify\.currency\s*=\s*(\{[^}]*\})/;

/** 스토어프론트 HTML 에서 표시 통화 코드를 뽑는다. 못 찾으면 null */
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

/** `/meta.json` 응답에서 스토어 통화를 뽑는다 */
export function parseShopCurrency(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const currency = (body as { currency?: unknown }).currency;
  if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) {
    return currency;
  }

  return null;
}

/**
 * 스토어 자체 통화. `/meta.json` 은 수백 바이트라 매 수집마다 불러도 부담이 없다.
 * 확인에 실패하면 null 을 돌려주고, 호출하는 쪽에서 수집을 멈추면 된다.
 */
export async function fetchShopCurrency(origin: string): Promise<string | null> {
  try {
    const result = await httpGet(`${origin}/meta.json`, { retries: 2 });

    if (!result.ok) {
      return null;
    }

    return parseShopCurrency(JSON.parse(result.body));
  } catch {
    return null;
  }
}

/**
 * 지금 이 요청에 적용된 표시 통화. 상품 페이지 HTML 을 통째로 받아야 해서 느리다.
 * 지역에 따른 통화 전환까지 확인하고 싶을 때만 쓴다.
 */
export async function fetchPresentmentCurrency(
  origin: string,
  probeHandle: string,
): Promise<string | null> {
  try {
    // 700KB 가 넘는 페이지라 기본 타임아웃(20초)으로는 모자란다
    const result = await httpGet(`${origin}/products/${encodeURIComponent(probeHandle)}`, {
      retries: 2,
      timeoutMs: 90000,
    });

    if (!result.ok) {
      return null;
    }

    return parseActiveCurrency(result.body);
  } catch {
    return null;
  }
}
