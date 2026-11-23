/**
 * 플미(프리미엄) 계산
 *
 * 이 프로젝트의 본체다. "정가보다 얼마나 더 썼는가"를 숫자로 만든다.
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

/** 구매 기록 한 건. 화면과 DB 가 함께 쓰는 모양 */
export interface Acquisition {
  id: string;
  handle: string;
  source: string;
  purchasedOn: string;
  quantity: number;
  /** 상품값(원). 배송비·수수료 제외 */
  itemPriceKrw: number;
  shippingKrw: number;
  feeKrw: number;
  /** 구매 시점 정가(엔). 모르면 null 이고 플미를 계산하지 않는다 */
  listPriceJpy: number | null;
  /** 구매 시점 환율. 1엔당 원 */
  fxRate: number | null;
  memo: string | null;
}

export interface PremiumResult {
  /** 정가를 원화로 환산한 값(수량 반영). 정가나 환율을 모르면 null */
  listPriceKrw: number | null;
  /** 상품값 - 정가_원화. 음수면 정가보다 싸게 산 것 */
  premiumKrw: number | null;
  /** 플미율(%) */
  premiumRate: number | null;
  /** 상품값 + 배송비 + 수수료 */
  totalKrw: number;
}

/**
 * 한 건의 플미를 계산한다.
 * 정가나 환율이 없으면 플미는 null 이고 총지출만 나온다.
 * 억지로 0 으로 채우면 통계가 조용히 틀어진다.
 */
export function calculatePremium(record: Acquisition): PremiumResult {
  const totalKrw = record.itemPriceKrw + record.shippingKrw + record.feeKrw;

  if (record.listPriceJpy === null || record.fxRate === null || record.listPriceJpy <= 0) {
    return { listPriceKrw: null, premiumKrw: null, premiumRate: null, totalKrw };
  }

  const listPriceKrw = Math.round(record.listPriceJpy * record.fxRate * record.quantity);
  if (listPriceKrw <= 0) {
    return { listPriceKrw: null, premiumKrw: null, premiumRate: null, totalKrw };
  }

  const premiumKrw = record.itemPriceKrw - listPriceKrw;

  return {
    listPriceKrw,
    premiumKrw,
    premiumRate: Math.round((premiumKrw / listPriceKrw) * 1000) / 10,
    totalKrw,
  };
}

export interface LedgerSummary {
  /** 기록 건수 */
  count: number;
  /** 실제로 나간 돈 전부 */
  totalKrw: number;
  /** 상품값 합계 (배송비·수수료 제외) */
  itemTotalKrw: number;
  shippingTotalKrw: number;
  feeTotalKrw: number;
  /** 플미를 계산할 수 있었던 기록의 정가 합계 */
  listTotalKrw: number;
  /** 플미로 더 쓴 돈. 정가보다 싸게 산 건은 음수로 상쇄된다 */
  premiumKrw: number;
  /** 전체 플미율(%) */
  premiumRate: number | null;
  /** 플미를 계산할 수 없던 기록 수 (정가나 환율이 없는 것) */
  unknownCount: number;
}

/** 여러 기록을 합산한다 */
export function summarize(records: Acquisition[]): LedgerSummary {
  const summary: LedgerSummary = {
    count: records.length,
    totalKrw: 0,
    itemTotalKrw: 0,
    shippingTotalKrw: 0,
    feeTotalKrw: 0,
    listTotalKrw: 0,
    premiumKrw: 0,
    premiumRate: null,
    unknownCount: 0,
  };

  for (const record of records) {
    const result = calculatePremium(record);

    summary.totalKrw += result.totalKrw;
    summary.itemTotalKrw += record.itemPriceKrw;
    summary.shippingTotalKrw += record.shippingKrw;
    summary.feeTotalKrw += record.feeKrw;

    if (result.listPriceKrw === null || result.premiumKrw === null) {
      summary.unknownCount += 1;
      continue;
    }

    summary.listTotalKrw += result.listPriceKrw;
    summary.premiumKrw += result.premiumKrw;
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
