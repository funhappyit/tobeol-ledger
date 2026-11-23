/**
 * 환율 조회 (엔 -> 원)
 *
 * frankfurter.app 은 유럽중앙은행(ECB) 고시 기준이고 키가 필요 없다.
 * 과거 날짜 조회가 되는 것이 중요하다. 구매 기록은 "산 날의 환율"을 남겨야 하기 때문이다.
 *
 * 주의: ECB 고시는 영업일에만 나온다. 주말·공휴일로 조회하면
 * frankfurter 가 직전 영업일 값을 돌려주고, 응답의 date 가 요청한 날짜와 달라진다.
 * 그래서 실제로 어느 날짜의 값인지를 함께 돌려준다.
 *
 * 이 값은 은행 고시 기준이라 카드 결제나 구매대행의 실제 적용 환율과는 차이가 난다.
 * 화면에서 사용자가 고칠 수 있게 두고, 고쳤는지 여부를 따로 기록한다.
 */

const BASE_URL = 'https://api.frankfurter.app';

export interface FxRate {
  /** 1엔당 원 */
  rate: number;
  /** 실제로 적용된 고시 날짜 (요청한 날짜와 다를 수 있다) */
  date: string;
}

/** YYYY-MM-DD 인지 확인한다. 그대로 URL 에 넣기 때문에 형식을 따진다 */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * 지정한 날짜의 엔/원 환율.
 * frankfurter 는 100엔 단위가 아니라 1엔 기준으로 돌려준다.
 */
export async function fetchJpyToKrw(date: string): Promise<FxRate | null> {
  if (!isIsoDate(date)) {
    return null;
  }

  try {
    const response = await fetch(`${BASE_URL}/${date}?from=JPY&to=KRW`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { date?: unknown; rates?: { KRW?: unknown } };
    const rate = body.rates?.KRW;

    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    return {
      rate,
      // 주말로 조회하면 직전 영업일 날짜가 돌아온다
      date: typeof body.date === 'string' ? body.date : date,
    };
  } catch {
    // 환율을 못 받아도 기록 자체는 남길 수 있어야 한다. 호출하는 쪽에서 직접 입력하게 둔다
    return null;
  }
}
