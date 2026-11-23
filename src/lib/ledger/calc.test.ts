import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculateItem,
  calculatePurchase,
  summarize,
  type Purchase,
  type PurchaseItem,
} from './calc';

function item(overrides: Partial<PurchaseItem> = {}): PurchaseItem {
  return {
    handle: 'item-1',
    name: '굿즈',
    quantity: 1,
    itemPriceKrw: 0,
    listPriceJpy: null,
    ...overrides,
  };
}

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'p1',
    source: 'danggeun',
    purchasedOn: '2026-11-20',
    shippingKrw: 0,
    feeKrw: 0,
    fxRate: null,
    memo: null,
    items: [],
    ...overrides,
  };
}

describe('calculateItem', () => {
  it('정가보다 비싸게 산 경우 플미가 양수다', () => {
    // 정가 1,000엔 × 9원 = 9,000원인데 15,000원에 샀다
    const result = calculateItem(item({ itemPriceKrw: 15000, listPriceJpy: 1000 }), 9);

    assert.equal(result.listPriceKrw, 9000);
    assert.equal(result.premiumKrw, 6000);
    assert.equal(result.premiumRate, 66.7);
  });

  it('정가보다 싸게 산 경우 플미가 음수다', () => {
    const result = calculateItem(item({ itemPriceKrw: 7000, listPriceJpy: 1000 }), 9);

    assert.equal(result.premiumKrw, -2000);
    assert.equal(result.premiumRate, -22.2);
  });

  it('수량을 반영해 정가를 환산한다', () => {
    const result = calculateItem(
      item({ quantity: 3, itemPriceKrw: 30000, listPriceJpy: 1000 }),
      9,
    );

    assert.equal(result.listPriceKrw, 27000);
    assert.equal(result.premiumKrw, 3000);
  });

  it('정가나 환율을 모르면 계산하지 않는다', () => {
    assert.equal(calculateItem(item({ itemPriceKrw: 15000 }), 9).premiumKrw, null);
    assert.equal(calculateItem(item({ itemPriceKrw: 15000, listPriceJpy: 1000 }), null).premiumKrw, null);
  });
});

describe('calculatePurchase', () => {
  it('여러 굿즈를 한 번에 사도 배송비는 한 번만 더한다', () => {
    const result = calculatePurchase(
      purchase({
        fxRate: 9,
        shippingKrw: 4000,
        feeKrw: 1000,
        items: [
          item({ handle: 'a', itemPriceKrw: 15000, listPriceJpy: 1000 }), // 플미 +6,000
          item({ handle: 'b', itemPriceKrw: 10000, listPriceJpy: 1000 }), // 플미 +1,000
        ],
      }),
    );

    assert.equal(result.itemTotalKrw, 25000);
    assert.equal(result.listTotalKrw, 18000);
    assert.equal(result.premiumKrw, 7000);
    // 배송비·수수료는 굿즈 수와 무관하게 한 번
    assert.equal(result.totalKrw, 30000);
  });

  it('배송비와 수수료는 플미에 들어가지 않는다', () => {
    // 배대지를 거쳐 정가에 샀다면 플미는 0 이어야 한다
    const result = calculatePurchase(
      purchase({
        fxRate: 9,
        shippingKrw: 5000,
        feeKrw: 2000,
        items: [item({ itemPriceKrw: 9000, listPriceJpy: 1000 })],
      }),
    );

    assert.equal(result.premiumKrw, 0);
    assert.equal(result.premiumRate, 0);
    assert.equal(result.totalKrw, 16000);
  });

  it('정가를 아는 굿즈만 플미에 넣고 나머지는 센다', () => {
    const result = calculatePurchase(
      purchase({
        fxRate: 9,
        items: [
          item({ handle: 'a', itemPriceKrw: 15000, listPriceJpy: 1000 }),
          item({ handle: 'b', itemPriceKrw: 5000 }), // 정가 모름
        ],
      }),
    );

    assert.equal(result.itemTotalKrw, 20000);
    assert.equal(result.premiumKrw, 6000);
    assert.equal(result.unknownCount, 1);
  });

  it('정가를 아는 굿즈가 하나도 없으면 플미는 null 이다', () => {
    const result = calculatePurchase(
      purchase({ shippingKrw: 3000, items: [item({ itemPriceKrw: 5000 })] }),
    );

    assert.equal(result.premiumKrw, null);
    assert.equal(result.premiumRate, null);
    // 총지출은 그래도 나온다
    assert.equal(result.totalKrw, 8000);
  });
});

describe('summarize', () => {
  it('구매 건수와 굿즈 수를 따로 센다', () => {
    const summary = summarize([
      purchase({
        id: 'p1',
        fxRate: 9,
        shippingKrw: 3000,
        items: [
          item({ handle: 'a', itemPriceKrw: 15000, listPriceJpy: 1000 }),
          item({ handle: 'b', itemPriceKrw: 9000, listPriceJpy: 1000 }),
        ],
      }),
      purchase({
        id: 'p2',
        fxRate: 9,
        shippingKrw: 2500,
        items: [item({ handle: 'c', itemPriceKrw: 12000, listPriceJpy: 1000 })],
      }),
    ]);

    assert.equal(summary.purchaseCount, 2);
    assert.equal(summary.itemCount, 3);
    assert.equal(summary.itemTotalKrw, 36000);
    assert.equal(summary.shippingTotalKrw, 5500);
    assert.equal(summary.totalKrw, 41500);
    // 정가 합 27,000 / 플미 +9,000
    assert.equal(summary.listTotalKrw, 27000);
    assert.equal(summary.premiumKrw, 9000);
    assert.equal(summary.premiumRate, 33.3);
  });

  it('정가보다 싸게 산 건이 비싸게 산 건을 상쇄한다', () => {
    const summary = summarize([
      purchase({ id: 'p1', fxRate: 9, items: [item({ itemPriceKrw: 15000, listPriceJpy: 1000 })] }),
      purchase({ id: 'p2', fxRate: 9, items: [item({ itemPriceKrw: 3000, listPriceJpy: 1000 })] }),
    ]);

    assert.equal(summary.premiumKrw, 0);
    assert.equal(summary.premiumRate, 0);
  });

  it('기록이 없으면 플미율은 null 이다', () => {
    const summary = summarize([]);

    assert.equal(summary.purchaseCount, 0);
    assert.equal(summary.totalKrw, 0);
    assert.equal(summary.premiumRate, null);
  });
});
