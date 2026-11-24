/**
 * 모구모구 수집기 테스트
 *
 * 이 스토어에서 실제로 관측된 꼴만 모았다.
 * 특히 발매일 태그는 공백과 표기가 흔들려서 꼴마다 하나씩 둔다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMogumoguProduct, parseMogumoguTags, parseReleaseTag } from './mogumogu';
import type { ShopifyProduct } from './types';

describe('parseReleaseTag', () => {
  it('공백 없는 꼴을 읽는다', () => {
    assert.equal(parseReleaseTag('2026年11月13日発売商品'), '2026-11-13');
  });

  it('전각 공백이 끼어도 읽는다', () => {
    assert.equal(parseReleaseTag('2025年9月12日　発売商品'), '2025-09-12');
  });

  it('반각 공백이 끼어도 읽는다', () => {
    assert.equal(parseReleaseTag('2025年11月14日 発売商品'), '2025-11-14');
  });

  it('`新着商品` 도 발매일로 읽는다', () => {
    assert.equal(parseReleaseTag('2025年3月20日　新着商品'), '2025-03-20');
  });

  /**
   * 스토어 원문에 `2025年20月20日` 이 76건 있다(20월).
   * 컬렉션 이름으로 보면 2월의 오타지만 추측해서 고치지 않는다.
   */
  it('달력에 없는 날짜는 읽지 않는다', () => {
    assert.equal(parseReleaseTag('2025年20月20日　新着商品'), null);
    assert.equal(parseReleaseTag('2025年2月30日発売商品'), null);
  });

  it('날짜 태그가 아니면 null', () => {
    assert.equal(parseReleaseTag('伏見稲荷'), null);
    assert.equal(parseReleaseTag('ちいかわ'), null);
    assert.equal(parseReleaseTag('2026年11月13日'), null);
  });
});

describe('parseMogumoguTags', () => {
  const tags = [
    '2026年11月13日発売商品',
    'Tシャツ',
    'うさぎ',
    'くりまんじゅう',
    'ちいかわ',
    'アパレル',
    'シーサー',
    'ハチワレ',
    'モモンガ',
    'ラッコ',
    '伏見稲荷',
    '古本屋',
  ];

  it('발매일을 읽는다', () => {
    assert.equal(parseMogumoguTags(tags).releasedOn, '2026-11-13');
  });

  it('발매일이 여러 개면 가장 이른 것', () => {
    const parsed = parseMogumoguTags(['2026年11月13日発売商品', '2025年3月20日　新着商品']);

    assert.equal(parsed.releasedOn, '2025-03-20');
  });

  it('캐릭터를 모은다', () => {
    assert.deepEqual(parseMogumoguTags(tags).characterCodes.sort(), [
      'chiikawa',
      'furuhonya',
      'hachiware',
      'kurimanju',
      'momonga',
      'rakko',
      'shisa',
      'usagi',
    ]);
  });

  it('라멘 차림의 요로이상도 같은 캐릭터로 본다', () => {
    assert.deepEqual(parseMogumoguTags(['ラーメンの鎧さん']).characterCodes, ['yoroisan']);
  });

  /** 지역·모티프 태그는 분류가 아니다. 버리지 않고 rest 에 남긴다 */
  it('지역 태그는 분류하지 않고 남긴다', () => {
    const parsed = parseMogumoguTags(tags);

    assert.ok(parsed.rest.includes('伏見稲荷'));
    assert.ok(!parsed.categoryCodes.includes('伏見稲荷'));
  });

  it('읽지 못한 날짜 태그도 원문으로 남긴다', () => {
    const parsed = parseMogumoguTags(['2025年20月20日　新着商品']);

    assert.equal(parsed.releasedOn, null);
    assert.deepEqual(parsed.rest, ['2025年20月20日　新着商品']);
  });

  it('묶음 표기 태그를 대표 종류로 모은다', () => {
    assert.deepEqual(parseMogumoguTags(['がま口・ポーチ・巾着']).categoryCodes, ['pouch']);
    assert.deepEqual(parseMogumoguTags(['タオル・てぬぐい']).categoryCodes, ['towel']);
    assert.deepEqual(parseMogumoguTags(['シール・ステッカー']).categoryCodes, ['sticker']);
  });

  /** 가운뎃점이 반각인 변종이 원문에 1건 있다 */
  it('가운뎃점이 반각인 태그도 받는다', () => {
    assert.deepEqual(parseMogumoguTags(['箸･箸置き']).categoryCodes, ['chopsticks']);
    assert.deepEqual(parseMogumoguTags(['箸・箸置き']).categoryCodes, ['chopsticks']);
  });

  it('product_type 을 종류로 쓴다', () => {
    assert.deepEqual(parseMogumoguTags([], 'ミニお守り').categoryCodes, ['japanese_goods']);
    assert.deepEqual(parseMogumoguTags([], '箸置き').categoryCodes, ['chopsticks']);
    assert.deepEqual(parseMogumoguTags([], 'ピンバッジ').categoryCodes, ['badge']);
  });

  /** product_type 이 비어 있는 상품이 61건 있다. 그때는 태그만으로 판정해야 한다 */
  it('product_type 이 비어도 태그로 종류를 찾는다', () => {
    assert.deepEqual(parseMogumoguTags(['マグネット'], '').categoryCodes, ['magnet']);
    assert.deepEqual(parseMogumoguTags(['お守り'], null).categoryCodes, ['japanese_goods']);
  });

  it('product_type 이 태그보다 앞에 온다', () => {
    const parsed = parseMogumoguTags(['ぬいぐるみ・マスコット'], 'マスコット');

    assert.equal(parsed.categoryCodes[0], 'mascot');
    assert.ok(parsed.categoryCodes.includes('plush'));
  });

  it('판매 형태를 플래그로 읽는다', () => {
    assert.deepEqual(parseMogumoguTags(['トレーディング商品']).flags, ['trading']);
    assert.deepEqual(parseMogumoguTags(['限定商品']).flags, ['store_limited']);
  });

  it('이 스토어에 없는 항목은 비워 둔다', () => {
    const parsed = parseMogumoguTags(tags);

    assert.deepEqual(parsed.restockedOn, []);
    assert.equal(parsed.preorderOn, null);
    assert.equal(parsed.purchaseLimit, null);
  });
});

