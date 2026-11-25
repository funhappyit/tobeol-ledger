import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatCheckedAt, sourceName, storeName } from './labels';

/**
 * 이 묶음은 `TZ=UTC` 로도 돌려야 의미가 있다.
 *
 * 개발 기계가 한국 시간대면 시간대를 고정하지 않은 코드도 통과해 버린다.
 * Vercel 이 UTC 로 돌아서 바로 그 차이 때문에 서버와 브라우저가 9시간 어긋났다.
 *
 *   npm test                 (기계 시간대 그대로)
 *   TZ=UTC npm test          (배포 환경과 같은 조건)
 */
describe('formatCheckedAt — 재고를 언제 본 값인지', () => {
  it('UTC 로 들어온 시각을 한국 시각으로 적는다', () => {
    // 07:13 UTC = 16:13 KST
    assert.equal(formatCheckedAt('2026-11-25T07:13:59.533241+00:00'), '11/25 16:13');
  });

  it('Z 표기도 같이 받는다', () => {
    assert.equal(formatCheckedAt('2026-11-25T07:13:59Z'), '11/25 16:13');
  });

  it('이미 한국 오프셋이 붙어 있어도 같은 글자가 나온다', () => {
    assert.equal(formatCheckedAt('2026-11-25T16:13:59+09:00'), '11/25 16:13');
  });

  it('날짜가 넘어가는 시각도 한국 기준으로 적는다', () => {
    // 15:30 UTC = 다음 날 00:30 KST. 기계 시간대를 따라가면 11/25 로 적힌다
    assert.equal(formatCheckedAt('2026-11-25T15:30:00Z'), '11/26 00:30');
  });

  it('자정을 24시로 적지 않는다', () => {
    // hourCycle 을 h23 으로 두지 않으면 엔진에 따라 `24:00` 이 나온다
    assert.equal(formatCheckedAt('2026-11-25T15:00:00Z'), '11/26 00:00');
  });

  it('30분 차이가 글자에 드러난다', () => {
    // 시 단위로 적으면 둘이 같은 글자가 된다. 30분마다 받는 의미가 사라진다
    assert.equal(formatCheckedAt('2026-11-25T07:13:00Z'), '11/25 16:13');
    assert.equal(formatCheckedAt('2026-11-25T07:43:00Z'), '11/25 16:43');
  });

  it('월·일에는 앞의 0 을 붙이지 않는다', () => {
    assert.equal(formatCheckedAt('2026-01-05T00:30:00Z'), '1/5 09:30');
  });

  it('값이 없으면 null 이다', () => {
    // 화면은 null 을 "시각을 밝히지 않음"으로 다룬다
    assert.equal(formatCheckedAt(null), null);
    assert.equal(formatCheckedAt(undefined), null);
    assert.equal(formatCheckedAt(''), null);
  });

  it('읽을 수 없는 값이면 null 이다', () => {
    assert.equal(formatCheckedAt('어제쯤'), null);
  });
});

describe('storeName / sourceName — 스토어 이름', () => {
  it('storeName 은 공식몰도 이름으로 돌려준다', () => {
    // 재고 안내는 "공식몰 11/25 16:13" 처럼 어디 재고인지 밝혀야 한다
    assert.equal(storeName('official'), '공식몰');
  });

  it('sourceName 은 공식몰이면 null 이다', () => {
    // 카드 배지용이다. 대부분이 공식몰이라 적으면 소음이 된다
    assert.equal(sourceName('official'), null);
  });

  it('두 함수가 공식몰 아닌 스토어에는 같은 이름을 쓴다', () => {
    for (const source of ['pocket', 'mogumogu'] as const) {
      assert.equal(storeName(source), sourceName(source));
    }
  });
});
