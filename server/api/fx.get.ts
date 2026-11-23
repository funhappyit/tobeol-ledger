/**
 * 환율 조회
 *
 * 외부 API 를 브라우저에서 바로 부르지 않고 서버를 거치는 이유는 두 가지다.
 *   - 응답을 캐시해서 같은 날짜를 여러 번 묻지 않는다
 *   - 외부 서비스가 바뀌어도 화면 코드를 건드리지 않는다
 */

import { fetchJpyToKrw, isIsoDate } from '@lib/fx/rates';

export interface FxResponse {
  rate: number;
  /** 실제로 적용된 고시 날짜. 주말이면 직전 영업일이 돌아온다 */
  date: string;
  /** 요청한 날짜와 다른 날의 값인지 */
  fallback: boolean;
}

/** 날짜별 환율은 한 번 정해지면 바뀌지 않는다. 메모리에 들고 있는다 */
const cache = new Map<string, FxResponse>();

export default defineEventHandler(async (event): Promise<FxResponse> => {
  const query = getQuery(event);
  const date = typeof query.date === 'string' ? query.date : '';

  if (!isIsoDate(date)) {
    throw createError({ statusCode: 400, statusMessage: '날짜 형식이 올바르지 않습니다' });
  }

  const cached = cache.get(date);
  if (cached) {
    return cached;
  }

  const result = await fetchJpyToKrw(date);
  if (!result) {
    throw createError({ statusCode: 502, statusMessage: '환율을 가져오지 못했습니다' });
  }

  const response: FxResponse = {
    rate: result.rate,
    date: result.date,
    fallback: result.date !== date,
  };

  cache.set(date, response);
  return response;
});
