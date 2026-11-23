import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculatePremium, summarize, type Acquisition } from './calc';

/** 기본값이 채워진 기록을 만든다. 시험할 값만 덮어쓴다 */
function record(overrides: Partial<Acquisition> = {}): Acquisition {
  return {
    id: 'x',
    handle: 'item-1',
    source: 'danggeun',
    purchasedOn: '2026-11-20',
    quantity: 1,
    itemPriceKrw: 0,
    shippingKrw: 0,
    feeKrw: 0,
    listPriceJpy: null,
    fxRate: null,
    memo: null,
    ...overrides,
  };
}

describe('calculatePremium', () => {
  it('정가보다 비싸게 산 경우 플미가 양수다', () => {
    // 정가 1,000엔 × 9원 = 9,000원인데 15,000원에 샀다
    const result = calculatePremium(
      record({ itemPriceKrw: 15000, listPriceJpy: 1000, fxRate: 9 }),
    );

    assert.equal(result.listPriceKrw, 9000);
    assert.equal(result.premiumKrw, 6000);
    assert.equal(result.premiumRate, 66.7);
  });

  it('정가보다 싸게 산 경우 플미가 음수다', () => {
    const result = calculatePremium(
      record({ itemPriceKrw: 7000, listPriceJpy: 1000, fxRate: 9 }),
    );

    assert.equal(result.premiumKrw, -2000);
    assert.equal(result.premiumRate, -22.2);
  });

  it('배송비와 수수료는 플미에 들어가지 않는다', () => {
    // 배대지를 거쳐 정가에 샀다면 플미는 0 이어야 한다
    const result = calculatePremium(
      record({ itemPriceKrw: 9000, shippingKrw: 5000, feeKrw: 2000, listPriceJpy: 1000, fxRate: 9 }),
    );

    assert.equal(result.premiumKrw, 0);
    assert.equal(result.premiumRate, 0);
    // 총지출에는 전부 들어간다
    assert.equal(result.totalKrw, 16000);
  });

  it('수량을 반영해 정가를 환산한다', () => {
    const result = calculatePremium(
      record({ quantity: 3, itemPriceKrw: 30000, listPriceJpy: 1000, fxRate: 9 }),
    );

    assert.equal(result.listPriceKrw, 27000);
    assert.equal(result.premiumKrw, 3000);
  });

  it('정가를 모르면 플미를 계산하지 않는다', () => {
    const result = calculatePremium(record({ itemPriceKrw: 15000, fxRate: 9 }));

    assert.equal(result.listPriceKrw, null);
    assert.equal(result.premiumKrw, null);
    assert.equal(result.premiumRate, null);
    // 총지출은 그래도 나온다
    assert.equal(result.totalKrw, 15000);
  });

  it('환율을 모르면 플미를 계산하지 않는다', () => {
    const result = calculatePremium(record({ itemPriceKrw: 15000, listPriceJpy: 1000 }));

    assert.equal(result.premiumKrw, null);
    assert.equal(result.totalKrw, 15000);
  });
});

describe('summarize', () => {
  it('플미를 계산할 수 있는 기록만 플미 합계에 넣는다', () => {
    const summary = summarize([
      record({ itemPriceKrw: 15000, listPriceJpy: 1000, fxRate: 9 }), // 플미 +6,000
      record({ itemPriceKrw: 9000, listPriceJpy: 1000, fxRate: 9 }), // 플미 0
      record({ itemPriceKrw: 5000 }), // 정가 모름
    ]);

    assert.equal(summary.count, 3);
    assert.equal(summary.unknownCount, 1);
    assert.equal(summary.listTotalKrw, 18000);
    assert.equal(summary.premiumKrw, 6000);
    assert.equal(summary.premiumRate, 33.3);
  });

  it('정가보다 싸게 산 건이 비싸게 산 건을 상쇄한다', () => {
    const summary = summarize([
      record({ itemPriceKrw: 15000, listPriceJpy: 1000, fxRate: 9 }), // +6,000
      record({ itemPriceKrw: 3000, listPriceJpy: 1000, fxRate: 9 }), // -6,000
    ]);

    assert.equal(summary.premiumKrw, 0);
    assert.equal(summary.premiumRate, 0);
  });

  it('배송비와 수수료를 따로 합산한다', () => {
    const summary = summarize([
      record({ itemPriceKrw: 10000, shippingKrw: 3000, feeKrw: 1000 }),
      record({ itemPriceKrw: 20000, shippingKrw: 2500, feeKrw: 500 }),
    ]);

    assert.equal(summary.itemTotalKrw, 30000);
    assert.equal(summary.shippingTotalKrw, 5500);
    assert.equal(summary.feeTotalKrw, 1500);
    assert.equal(summary.totalKrw, 37000);
  });

  it('기록이 없으면 플미율은 null 이다', () => {
    const summary = summarize([]);

    assert.equal(summary.count, 0);
    assert.equal(summary.totalKrw, 0);
    assert.equal(summary.premiumRate, null);
  });
});
