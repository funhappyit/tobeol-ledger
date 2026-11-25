/**
 * 적재 RPC 재시도
 *
 * ── 왜 필요한가
 *
 * 2026-11-25 공식몰 적재가 22배치 중 15번째에서 죽었다.
 *
 *   [official] 15번째 배치 실패: canceling statement due to statement timeout
 *
 * 한 배치가 삐끗했는데 나머지 8배치가 통째로 날아갔다. 그날 3,616건이 하루 묵은
 * 값으로 남았다.
 *
 * ── 왜 배치를 줄이는 것으로는 안 되는가
 *
 * 배치 크기를 바꿔 가며 전량 적재를 재 봤다(10,616건).
 *
 *   배치    배치수    중간       최대       합계
 *    250      43      922ms    5,430ms    47.2초
 *    500      22    1,222ms    6,645ms    40.2초
 *   1000      11    1,928ms    3,997ms    25.6초
 *
 * 같은 일인데 474ms 에서 6,645ms 까지 14배 흔들렸다. 배치마다 하는 일이 똑같으니
 * 질의 계획 문제가 아니다. 공유 인스턴스의 CPU·IO 지터다.
 *
 * 두 점으로 맞춰 보면 호출당 고정비가 약 590ms, 행당 1.3ms 다. 그래서 배치를
 * 250으로 줄이면 왕복이 두 배가 되어 합계가 오히려 늘고(40.2 → 47.2초),
 * 최대값은 거의 그대로다. 줄여서 막을 수 있는 종류의 고장이 아니다.
 *
 * 고칠 것은 재시도가 없다는 쪽이었다.
 *
 * ── 재시도해도 되는 근거
 *
 * 두 적재 함수가 모두 멱등이다. load_items 는 handle 기준 upsert 고,
 * load_stock 은 UPDATE 다. 같은 배치를 두 번 보내도 결과가 같다.
 * 타임아웃으로 취소된 트랜잭션은 Postgres 가 롤백을 보장한다.
 *
 * ── 조용히 넘어가지 않는다
 *
 * 재시도가 생기면 실패가 로그에서 사라진다. DB 가 느려지고 있는 것을 모르고
 * 지나가게 된다. 그래서 재시도할 때마다 onRetry 로 알리고, 부르는 쪽이 반드시 찍는다.
 */

/**
 * 적재 RPC 가 돌려주는 모양.
 * supabase-js 를 여기서 import 하지 않으려고 쓰는 만큼만 적는다(테스트가 쉬워진다).
 */
export interface RpcResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export interface RetryInfo {
  /** 몇 번째 재시도인지. 1 부터 */
  attempt: number;
  /** 이만큼 쉬고 다시 보낸다 */
  waitMs: number;
  /** 방금 받은 에러 */
  message: string;
}

export interface RetryOptions {
  /** 다시 보낼 횟수. 첫 시도는 여기 들어가지 않는다 */
  retries?: number;
  /** 첫 대기 시간. 재시도마다 두 배가 된다 */
  backoffMs?: number;
  /** 재시도 직전에 불린다. 로그를 찍는 자리다 */
  onRetry?: (info: RetryInfo) => void;
  /** 테스트에서 실제로 기다리지 않도록 갈아끼운다 */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * 인스턴스가 숨이 찬 것인지.
 *
 * 이 경우에는 더 길게 물러난다. 바로 다시 보내면 같은 자리에서 또 죽는다.
 * http.ts 가 429 를 다루는 방식과 같다.
 */
export function isStatementTimeout(message: string): boolean {
  return message.toLowerCase().includes('statement timeout');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * RPC 를 부르고, 실패하면 물러났다가 다시 보낸다.
 *
 * 에러 종류를 가리지 않고 재시도한다. 일시적인 것을 영구적인 것으로 잘못 보면
 * 적재가 통째로 날아가는데, 반대로 잘못 봐야 몇 초 늦게 같은 에러를 받을 뿐이다.
 * 한쪽 손해가 훨씬 크다.
 *
 * @param label 에러 메시지에 들어갈 이름. 어느 배치가 죽었는지 알아야 한다
 */
export async function callWithRetry<T>(
  label: string,
  call: () => PromiseLike<RpcResult<T>>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const sleep = options.sleep ?? wait;
  const onRetry = options.onRetry;

  let backoff = options.backoffMs ?? 1000;
  let lastMessage = '';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let result: RpcResult<T>;

    try {
      result = await call();
    } catch (error) {
      // 네트워크가 끊기면 error 로 감싸이지 않고 예외로 온다
      result = {
        data: null,
        error: { message: error instanceof Error ? error.message : String(error) },
      };
    }

    if (result.error === null) {
      // 적재 함수들은 늘 객체를 돌려준다. null 이 오는 경로가 없다
      return result.data as T;
    }

    lastMessage = result.error.message;

    if (attempt === retries) {
      break;
    }

    const waitMs = isStatementTimeout(lastMessage) ? backoff * 3 : backoff;
    onRetry?.({ attempt: attempt + 1, waitMs, message: lastMessage });

    await sleep(waitMs);
    backoff *= 2;
  }

  throw new Error(`${label} 실패(${retries + 1}번 시도): ${lastMessage}`);
}
