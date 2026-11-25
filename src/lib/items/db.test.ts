import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pickStockCheckedAt } from './db';

describe('pickStockCheckedAt — 재고를 마지막으로 확인한 시각', () => {
  it('재고 스윕이 더 늦으면 그쪽을 쓴다', () => {
    const picked = pickStockCheckedAt('2026-11-25T10:30:00+00:00', '2026-11-25T03:00:00+00:00');

    assert.equal(picked, '2026-11-25T10:30:00+00:00');
  });

  it('전체 수집이 더 늦으면 그쪽을 쓴다', () => {
    // 전체 수집도 재고를 함께 본다. 더 최근이면 그 시각이 맞다
    const picked = pickStockCheckedAt('2026-11-24T23:30:00+00:00', '2026-11-25T03:00:00+00:00');

    assert.equal(picked, '2026-11-25T03:00:00+00:00');
  });

  it('스윕이 아직 돌지 않은 행은 전체 수집 시각을 쓴다', () => {
    const picked = pickStockCheckedAt(null, '2026-11-25T03:00:00+00:00');

    assert.equal(picked, '2026-11-25T03:00:00+00:00');
  });

  it('오프셋이 달라도 실제 시간 순서로 고른다', () => {
    // 글자 순서로 비교하면 '2026-11-25T09:00:00+09:00'(= 00:00 UTC)이 이겨 버린다
    const picked = pickStockCheckedAt('2026-11-25T09:00:00+09:00', '2026-11-25T05:00:00+00:00');

    assert.equal(picked, '2026-11-25T05:00:00+00:00');
  });

  it('읽을 수 없는 값은 건너뛴다', () => {
    const picked = pickStockCheckedAt('어제쯤', '2026-11-25T03:00:00+00:00');

    assert.equal(picked, '2026-11-25T03:00:00+00:00');
  });

  it('둘 다 없으면 빈 문자열이다', () => {
    // 화면은 빈 값을 "시각을 밝히지 않음"으로 다룬다(formatCheckedAt 이 null 을 돌려준다)
    assert.equal(pickStockCheckedAt(null, null), '');
    assert.equal(pickStockCheckedAt('', ''), '');
  });
});
