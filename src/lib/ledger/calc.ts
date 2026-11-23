/**
 * 플미(프리미엄) 계산
 *
 * 이 프로젝트의 본체다. "정가보다 얼마나 더 썼는가"를 숫자로 만든다.
 *
 * 단위는 "한 번의 구매"다. 굿즈 여러 개를 한 번에 사고 배송비는 한 번 붙기 때문이다.
 * 굿즈마다 배송비를 두면 3개를 한 번에 샀을 때 3등분하거나 한 곳에 몰아넣어야 하고,
 * 어느 쪽이든 틀린 숫자가 된다.
 *
 * 두 가지를 분리해서 본다.
 *   플미  — 상품값만 정가와 견준다. 배송비·수수료는 뺀다
 *   총지출 — 실제로 나간 돈 전부
 *
 * 배송비와 대행수수료를 플미에 합치면 프리미엄이 과장된다.
 * 배대지를 거쳐 정가에 샀는데도 "30% 웃돈 줬다"로 보이면 기록의 의미가 없다.
 *
 * 정가와 환율은 구매 시점 값을 복사해 둔 것을 쓴다(스냅샷).
 * 지금 환율로 과거 기록을 다시 계산하면, 아무것도 안 했는데 플미율이 흔들린다.
 */

/** 구매처. 중고·공구는 플미가 붙고, 공식몰은 보통 정가다 */
export const SOURCES = {
  official: '공식몰',
  danggeun: '당근마켓',
  bunjang: '번개장터',
  groupbuy: '공동구매',
  other: '그 외',
} as const;

export type SourceCode = keyof typeof SOURCES;

export function sourceName(code: string): string {
  return SOURCES[code as SourceCode] ?? code;
}

/** 한 번의 구매에 담긴 굿즈 하나 */
export interface PurchaseItem {
  handle: string;
  name: string;
  quantity: number;
  /** 이 굿즈에 쓴 돈(원). 배송비·수수료는 주문 쪽에 있다 */
  itemPriceKrw: number;
  /** 구매 시점 정가(엔). 모르면 null 이고 플미를 계산하지 않는다 */
  listPriceJpy: number | null;
}

/** 한 번의 구매 */
export interface Purchase {
  id: string;
  source: string;
  purchasedOn: string;
  /** 주문당 한 번 붙는 비용 */
  shippingKrw: number;
  feeKrw: number;
  /** 구매 시점 환율. 1엔당 원 */
  fxRate: number | null;
  memo: string | null;
  items: PurchaseItem[];
}

export interface ItemResult {
  /** 정가를 원화로 환산한 값(수량 반영). 정가나 환율을 모르면 null */
  listPriceKrw: number | null;
  /** 상품값 - 정가_원화. 음수면 정가보다 싸게 산 것 */
  premiumKrw: number | null;
  premiumRate: number | null;
}

/** 굿즈 하나의 플미. 배송비는 주문 단위라 여기 들어오지 않는다 */
export function calculateItem(item: PurchaseItem, fxRate: number | null): ItemResult {
  if (fxRate === null || item.listPriceJpy === null || item.listPriceJpy <= 0) {
    return { listPriceKrw: null, premiumKrw: null, premiumRate: null };
  }

  const listPriceKrw = Math.round(item.listPriceJpy * fxRate * item.quantity);
  if (listPriceKrw <= 0) {
    return { listPriceKrw: null, premiumKrw: null, premiumRate: null };
  }

  const premiumKrw = item.itemPriceKrw - listPriceKrw;

  return {
    listPriceKrw,
    premiumKrw,
    premiumRate: Math.round((premiumKrw / listPriceKrw) * 1000) / 10,
    };
}

export interface PurchaseResult {
  /** 담긴 굿즈 값의 합 */
  itemTotalKrw: number;
  /** 플미를 계산할 수 있었던 굿즈의 정가 합 */
  listTotalKrw: number;
  /** 정가를 아는 굿즈가 하나도 없으면 null */
  premiumKrw: number | null;
  premiumRate: number | null;
  /** 상품값 + 배송비 + 수수료 */
  totalKrw: number;
  /** 정가나 환율을 몰라 플미에서 빠진 굿즈 수 */
  unknownCount: number;
}

/** 한 번의 구매를 합산한다 */
export function calculatePurchase(purchase: Purchase): PurchaseResult {
  let itemTotalKrw = 0;
  let listTotalKrw = 0;
  let premiumKrw = 0;
  let unknownCount = 0;
  let known = 0;

  for (const item of purchase.items) {
    itemTotalKrw += item.itemPriceKrw;

    const result = calculateItem(item, purchase.fxRate);
    if (result.listPriceKrw === null || result.premiumKrw === null) {
      unknownCount += 1;
      continue;
    }

    listTotalKrw += result.listPriceKrw;
    premiumKrw += result.premiumKrw;
    known += 1;
  }

  const totalKrw = itemTotalKrw + purchase.shippingKrw + purchase.feeKrw;

  if (known === 0 || listTotalKrw <= 0) {
    return { itemTotalKrw, listTotalKrw: 0, premiumKrw: null, premiumRate: null, totalKrw, unknownCount };
  }

  return {
    itemTotalKrw,
    listTotalKrw,
    premiumKrw,
    premiumRate: Math.round((premiumKrw / listTotalKrw) * 1000) / 10,
    totalKrw,
    unknownCount,
  };
}

export interface LedgerSummary {
  /** 구매 건수 */
  purchaseCount: number;
  /** 담긴 굿즈 수 */
  itemCount: number;
  /** 실제로 나간 돈 전부 */
  totalKrw: number;
  itemTotalKrw: number;
  shippingTotalKrw: number;
  feeTotalKrw: number;
  listTotalKrw: number;
  /** 플미로 더 쓴 돈. 정가보다 싸게 산 건은 음수로 상쇄된다 */
  premiumKrw: number;
  premiumRate: number | null;
  /** 정가나 환율을 몰라 플미에서 빠진 굿즈 수 */
  unknownCount: number;
}

/** 여러 구매를 합산한다 */
export function summarize(purchases: Purchase[]): LedgerSummary {
  const summary: LedgerSummary = {
    purchaseCount: purchases.length,
    itemCount: 0,
    totalKrw: 0,
    itemTotalKrw: 0,
    shippingTotalKrw: 0,
    feeTotalKrw: 0,
    listTotalKrw: 0,
    premiumKrw: 0,
    premiumRate: null,
    unknownCount: 0,
  };

  for (const purchase of purchases) {
    const result = calculatePurchase(purchase);

    summary.itemCount += purchase.items.length;
    summary.totalKrw += result.totalKrw;
    summary.itemTotalKrw += result.itemTotalKrw;
    summary.shippingTotalKrw += purchase.shippingKrw;
    summary.feeTotalKrw += purchase.feeKrw;
    summary.listTotalKrw += result.listTotalKrw;
    summary.premiumKrw += result.premiumKrw ?? 0;
    summary.unknownCount += result.unknownCount;
  }

  if (summary.listTotalKrw > 0) {
    summary.premiumRate = Math.round((summary.premiumKrw / summary.listTotalKrw) * 1000) / 10;
  }

  return summary;
}

/** 원화 표시 */
export function formatKrw(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

/** 플미액 표시. 부호를 붙여 손해인지 이득인지 바로 보이게 한다 */
export function formatPremium(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('ko-KR')}원`;
}
