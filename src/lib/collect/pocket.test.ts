/**
 * 포켓 굿즈 스토어 수집 테스트
 *
 * 입력값은 전부 실제 페이지에서 가져온 것이다. 테스트는 네트워크를 쓰지 않는다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractOpenGraph,
  extractProductLd,
  extractProductUrls,
  handleFromUrl,
  normalizePocketItem,
  parsePocketName,
  POCKET_ORIGIN,
} from './pocket';

/** 실제 sitemap.xml 의 일부 */
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://chiikawa-pocket-goods-store.com/</loc></url>
<url><loc>https://chiikawa-pocket-goods-store.com/products/</loc></url>
<url><loc>https://chiikawa-pocket-goods-store.com/faq/</loc></url>
<url><loc>https://chiikawa-pocket-goods-store.com/products/b75cc1e26d57488cf85f66f3f2d684f6/</loc></url>
<url><loc>https://chiikawa-pocket-goods-store.com/products/d3c5fbbacbef1db9c67ab8426004f586/</loc></url>
</urlset>`;

/** 실제 상품 페이지에서 가져온 JSON-LD */
const PRODUCT_LD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'ちいかわぽけっと 江戸なクリアファイル',
  description: '「江戸」をモチーフとした、ちいかわぽけっとオリジナル衣装のクリアファイルです。',
  image: [
    'https://cdn.shopify.com/s/files/1/0945/8047/4143/files/f3a87c65c74cbf8be9d145952a25a066.webp?v=1768044441',
    'https://cdn.shopify.com/s/files/1/0945/8047/4143/files/f3a87c65c64cbf8be9d145952a259f2b.webp?v=1768044440',
  ],
  url: 'https://chiikawa-pocket-goods-store.com/products/b75cc1e26d57488cf85f66f3f2d684f6',
  offers: {
    '@type': 'Offer',
    price: '440.0',
    priceCurrency: 'JPY',
    itemCondition: 'https://schema.org/NewCondition',
  },
};

/**
 * 사이즈 변형이 있는 상품의 실제 구조.
 * 가격이 상품에 직접 붙지 않고 변형마다 붙는다.
 */
const PRODUCT_GROUP_LD = {
  '@context': 'https://schema.org',
  '@type': 'ProductGroup',
  productGroupID: '1b4f934c654d0597f6d990da5441b039',
  name: 'ちいかわぽけっと ピクニックなTシャツ ホワイト',
  description: '「ピクニック」をモチーフとした、ちいかわぽけっとオリジナル衣装のTシャツです。',
  image: ['https://cdn.shopify.com/s/files/1/0945/8047/4143/files/b40857020b44.webp?v=1768044433'],
  url: 'https://chiikawa-pocket-goods-store.com/products/1b4f934c654d0597f6d990da5441b039',
  variesBy: ['サイズ'],
  hasVariant: [
    {
      '@type': 'Product',
      name: 'ちいかわぽけっと ピクニックなTシャツ ホワイト M',
      offers: { '@type': 'Offer', price: '4400.0', priceCurrency: 'JPY' },
    },
    {
      '@type': 'Product',
      name: 'ちいかわぽけっと ピクニックなTシャツ ホワイト L',
      offers: { '@type': 'Offer', price: '4620.0', priceCurrency: 'JPY' },
    },
  ],
};

describe('extractProductUrls', () => {
  it('상품 URL 만 골라낸다', () => {
    const urls = extractProductUrls(SITEMAP);

    assert.deepEqual(urls, [
      `${POCKET_ORIGIN}/products/b75cc1e26d57488cf85f66f3f2d684f6/`,
      `${POCKET_ORIGIN}/products/d3c5fbbacbef1db9c67ab8426004f586/`,
    ]);
  });

  it('목록·안내 페이지는 상품으로 세지 않는다', () => {
    const urls = extractProductUrls(SITEMAP);

    assert.ok(!urls.some((url) => url.endsWith('/products/')));
    assert.ok(!urls.some((url) => url.endsWith('/faq/')));
  });

  it('다른 호스트의 URL 은 버린다', () => {
    const xml = '<urlset><url><loc>https://example.com/products/' + 'a'.repeat(32) + '/</loc></url></urlset>';

    assert.deepEqual(extractProductUrls(xml), []);
  });
});

describe('handleFromUrl', () => {
  it('32자 16진수 handle 을 뽑는다', () => {
    assert.equal(
      handleFromUrl(`${POCKET_ORIGIN}/products/b75cc1e26d57488cf85f66f3f2d684f6/`),
      'b75cc1e26d57488cf85f66f3f2d684f6',
    );
  });

  it('끝 슬래시가 없어도 읽는다', () => {
    assert.equal(
      handleFromUrl(`${POCKET_ORIGIN}/products/b75cc1e26d57488cf85f66f3f2d684f6`),
      'b75cc1e26d57488cf85f66f3f2d684f6',
    );
  });

  it('상품 URL 이 아니면 null 이다', () => {
    assert.equal(handleFromUrl(`${POCKET_ORIGIN}/products/`), null);
    assert.equal(handleFromUrl(`${POCKET_ORIGIN}/faq/`), null);
    assert.equal(handleFromUrl('그냥 문자열'), null);
  });
});

describe('extractProductLd', () => {
  it('Product 구조화 데이터를 꺼낸다', () => {
    const html = `<head><script type="application/ld+json">${JSON.stringify(PRODUCT_LD)}</script></head>`;
    const ld = extractProductLd(html);

    assert.equal(ld?.name, 'ちいかわぽけっと 江戸なクリアファイル');
    assert.equal(ld?.offers?.price, '440.0');
  });

  it('Product 가 아닌 블록은 건너뛴다', () => {
    const other = { '@type': 'BreadcrumbList', itemListElement: [] };
    const html =
      `<script type="application/ld+json">${JSON.stringify(other)}</script>` +
      `<script type="application/ld+json">${JSON.stringify(PRODUCT_LD)}</script>`;

    assert.equal(extractProductLd(html)?.name, 'ちいかわぽけっと 江戸なクリアファイル');
  });

  it('한 블록에 배열로 담겨 있어도 찾는다', () => {
    const html = `<script type="application/ld+json">${JSON.stringify([{ '@type': 'Organization' }, PRODUCT_LD])}</script>`;

    assert.equal(extractProductLd(html)?.offers?.priceCurrency, 'JPY');
  });

  it('깨진 JSON 은 건너뛰고 다음 블록을 본다', () => {
    const html =
      '<script type="application/ld+json">{ 깨짐 </script>' +
      `<script type="application/ld+json">${JSON.stringify(PRODUCT_LD)}</script>`;

    assert.equal(extractProductLd(html)?.name, 'ちいかわぽけっと 江戸なクリアファイル');
  });

  it('구조화 데이터가 없으면 null 이다', () => {
    assert.equal(extractProductLd('<html><body>아무것도 없음</body></html>'), null);
  });

  /** 사이즈·색상 변형이 있는 상품은 Product 가 아니라 ProductGroup 으로 내려온다 */
  it('ProductGroup 도 상품으로 받는다', () => {
    const html = `<script type="application/ld+json">${JSON.stringify(PRODUCT_GROUP_LD)}</script>`;

    assert.equal(extractProductLd(html)?.['@type'], 'ProductGroup');
  });

  it('변형 안의 Product 를 따로 집지 않는다', () => {
    const html = `<script type="application/ld+json">${JSON.stringify(PRODUCT_GROUP_LD)}</script>`;

    // 변형 이름(`... M`)이 아니라 대표 이름이 나와야 한다
    assert.equal(extractProductLd(html)?.name, 'ちいかわぽけっと ピクニックなTシャツ ホワイト');
  });
});

describe('normalizePocketItem (ProductGroup)', () => {
  const item = normalizePocketItem(PRODUCT_GROUP_LD, { collectedAt: '2026-11-23T00:00:00.000Z' });

  it('변형이 있어도 한 건으로 다룬다', () => {
    assert.equal(item?.handle, '1b4f934c654d0597f6d990da5441b039');
    assert.equal(item?.nameJa, 'ちいかわぽけっと ピクニックなTシャツ ホワイト');
  });

  it('정가는 변형 중 최저가다', () => {
    assert.equal(item?.listPriceJpy, 4400);
    assert.equal(item?.listPriceCurrency, 'JPY');
  });

  it('종류는 대표 이름에서 찾는다', () => {
    assert.deepEqual(item?.parsed.categoryCodes, ['tshirt_hoodie']);
  });

  it('주소가 없으면 productGroupID 를 handle 로 쓴다', () => {
    const noUrl = normalizePocketItem({ ...PRODUCT_GROUP_LD, url: undefined });

    assert.equal(noUrl?.handle, '1b4f934c654d0597f6d990da5441b039');
  });

  it('변형에 가격이 없으면 null 이다', () => {
    const noPrice = normalizePocketItem({
      ...PRODUCT_GROUP_LD,
      hasVariant: [{ name: 'M' }, { name: 'L' }],
    });

    assert.equal(noPrice?.listPriceJpy, null);
  });
});

/**
 * 구조화 데이터가 없는 페이지의 og 메타태그.
 * 크리스마스 마켓 시리즈가 이 형태이고, 가격은 HTML 에 아예 없다.
 */
const OG_HTML = `<head>
<meta property="og:title" content="ちいかわクリスマスマーケット サンタさんなマスコット（ハチワレ） | 【公式】ちいかわぽけっとグッズストア">
<meta property="og:description" content="「ちいかわクリスマスマーケット」限定デザインのマスコットです。">
<meta property="og:image" content="https://cdn.shopify.com/s/files/1/0945/8047/4143/files/e2ed2b39.webp?v=1795170034">
<meta property="og:site_name" content="ちいかわぽけっとグッズストア | 公式グッズオンラインストア">
</head>`;

describe('extractOpenGraph', () => {
  it('제목에서 스토어 이름을 떼어낸다', () => {
    assert.equal(
      extractOpenGraph(OG_HTML)?.name,
      'ちいかわクリスマスマーケット サンタさんなマスコット（ハチワレ）',
    );
  });

  it('이미지를 배열로 돌려준다', () => {
    const ld = extractOpenGraph(OG_HTML);

    assert.ok(Array.isArray(ld?.image));
    assert.ok((ld?.image as string[])[0].includes('e2ed2b39'));
  });

  it('가격은 담지 않는다', () => {
    assert.equal(extractOpenGraph(OG_HTML)?.offers, undefined);
  });

  it('og:title 이 없으면 null 이다', () => {
    assert.equal(extractOpenGraph('<head><meta property="og:image" content="x"></head>'), null);
  });
});

describe('og 로만 만든 레코드', () => {
  const item = normalizePocketItem(extractOpenGraph(OG_HTML)!, {
    url: `${POCKET_ORIGIN}/products/ced53c8d0bc9362bf860d5f216cff758/`,
    collectedAt: '2026-11-23T00:00:00.000Z',
  });

  it('정가는 미정으로 남는다', () => {
    assert.equal(item?.listPriceJpy, null);
    assert.equal(item?.listPriceCurrency, null);
  });

  it('캐릭터와 종류는 그대로 판정된다', () => {
    assert.deepEqual(item?.parsed.characterCodes, ['hachiware']);
    assert.deepEqual(item?.parsed.categoryCodes, ['mascot']);
  });

  it('handle 은 넘겨받은 주소에서 가져온다', () => {
    assert.equal(item?.handle, 'ced53c8d0bc9362bf860d5f216cff758');
  });
});

describe('parsePocketName', () => {
  it('괄호 안의 캐릭터를 읽는다', () => {
    const parts = parsePocketName('ちいかわぽけっと ピクニックなマスコット（ハチワレ）');

    assert.equal(parts.bracket, 'ハチワレ');
    assert.equal(parts.body, 'ピクニックなマスコット');
    assert.deepEqual(parts.characterCodes, ['hachiware']);
    assert.deepEqual(parts.categoryCodes, ['mascot']);
  });

  /**
   * 접두사 `ちいかわぽけっと` 안에 캐릭터명 `ちいかわ` 가 들어 있다.
   * 접두사를 떼지 않으면 모든 상품이 치이카와 굿즈가 되어 버린다.
   */
  it('접두사의 ちいかわ 를 캐릭터로 세지 않는다', () => {
    const parts = parsePocketName('ちいかわぽけっと ピクニックなマスコット（ハチワレ）');

    assert.ok(!parts.characterCodes.includes('chiikawa'));
  });

  it('괄호 안이 치이카와면 치이카와로 센다', () => {
    const parts = parsePocketName('ちいかわぽけっと ピクニックなマスコット（ちいかわ）');

    assert.deepEqual(parts.characterCodes, ['chiikawa']);
  });

  it('괄호가 없는 상품은 본문에서 캐릭터를 찾는다', () => {
    const parts = parsePocketName('ちいかわぽけっと 江戸なクリアファイル');

    assert.equal(parts.bracket, null);
    assert.deepEqual(parts.characterCodes, []);
    assert.deepEqual(parts.categoryCodes, ['clear_file']);
  });

  it('괄호에 캐릭터가 여럿이면 모두 센다', () => {
    const parts = parsePocketName('ちいかわぽけっと なにかなタオル（ちいかわ・ハチワレ・うさぎ）');

    assert.deepEqual(parts.characterCodes.sort(), ['chiikawa', 'hachiware', 'usagi']);
  });

  it('반각 괄호도 읽는다', () => {
    const parts = parsePocketName('ちいかわぽけっと なにかなマスコット(モモンガ)');

    assert.deepEqual(parts.characterCodes, ['momonga']);
  });

  it('긴 종류 키워드를 짧은 것보다 먼저 맞춘다', () => {
    const parts = parsePocketName('ちいかわぽけっと なにかなハンドタオル');

    assert.deepEqual(parts.categoryCodes, ['hand_towel']);
    assert.ok(!parts.categoryCodes.includes('towel'));
  });

  /** 크리스마스 마켓 접두사에도 `ちいかわ` 가 들어 있다 */
  it('다른 시리즈 접두사의 ちいかわ 도 캐릭터로 세지 않는다', () => {
    const parts = parsePocketName('ちいかわクリスマスマーケット サンタさんなマスコット（うさぎ）');

    assert.deepEqual(parts.characterCodes, ['usagi']);
    assert.equal(parts.body, 'サンタさんなマスコット');
  });

  it('접두사가 없는 이름도 그대로 다룬다', () => {
    const parts = parsePocketName('なにかなマスコット（うさぎ）');

    assert.deepEqual(parts.characterCodes, ['usagi']);
    assert.deepEqual(parts.categoryCodes, ['mascot']);
  });
});

describe('normalizePocketItem', () => {
  const item = normalizePocketItem(PRODUCT_LD, { collectedAt: '2026-11-23T00:00:00.000Z' });

  it('출처를 pocket 으로 남긴다', () => {
    assert.equal(item?.source, 'pocket');
  });

  it('handle 은 URL 에서 가져온다', () => {
    assert.equal(item?.handle, 'b75cc1e26d57488cf85f66f3f2d684f6');
  });

  it('가격을 정수 엔으로 바꾼다', () => {
    assert.equal(item?.listPriceJpy, 440);
    assert.equal(item?.listPriceCurrency, 'JPY');
  });

  it('대표 이미지는 첫 장이다', () => {
    assert.ok(item?.imageUrl?.includes('f3a87c65c74cbf8be9d145952a25a066'));
  });

  it('일본어 원문을 남기고 한국어 자리에는 옮긴 이름을 넣는다', () => {
    assert.equal(item?.nameJa, 'ちいかわぽけっと 江戸なクリアファイル');
    assert.equal(item?.nameKo, '치이카와 포켓 에도 클리어파일');
  });

  /** 발매일을 알 수 있는 경로가 없다. 이미지 버전으로 추측해 넣지 않는다 */
  it('발매일은 null 이다', () => {
    assert.equal(item?.parsed.releasedOn, null);
  });

  it('없는 정보는 null 로 둔다', () => {
    assert.equal(item?.shopifyProductId, null);
    assert.equal(item?.jan, null);
    assert.equal(item?.vendor, null);
    assert.deepEqual(item?.tagsRaw, []);
  });

  it('최종 수정 시각은 이미지 버전에서 가져온다', () => {
    assert.equal(item?.updatedAt, new Date(1768044441 * 1000).toISOString());
  });

  it('이미지에 버전이 없으면 수집 시각을 쓴다', () => {
    const noVersion = normalizePocketItem(
      { ...PRODUCT_LD, image: ['https://cdn.shopify.com/s/files/1/a.webp'] },
      { collectedAt: '2026-11-23T00:00:00.000Z' },
    );

    assert.equal(noVersion?.updatedAt, '2026-11-23T00:00:00.000Z');
  });

  it('종류를 못 찾으면 상품명 본문을 rest 에 남긴다', () => {
    const unknown = normalizePocketItem({ ...PRODUCT_LD, name: 'ちいかわぽけっと 謎のなにか' });

    assert.deepEqual(unknown?.parsed.categoryCodes, []);
    assert.deepEqual(unknown?.parsed.rest, ['謎のなにか']);
  });

  it('url 이 없으면 넘겨받은 주소로 handle 을 찾는다', () => {
    const noUrl = normalizePocketItem(
      { ...PRODUCT_LD, url: undefined },
      { url: `${POCKET_ORIGIN}/products/d3c5fbbacbef1db9c67ab8426004f586/` },
    );

    assert.equal(noUrl?.handle, 'd3c5fbbacbef1db9c67ab8426004f586');
  });

  it('handle 을 알 수 없으면 버린다', () => {
    assert.equal(normalizePocketItem({ ...PRODUCT_LD, url: `${POCKET_ORIGIN}/faq/` }), null);
  });

  it('이름이 없으면 버린다', () => {
    assert.equal(normalizePocketItem({ ...PRODUCT_LD, name: '   ' }), null);
  });

  it('가격이 없으면 null 이다', () => {
    const noPrice = normalizePocketItem({ ...PRODUCT_LD, offers: { priceCurrency: 'JPY' } });

    assert.equal(noPrice?.listPriceJpy, null);
  });
});
