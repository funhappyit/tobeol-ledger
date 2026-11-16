/**
 * 태그 파서 테스트
 *
 * 입력값은 전부 공식몰에서 실제로 관측된 태그다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseTags, splitTags, toIsoDate } from './parse-tags';

describe('toIsoDate', () => {
  it('8자리 숫자를 ISO 날짜로 바꾼다', () => {
    assert.equal(toIsoDate('20220423'), '2022-04-23');
    assert.equal(toIsoDate('20261127'), '2026-11-27');
  });

  it('달력에 없는 날짜는 null 이다', () => {
    assert.equal(toIsoDate('20261352'), null);
    assert.equal(toIsoDate('20260230'), null);
    assert.equal(toIsoDate('20260000'), null);
  });

  it('형식이 어긋나면 null 이다', () => {
    assert.equal(toIsoDate('2026112'), null);
    assert.equal(toIsoDate('RE20261008'), null);
    assert.equal(toIsoDate(''), null);
  });
});

describe('splitTags', () => {
  it('쉼표 문자열을 잘라 공백을 턴다', () => {
    assert.deepEqual(splitTags('20220423, ちいかわ, ぬいぐるみ'), [
      '20220423',
      'ちいかわ',
      'ぬいぐるみ',
    ]);
  });

  it('배열도 그대로 받는다', () => {
    assert.deepEqual(splitTags(['  ちいかわ ', '', 'うさぎ']), ['ちいかわ', 'うさぎ']);
  });

  it('비어 있으면 빈 배열이다', () => {
    assert.deepEqual(splitTags(null), []);
    assert.deepEqual(splitTags(undefined), []);
    assert.deepEqual(splitTags(''), []);
  });
});

describe('parseTags', () => {
  it('실제 상품 태그를 분류한다', () => {
    // 치이카와 손목 베개 인형 (2022-04-23 발매)
    const parsed = parseTags('20220423, PC・スマホグッズ, ちいかわ, ぬいぐるみ, マスコット');

    assert.equal(parsed.releasedOn, '2022-04-23');
    assert.deepEqual(parsed.characterCodes, ['chiikawa']);
    assert.deepEqual(parsed.categoryCodes, ['pc_phone', 'plush', 'mascot']);
    assert.deepEqual(parsed.rest, []);
  });

  it('RE 접두는 재입고일, PRE 접두는 발매 예정일이다', () => {
    const parsed = parseTags('20241021, RE20261008, RE20241021, PRE20261127, ちいかわ');

    assert.equal(parsed.releasedOn, '2024-10-21');
    assert.deepEqual(parsed.restockedOn, ['2024-10-21', '2026-10-08']);
    assert.equal(parsed.preorderOn, '2026-11-27');
  });

  it('발매일 태그가 여러 개면 가장 이른 날을 쓴다', () => {
    const parsed = parseTags('20260918, 20240712, 20240906');

    assert.equal(parsed.releasedOn, '2024-07-12');
  });

  it('1회계당 수량 제한을 숫자로 뽑고, 여러 개면 더 엄격한 값을 남긴다', () => {
    assert.equal(parseTags('2個/1会計').purchaseLimit, 2);
    assert.equal(parseTags('2個/1会計, 1個/1会計').purchaseLimit, 1);
    assert.equal(parseTags('ちいかわ').purchaseLimit, null);
  });

  it('판매 조건 태그를 플래그로 뽑는다', () => {
    const parsed = parseTags('海外NG, 数量制限, 予約, 同梱不可, 同梱不可H, グループ');

    assert.deepEqual(parsed.flags, [
      'overseas_ng',
      'quantity_limited',
      'preorder',
      'no_bundle',
      'group',
    ]);
  });

  it('캐릭터가 여러 명이면 모두 담고 중복은 지운다', () => {
    const parsed = parseTags('ちいかわ, ハチワレ, うさぎ, モモンガ, ラッコ, くりまんじゅう, シーサー, 古本屋, ちいかわ');

    assert.deepEqual(parsed.characterCodes, [
      'chiikawa',
      'hachiware',
      'usagi',
      'momonga',
      'rakko',
      'kurimanju',
      'shisa',
      'furuhonya',
    ]);
  });

  it('모르는 태그는 버리지 않고 rest 에 원문으로 남긴다', () => {
    const parsed = parseTags('シーサー祭り, ちいかわ寿司, 202505在庫廃棄, ちいかわ');

    assert.deepEqual(parsed.rest, ['シーサー祭り', 'ちいかわ寿司', '202505在庫廃棄']);
    assert.deepEqual(parsed.characterCodes, ['chiikawa']);
  });

  it('태그가 없으면 전부 비어 있다', () => {
    const parsed = parseTags('');

    assert.equal(parsed.releasedOn, null);
    assert.equal(parsed.preorderOn, null);
    assert.equal(parsed.purchaseLimit, null);
    assert.deepEqual(parsed.restockedOn, []);
    assert.deepEqual(parsed.characterCodes, []);
    assert.deepEqual(parsed.categoryCodes, []);
    assert.deepEqual(parsed.flags, []);
    assert.deepEqual(parsed.rest, []);
  });
});
