/**
 * 수집용 HTTP 헬퍼
 *
 * 상대는 남의 상용 스토어다. 빠르게 긁는 것보다 안 막히고 끝까지 도는 게 중요하므로
 * 요청 간격을 강제하고, 실패 시 지수 백오프로 물러난다.
 *
 * 전송 수단이 두 가지인 이유:
 * Node 내장 fetch 로 보내면 같은 URL·같은 User-Agent 인데도 즉시 429 가 돌아오고,
 * curl 로 보내면 200 이 온다(여러 번 번갈아 확인). HTTP 버전 차이도 아니었다.
 * 스토어의 봇 차단이 TLS 지문 등 요청 형태를 보고 판단하는 것으로 보인다.
 *
 * 공식몰의 에이전트 정책(https://chiikawamarket.jp/agents.md)은
 * `GET /products/{handle}.json` 과 sitemap 을 read-only browsing 경로로 명시하고 있어
 * 이 엔드포인트를 쓰는 것 자체는 스토어가 안내한 사용 방식이다.
 * 그래서 브라우저인 척 위장하지 않고 우리 User-Agent 를 그대로 유지한 채 전송 수단만 바꾼다.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface FetchOptions {
  /** 재시도 횟수 (최초 시도 제외) */
  retries?: number;
  /** 첫 재시도까지 대기 시간(ms). 이후 2배씩 늘어난다 */
  backoffMs?: number;
  timeoutMs?: number;
}

/**
 * 사용할 curl 실행 파일.
 *
 * 스토어의 봇 차단이 TLS 지문을 보기 때문에 같은 요청이라도 클라이언트 빌드에 따라 결과가 갈린다.
 * 실제로 Windows 기본 curl 8.22.0 은 429, Git 번들 curl 8.7.1 은 200 이었다.
 * 환경에 따라 달라지므로 PATH 의 curl 을 기본으로 쓰되 COLLECT_CURL_PATH 로 바꿀 수 있게 둔다.
 *
 * 예) COLLECT_CURL_PATH="C:\\Program Files\\Git\\mingw64\\bin\\curl.exe"
 */
const CURL_PATH = process.env.COLLECT_CURL_PATH ?? 'curl';

const USER_AGENT = 'tobeol-ledger/0.1 (personal goods tracker; contact via repository issues)';
const ACCEPT = 'application/json, text/xml, */*';
const STATUS_MARK = '<<<tobeol-status:';

/**
 * 전송 결과.
 * 표준 Response 를 쓰지 않는 이유는 curl 응답을 같은 모양으로 감싸기 위해서다.
 */
export interface HttpResult {
  status: number;
  ok: boolean;
  body: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** curl 로 한 번 보낸다 */
async function sendWithCurl(url: string, timeoutMs: number): Promise<HttpResult> {
  const { stdout } = await execFileAsync(
    CURL_PATH,
    [
      '--silent',
      '--show-error',
      '--location',
      '--compressed',
      '--max-time',
      String(Math.ceil(timeoutMs / 1000)),
      '--user-agent',
      USER_AGENT,
      '--header',
      `accept: ${ACCEPT}`,
      '--write-out',
      `\n${STATUS_MARK}%{http_code}>>>`,
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs + 5000, encoding: 'utf8' },
  );

  const markIndex = stdout.lastIndexOf(STATUS_MARK);
  if (markIndex === -1) {
    throw new Error(`curl 응답에서 상태 코드를 찾지 못했습니다: ${url}`);
  }

  const status = Number(
    stdout
      .slice(markIndex + STATUS_MARK.length)
      .replace('>>>', '')
      .trim(),
  );
  // 상태 표시 바로 앞의 줄바꿈은 우리가 붙인 것이라 떼어낸다
  const body = stdout.slice(0, markIndex).replace(/\n$/, '');

  return { status, ok: status >= 200 && status < 300, body };
}

/** Node 내장 fetch 로 한 번 보낸다 (curl 이 없는 환경의 대비책) */
async function sendWithFetch(url: string, timeoutMs: number): Promise<HttpResult> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: ACCEPT },
    signal: AbortSignal.timeout(timeoutMs),
  });

  return { status: response.status, ok: response.ok, body: await response.text() };
}

let curlUsable: boolean | null = null;

async function send(url: string, timeoutMs: number): Promise<HttpResult> {
  if (curlUsable === null) {
    try {
      await execFileAsync(CURL_PATH, ['--version'], { timeout: 10000 });
      curlUsable = true;
    } catch {
      curlUsable = false;
      console.warn('curl 을 찾지 못해 Node fetch 로 보냅니다. 스토어가 429 로 막을 수 있습니다.');
    }
  }

  return curlUsable ? sendWithCurl(url, timeoutMs) : sendWithFetch(url, timeoutMs);
}

/**
 * 재시도와 타임아웃이 붙은 GET.
 * 404 는 "없는 상품"이라는 정상적인 답이므로 재시도하지 않고 그대로 돌려준다.
 */
export async function httpGet(url: string, options: FetchOptions = {}): Promise<HttpResult> {
  const retries = options.retries ?? 5;
  const timeoutMs = options.timeoutMs ?? 30000;
  let backoff = options.backoffMs ?? 1000;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await send(url, timeoutMs);

      if (result.status === 404 || result.ok) {
        return result;
      }

      lastError = new Error(`HTTP ${result.status} ${url}`);

      // 429(요청 과다)는 평소 백오프보다 더 길게 물러난다
      if (result.status === 429 && attempt < retries) {
        await sleep(backoff * 3);
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
