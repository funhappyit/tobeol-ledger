/**
 * 굿즈 정렬 테스트
 *
 * 이 정렬은 두 번 틀렸다. 같은 실수를 다시 하지 않도록 규칙을 고정해 둔다.
 *   1. 발매일 없는 굿즈를 통째로 뒤로 보내 포켓 스토어 굿즈가 1만 건 뒤에 묻혔다
 *   2. 예약 개시일을 건너뛰어 1년 전에 예약을 연 굿즈가 신상 자리에 올라왔다
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CollectedItem, ItemSource } from '../collect/types';
import { mergeItems, sortByDate, sortKey } from './sort';

/** 정렬에 쓰이는 값만 채운 굿즈 */
function item(
  handle: string,
  dates: { released?: string; preorder?: string; updated?: string } = {},
  source: ItemSource = 'official',
): CollectedItem {
  return {
    source,
    shopifyProductId: null,
    handle,
    jan: null,
    nameKo: null,
    nameJa: handle,
    descriptionKo: null,
    productTypeKo: null,
    productTypeJa: null,
    vendor: null,
    listPriceJpy: null,
    listPriceCurrency: null,
    imageUrl: null,
    sourceUrl: `https://example.com/${handle}`,
    tagsRaw: [],
    parsed: {
      releasedOn: dates.released ?? null,
      restockedOn: [],
      preorderOn: dates.preorder ?? null,
      characterCodes: [],
      categoryCodes: [],
      purchaseLimit: null,
      flags: [],
      rest: [],
    },
    updatedAt: dates.updated ?? '',
    collectedAt: '',
  };
}

describe('sortKey', () => {
  it('발매일이 있으면 발매일을 쓴다', () => {
    const value = item('a', {
      released: '2026-04-01',
      preorder: '2025-12-19',
      updated: '2026-11-16T00:00:00.000Z',
    });

    assert.equal(sortKey(value), '2026-04-01');
  });

  /** 예약 상품은 발매일 태그가 없고 PRE 태그만 붙는다 */
  it('발매일이 없으면 예약 개시일을 쓴다', () => {
    const value = item('a', { preorder: '2025-12-19', updated: '2026-11-16T00:00:00.000Z' });

    assert.equal(sortKey(value), '2025-12-19');
  });

  it('둘 다 없으면 최종 수정 시각의 날짜 부분을 쓴다', () => {
    const value = item('a', { updated: '2026-11-16T23:09:36+09:00' });

    assert.equal(sortKey(value), '2026-11-16');
  });

  it('아무 날짜도 없으면 빈 문자열이다', () => {
    assert.equal(sortKey(item('a')), '');
  });
});

describe('sortByDate', () => {
  it('최신이 앞에 온다', () => {
    const sorted = sortByDate([
      item('old', { released: '2022-04-23' }),
      item('new', { released: '2026-11-27' }),
      item('mid', { released: '2024-06-01' }),
    ]);

    assert.deepEqual(
      sorted.map((value) => value.handle),
      ['new', 'mid', 'old'],
    );
  });

  /**
   * 포켓 스토어는 발매일을 공개하지 않는다.
   * 발매일 없는 굿즈를 뒤로 몰면 그쪽 굿즈를 한 건도 볼 수 없게 된다.
   */
  it('발매일이 없는 굿즈를 뒤로 몰지 않는다', () => {
    const sorted = sortByDate([
      item('old-release', { released: '2022-04-23' }),
      item('recent-pocket', { updated: '2026-11-20T00:00:00.000Z' }, 'pocket'),
    ]);

    assert.equal(sorted[0].handle, 'recent-pocket');
  });

  /** 예약 상품은 정보가 자주 손질돼 수정 시각이 늘 최근이다 */
  it('예약 상품을 수정 시각으로 끌어올리지 않는다', () => {
    const sorted = sortByDate([
      item('old-preorder', { preorder: '2025-12-19', updated: '2026-11-16T00:00:00.000Z' }),
      item('this-week', { released: '2026-11-27' }),
    ]);

    assert.equal(sorted[0].handle, 'this-week');
  });

  /**
   * 같은 날 나온 굿즈가 백 건을 넘는 일이 흔하다.
   * 2차 기준이 없으면 수집본 파일로 읽을 때와 DB 로 읽을 때 순서가 달라진다.
   */
  it('날짜가 같으면 handle 순으로 갈라 순서를 고정한다', () => {
    const forward = sortByDate([
      item('bbb', { released: '2026-11-27' }),
      item('aaa', { released: '2026-11-27' }),
      item('ccc', { released: '2026-11-27' }),
    ]);

    const reversed = sortByDate([
      item('ccc', { released: '2026-11-27' }),
      item('bbb', { released: '2026-11-27' }),
      item('aaa', { released: '2026-11-27' }),
    ]);

    assert.deepEqual(
      forward.map((value) => value.handle),
      ['aaa', 'bbb', 'ccc'],
    );
    assert.deepEqual(
      forward.map((value) => value.handle),
      reversed.map((value) => value.handle),
    );
  });
});

describe('mergeItems', () => {
  it('여러 묶음을 합쳐 정렬한다', () => {
    const result = mergeItems([
      [item('official-1', { released: '2026-01-01' })],
      [item('pocket-1', { updated: '2026-06-01T00:00:00.000Z' }, 'pocket')],
    ]);

    assert.deepEqual(
      result.items.map((value) => value.handle),
      ['pocket-1', 'official-1'],
    );
  });

  it('같은 handle 은 한 번만 담는다', () => {
    const result = mergeItems([
      [item('same', { released: '2026-01-01' })],
      [item('same', { released: '2026-01-01' })],
    ]);

    assert.equal(result.items.length, 1);
  });

  it('섞여 있는 통화를 모은다', () => {
    const jpy = item('a', { released: '2026-01-01' });
    jpy.listPriceCurrency = 'JPY';
    const krw = item('b', { released: '2026-01-02' });
    krw.listPriceCurrency = 'KRW';

    assert.deepEqual(mergeItems([[jpy, krw]]).currencies.sort(), ['JPY', 'KRW']);
  });
});
