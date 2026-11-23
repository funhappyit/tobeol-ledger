/**
 * 화면용 변환 테스트
 *
 * 1만 건이 한 번에 내려가는 응답이라 "무엇을 싣고 무엇을 안 싣는가"가 곧 성능이다.
 * 실수로 다시 늘어나지 않도록 규칙을 고정해 둔다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CollectedItem } from '../collect/types';
import { buildSearchText, toDexItem } from './view';

function sample(overrides: Partial<CollectedItem> = {}): CollectedItem {
  return {
    source: 'official',
    shopifyProductId: 123,
    handle: '4570189213295',
    jan: '4570189213295',
    nameKo: '치이카와 클리닉 티셔츠',
    nameJa: 'ちいかわクリニック Tシャツ',
    descriptionKo: '아주 긴 상품 설명. 화면에 띄우지 않는 값이다.',
    productTypeKo: '의류',
    productTypeJa: 'アパレル',
    vendor: '치이카와 마켓',
    listPriceJpy: 4180,
    listPriceCurrency: 'JPY',
    imageUrl: 'https://cdn.shopify.com/s/files/1/a.jpg',
    sourceUrl: 'https://chiikawamarket.jp/products/4570189213295',
    tagsRaw: ['20261127', 'ちいかわ', 'アパレル'],
    parsed: {
      releasedOn: '2026-11-27',
      restockedOn: [],
      preorderOn: null,
      characterCodes: ['chiikawa'],
      categoryCodes: ['apparel'],
      purchaseLimit: 1,
      flags: ['new_arrival'],
      rest: [],
    },
    updatedAt: '2026-11-16T00:00:00.000Z',
    collectedAt: '2026-11-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('toDexItem', () => {
  const item = toDexItem(sample());

  it('화면이 쓰는 값만 싣는다', () => {
    assert.deepEqual(Object.keys(item).sort(), [
      'categoryCodes',
      'handle',
      'imageUrl',
      'listPriceJpy',
      'nameJa',
      'nameKo',
      'purchaseLimit',
      'releasedOn',
      'source',
      'tags',
    ]);
  });

  /** 한 건에 수백 바이트짜리 값이다. 1만 건이면 그것만으로 응답이 몇 MB 늘어난다 */
  it('상품 설명은 싣지 않는다', () => {
    assert.ok(!JSON.stringify(item).includes('화면에 띄우지 않는 값'));
  });

  it('캐릭터 코드와 원본 주소는 싣지 않는다', () => {
    const json = JSON.stringify(item);

    assert.ok(!json.includes('characterCodes'));
    assert.ok(!json.includes('chiikawamarket.jp'));
  });

  /**
   * 이름과 handle 은 이미 따로 실려 있다.
   * 검색용 글자에 합쳐 두면 같은 값이 두 번 나간다(1만 건이면 2MB).
   */
  it('검색용 태그에 이름과 handle 을 섞지 않는다', () => {
    assert.equal(item.tags, '20261127 ちいかわ アパレル');
    assert.ok(!item.tags.includes('치이카와 클리닉'));
    assert.ok(!item.tags.includes('4570189213295'));
  });

  it('공식몰 굿즈는 출처 키를 통째로 생략한다', () => {
    assert.equal(item.source, undefined);
    assert.ok(!JSON.stringify(item).includes('source'));
  });

  it('포켓 굿즈는 출처를 싣는다', () => {
    const pocket = toDexItem(sample({ source: 'pocket' }));

    assert.equal(pocket.source, 'pocket');
  });
});

describe('buildSearchText', () => {
  const item = toDexItem(sample());

  it('이름·handle·태그를 모두 담는다', () => {
    const text = buildSearchText(item);

    assert.ok(text.includes('치이카와 클리닉'));
    assert.ok(text.includes('ちいかわクリニック'));
    assert.ok(text.includes('4570189213295'));
    assert.ok(text.includes('アパレル'));
  });

  it('소문자로 맞춘다', () => {
    assert.ok(buildSearchText(item).includes('tシャツ'));
  });

  it('비어 있는 값은 건너뛴다', () => {
    const text = buildSearchText(toDexItem(sample({ nameKo: null, tagsRaw: [] })));

    assert.ok(!text.includes('null'));
    assert.ok(text.includes('ちいかわクリニック'));
  });
});
