/**
 * 수집용 HTTP 헬퍼
 *
 * 상대는 남의 상용 스토어다. 빠르게 긁는 것보다 안 막히고 끝까지 도는 게 중요하므로
 * 요청 간격을 강제하고, 실패 시 지수 백오프로 물러난다.
 */

export interface FetchOptions {
  /** 재시도 횟수 (최초 시도 제외) */
  retries?: number;
  /** 첫 재시도까지 대기 시간(ms). 이후 2배씩 늘어난다 */
  backoffMs?: number;
  timeoutMs?: number;
}

const DEFAULT_USER_AGENT =
  'tobeol-ledger/0.1 (personal goods tracker; contact via repository issues)';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 재시도와 타임아웃이 붙은 fetch.
 * 404 는 "없는 상품"이라는 정상적인 답이므로 재시도하지 않고 그대로 돌려준다.
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const retries = options.retries ?? 5;
  const timeoutMs = options.timeoutMs ?? 20000;
  let backoff = options.backoffMs ?? 1000;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': DEFAULT_USER_AGENT, accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 404) {
        return response;
      }

      if (response.ok) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status} ${url}`);

      // 429(요청 과다)는 서버가 알려준 대기 시간이 있으면 그걸 우선 따르고,
      // 없으면 평소 백오프보다 더 길게 물러난다. 5xx 는 아래 공통 백오프로 처리된다.
      if (response.status === 429 && attempt < retries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff * 3;
        await sleep(waitMs);
        backoff *= 2;
        continue;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries) {
      await sleep(backoff);
      backoff *= 2;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`요청 실패: ${url}`);
}

/** 호출 간 최소 간격을 보장하는 호출기 */
export function createThrottle(intervalMs: number): () => Promise<void> {
  let last = 0;

  return async () => {
    const wait = last + intervalMs - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    last = Date.now();
  };
}
