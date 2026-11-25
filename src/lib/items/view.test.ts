/**
 * 화면용 변환 테스트
 *
 * 1만 건이 한 번에 내려가는 응답이라 "무엇을 싣고 무엇을 안 싣는가"가 곧 성능이다.
 * 실수로 다시 늘어나지 않도록 규칙을 고정해 둔다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CollectedItem } from '../collect/types';
import { buildSearchText, packDexItems, toDexItem, unpackDexItems } from './view';

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
    inStock: true,
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
      'inStock',
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

describe('packDexItems / unpackDexItems', () => {
  const base = 'https://cdn.shopify.com/s/files/1/0626/7142/1681/files/';

  it('같은 접두어는 한 번만 싣는다', () => {
    const items = [
      toDexItem(sample({ handle: 'a', imageUrl: `${base}a.jpg?v=1` })),
      toDexItem(sample({ handle: 'b', imageUrl: `${base}b.jpg?v=2` })),
    ];

    const packed = packDexItems(items);

    assert.deepEqual(packed.imageBases, [base]);
    assert.deepEqual(packed.items[0]?.img, [0, 'a.jpg']);
    assert.deepEqual(packed.items[1]?.img, [0, 'b.jpg']);
  });

  it('접두어가 다르면 따로 센다', () => {
    const other = 'https://cdn.shopify.com/s/files/1/0808/1434/2465/files/';
    const items = [
      toDexItem(sample({ handle: 'a', imageUrl: `${base}a.jpg` })),
      toDexItem(sample({ handle: 'b', imageUrl: `${other}b.jpg` })),
    ];

    const packed = packDexItems(items);

    assert.equal(packed.imageBases.length, 2);
    assert.deepEqual(packed.items[1]?.img, [1, 'b.jpg']);
  });

  it('되돌리면 원래 주소가 된다. 캐시 갱신용 쿼리는 떼고 돌아온다', () => {
    const items = [toDexItem(sample({ imageUrl: `${base}a.jpg?v=1742359550` }))];

    assert.deepEqual(unpackDexItems(packDexItems(items)), [{ ...items[0], imageUrl: `${base}a.jpg` }]);
  });

  it('이미지가 없는 굿즈는 그대로 둔다', () => {
    const items = [toDexItem(sample({ imageUrl: null }))];
    const packed = packDexItems(items);

    assert.equal(packed.items[0]?.img, undefined);
    assert.equal(unpackDexItems(packed)[0]?.imageUrl, null);
  });

  it('접두어 번호가 어긋나면 이미지를 비운다. 깨진 주소를 만들지 않는다', () => {
    const restored = unpackDexItems({ imageBases: [], items: [{ ...toDexItem(sample()), imageUrl: undefined, img: [3, 'a.jpg'] } as never] });

    assert.equal(restored[0]?.imageUrl, null);
  });

  it('이미지 말고 다른 항목은 건드리지 않는다', () => {
    const item = toDexItem(sample());
    const restored = unpackDexItems(packDexItems([item]))[0];

    assert.equal(restored?.nameKo, item.nameKo);
    assert.equal(restored?.listPriceJpy, item.listPriceJpy);
    assert.deepEqual(restored?.categoryCodes, item.categoryCodes);
  });
});

describe('재고', () => {
  it('살 수 있는 굿즈만 inStock 을 싣는다', () => {
    assert.equal(toDexItem(sample({ inStock: true })).inStock, true);
  });

  /**
   * 품절이 열에 아홉이라 false 를 실으면 그것만으로 응답이 커진다.
   * 화면이 쓰는 것은 "아직 살 수 있다" 하나뿐이다.
   */
  it('품절은 응답에 실리지 않는다', () => {
    const item = toDexItem(sample({ inStock: false }));

    assert.equal(item.inStock, undefined);
    assert.ok(!JSON.stringify(item).includes('inStock'));
  });

  it('모르는 것도 실리지 않는다. 품절과 구분은 수집본에만 남는다', () => {
    const item = toDexItem(sample({ inStock: null }));

    assert.equal(item.inStock, undefined);
    assert.ok(!JSON.stringify(item).includes('inStock'));
  });
})
