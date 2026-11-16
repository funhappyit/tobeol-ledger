/**
 * 활성 통화 파서 테스트
 *
 * 입력 형태는 공식몰 상품 페이지에서 실제로 확인한 것이다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseActiveCurrency } from './currency';

describe('parseActiveCurrency', () => {
  it('공식몰 페이지의 통화 선언을 읽는다', () => {
    const html = '<script>var x=1;Shopify.currency = {"active":"JPY","rate":"1.0"};</script>';

    assert.equal(parseActiveCurrency(html), 'JPY');
  });

  it('엔화가 아닌 통화도 그대로 읽는다', () => {
    const html = 'Shopify.currency = {"active":"KRW","rate":"9.8"};';

    assert.equal(parseActiveCurrency(html), 'KRW');
  });

  it('공백 형태가 달라도 읽는다', () => {
    assert.equal(parseActiveCurrency('Shopify.currency={"active":"USD","rate":"1.0"};'), 'USD');
  });

  it('선언이 없으면 null 이다', () => {
    assert.equal(parseActiveCurrency('<html><body>상품 페이지</body></html>'), null);
  });

  it('통화 코드 형식이 아니면 null 이다', () => {
    assert.equal(parseActiveCurrency('Shopify.currency = {"active":"엔","rate":"1.0"};'), null);
    assert.equal(parseActiveCurrency('Shopify.currency = {"rate":"1.0"};'), null);
  });

  it('JSON 이 깨져 있으면 null 이다', () => {
    assert.equal(parseActiveCurrency('Shopify.currency = {active:JPY};'), null);
  });
});
