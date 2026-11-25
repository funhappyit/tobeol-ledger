/**
 * 상품 JSON 에서 값 뽑기 테스트
 *
 * 재고는 "모름"과 "품절"을 가르는 것이 핵심이다.
 * 포켓 스토어처럼 재고를 안 내려주는 곳이 있어서, 둘을 섞으면 없는 사실을 지어내게 된다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pickInStock } from './product';
import type { ShopifyProduct, ShopifyVariant } from './types';

function variant(overrides: Partial<ShopifyVariant> = {}): ShopifyVariant {
  return { id: 1, title: '기본', price: '1980', sku: null, ...overrides };
}

function product(variants: ShopifyVariant[]): ShopifyProduct {
  return {
    id: 1,
    title: 'ちいかわ マスコット',
    handle: '4582662917873',
    vendor: '치이카와 마켓',
    product_type: 'ぬいぐるみ',
    tags: [],
    updated_at: '2026-11-24T00:00:00Z',
    variants,
    images: [],
  } as ShopifyProduct;
}

describe('pickInStock', () => {
  it('품목이 하나뿐이면 그 값을 쓴다', () => {
    assert.equal(pickInStock(product([variant({ available: true })])), true);
    assert.equal(pickInStock(product([variant({ available: false })])), false);
  });

  /**
   * 색이 넷인 티셔츠에서 한 색만 남아도 그 굿즈는 아직 토벌할 수 있다.
   */
  it('품목이 여럿이면 하나라도 살 수 있을 때 true', () => {
    const item = product([
      variant({ id: 1, available: false }),
      variant({ id: 2, available: false }),
      variant({ id: 3, available: true }),
    ]);

    assert.equal(pickInStock(item), true);
  });

  it('전 품목이 품절이면 false', () => {
    const item = product([variant({ id: 1, available: false }), variant({ id: 2, available: false })]);

    assert.equal(pickInStock(item), false);
  });

  it('재고를 안 내려주면 null. 품절이 아니라 모른다는 뜻이다', () => {
    assert.equal(pickInStock(product([variant(), variant({ id: 2 })])), null);
  });

  it('품목이 아예 없어도 null', () => {
    assert.equal(pickInStock(product([])), null);
  });

  it('일부 품목만 값이 있으면 그 값들로만 판단한다', () => {
    const item = product([variant({ id: 1 }), variant({ id: 2, available: true })]);

    assert.equal(pickInStock(item), true);
  });
});