function sample(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 10296855593281,
    title: '伏見店限定 稲荷だるまぬいぐるみ(ちいかわ)',
    body_html: '<h4>설명</h4>',
    vendor: '株式会社寺子屋',
    product_type: 'ぬいぐるみ',
    handle: 'chgs-0186',
    tags: ['2025年3月20日　新着商品', 'だるま', 'ちいかわ', 'ぬいぐるみ', '伏見稲荷'],
    created_at: '2025-03-01T00:00:00+09:00',
    updated_at: '2026-11-20T00:00:00+09:00',
    published_at: '2025-03-20T00:00:00+09:00',
    variants: [{ id: 1, title: 'Default', price: '2420', sku: 'CHGS-0186' }],
    images: [
      { src: 'https://cdn.shopify.com/s/files/1/0808/1434/2465/files/b.jpg', position: 2 },
      { src: 'https://cdn.shopify.com/s/files/1/0808/1434/2465/files/a.jpg', position: 1 },
    ],
    ...overrides,
  };
}

describe('normalizeMogumoguProduct', () => {
  const item = normalizeMogumoguProduct(sample(), 'JPY', {
    collectedAt: '2026-11-24T00:00:00.000Z',
  });

  it('출처를 모구모구로 적는다', () => {
    assert.equal(item?.source, 'mogumogu');
  });

  it('상품명을 번역하고 원문도 남긴다', () => {
    assert.equal(item?.nameKo, '후시미점 한정 이나리 다루마 인형 (치이카와)');
    assert.equal(item?.nameJa, '伏見店限定 稲荷だるまぬいぐるみ(ちいかわ)');
  });

  /** sku 가 `CHGS-0186` 꼴 자체 품번이라 JAN 이 아니다 */
  it('자체 품번을 JAN 으로 적지 않는다', () => {
    assert.equal(item?.jan, null);
  });

  it('숫자만으로 된 sku 는 JAN 으로 본다', () => {
    const withJan = normalizeMogumoguProduct(
      sample({ variants: [{ id: 1, title: 'Default', price: '2420', sku: '4571609351986' }] }),
      'JPY',
    );

    assert.equal(withJan?.jan, '4571609351986');
  });

  it('정가와 통화를 싣는다', () => {
    assert.equal(item?.listPriceJpy, 2420);
    assert.equal(item?.listPriceCurrency, 'JPY');
  });

  it('대표 이미지는 position 이 앞선 것', () => {
    assert.equal(item?.imageUrl, 'https://cdn.shopify.com/s/files/1/0808/1434/2465/files/a.jpg');
  });

  it('원본 주소를 만든다', () => {
    assert.equal(item?.sourceUrl, 'https://chiikawamogumogu.shop/products/chgs-0186');
  });

  it('Shopify 상품 id 를 싣는다', () => {
    assert.equal(item?.shopifyProductId, 10296855593281);
  });

  it('태그 원문을 통째로 보관한다', () => {
    assert.deepEqual(item?.tagsRaw, [
      '2025年3月20日　新着商品',
      'だるま',
      'ちいかわ',
      'ぬいぐるみ',
      '伏見稲荷',
    ]);
  });

  it('한국어 설명은 두지 않는다', () => {
    assert.equal(item?.descriptionKo, null);
    assert.equal(item?.productTypeKo, null);
    assert.equal(item?.productTypeJa, 'ぬいぐるみ');
  });

  it('handle 이나 상품명이 없으면 버린다', () => {
    assert.equal(normalizeMogumoguProduct(sample({ handle: '' }), 'JPY'), null);
    assert.equal(normalizeMogumoguProduct(sample({ title: '  ' }), 'JPY'), null);
  });
});
