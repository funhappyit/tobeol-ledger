import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { callWithRetry, isStatementTimeout, type RetryInfo, type RpcResult } from './retry';

/** 실제로 기다리지 않는 sleep. 쉰 시간만 기록한다 */
function fakeSleep(record: number[]) {
  return async (ms: number) => {
    record.push(ms);
  };
}

/** 미리 정해 둔 결과를 차례로 돌려주는 호출 */
function scripted<T>(results: RpcResult<T>[]) {
  const calls: number[] = [];

  const call = () => {
    calls.push(calls.length + 1);
    const next = results[calls.length - 1];

    if (next === undefined) {
      throw new Error('예상보다 많이 불렸습니다');
    }

    return Promise.resolve(next);
  };

  return { call, calls };
}

describe('isStatementTimeout', () => {
  it('Postgres 의 타임아웃 메시지를 알아본다', () => {
    assert.equal(isStatementTimeout('canceling statement due to statement timeout'), true);
  });

  it('대소문자를 가리지 않는다', () => {
    assert.equal(isStatementTimeout('Canceling statement due to STATEMENT TIMEOUT'), true);
  });

  it('다른 에러는 아니라고 한다', () => {
    assert.equal(isStatementTimeout('duplicate key value violates unique constraint'), false);
  });
});

describe('callWithRetry', () => {
  it('첫 시도에 성공하면 한 번만 부른다', async () => {
    const slept: number[] = [];
    const { call, calls } = scripted([{ data: { touched: 500 }, error: null }]);

    const result = await callWithRetry('1번째 배치', call, { sleep: fakeSleep(slept) });

    assert.deepEqual(result, { touched: 500 });
    assert.equal(calls.length, 1);
    assert.deepEqual(slept, [], '성공했으면 쉬지 않는다');
  });

  it('한 번 삐끗하고 성공하면 결과를 돌려준다', async () => {
    const slept: number[] = [];
    const { call, calls } = scripted([
      { data: null, error: { message: 'canceling statement due to statement timeout' } },
      { data: { touched: 500 }, error: null },
    ]);

    const result = await callWithRetry('15번째 배치', call, { sleep: fakeSleep(slept) });

    assert.deepEqual(result, { touched: 500 });
    assert.equal(calls.length, 2);
  });

  it('타임아웃은 더 길게 물러난다', async () => {
    const slept: number[] = [];
    const { call } = scripted([
      { data: null, error: { message: 'canceling statement due to statement timeout' } },
      { data: { touched: 1 }, error: null },
    ]);

    await callWithRetry('배치', call, { sleep: fakeSleep(slept), backoffMs: 1000 });

    // 인스턴스가 숨 돌릴 틈이 필요하다. 기본 백오프의 3배
    assert.deepEqual(slept, [3000]);
  });

  it('타임아웃이 아닌 에러는 기본 백오프로 물러난다', async () => {
    const slept: number[] = [];
    const { call } = scripted([
      { data: null, error: { message: 'connection reset' } },
      { data: { touched: 1 }, error: null },
    ]);

    await callWithRetry('배치', call, { sleep: fakeSleep(slept), backoffMs: 1000 });

    assert.deepEqual(slept, [1000]);
  });

  it('재시도마다 대기 시간이 두 배가 된다', async () => {
    const slept: number[] = [];
    const fail = { data: null, error: { message: 'connection reset' } };
    const { call } = scripted([fail, fail, fail, { data: { touched: 1 }, error: null }]);

    await callWithRetry('배치', call, { sleep: fakeSleep(slept), backoffMs: 1000, retries: 3 });

    assert.deepEqual(slept, [1000, 2000, 4000]);
  });

  it('횟수를 다 쓰면 마지막 메시지를 담아 던진다', async () => {
    const slept: number[] = [];
    const fail = { data: null, error: { message: 'canceling statement due to statement timeout' } };
    const { call, calls } = scripted([fail, fail, fail]);

    await assert.rejects(
      () => callWithRetry('15번째 배치', call, { sleep: fakeSleep(slept), retries: 2 }),
      (error: Error) => {
        // 어느 배치가 죽었는지, 몇 번 시도했는지, 왜 죽었는지가 다 들어 있어야 한다
        assert.match(error.message, /15번째 배치/);
        assert.match(error.message, /3번 시도/);
        assert.match(error.message, /statement timeout/);
        return true;
      },
    );

    assert.equal(calls.length, 3, '첫 시도 + 재시도 2번');
  });

  it('예외로 터져도 재시도한다', async () => {
    const slept: number[] = [];
    let n = 0;

    const call = () => {
      n += 1;
      if (n === 1) {
        // 네트워크가 끊기면 error 로 감싸이지 않고 예외로 온다
        throw new Error('fetch failed');
      }
      return Promise.resolve({ data: { touched: 7 }, error: null });
    };

    const result = await callWithRetry('배치', call, { sleep: fakeSleep(slept) });

    assert.deepEqual(result, { touched: 7 });
    assert.equal(n, 2);
  });

  it('재시도할 때마다 알려 준다', async () => {
    const slept: number[] = [];
    const seen: RetryInfo[] = [];
    const fail = { data: null, error: { message: 'canceling statement due to statement timeout' } };
    const { call } = scripted([fail, { data: { touched: 1 }, error: null }]);

    await callWithRetry('15번째 배치', call, {
      sleep: fakeSleep(slept),
      backoffMs: 1000,
      onRetry: (info) => seen.push(info),
    });

    // 조용히 넘어가면 DB 가 느려지는 것을 모르고 지나간다
    assert.equal(seen.length, 1);
    assert.equal(seen[0].attempt, 1);
    assert.equal(seen[0].waitMs, 3000);
    assert.match(seen[0].message, /statement timeout/);
  });

  it('성공했으면 알리지 않는다', async () => {
    const seen: RetryInfo[] = [];
    const { call } = scripted([{ data: { touched: 1 }, error: null }]);

    await callWithRetry('배치', call, { onRetry: (info) => seen.push(info) });

    assert.deepEqual(seen, []);
  });
});
