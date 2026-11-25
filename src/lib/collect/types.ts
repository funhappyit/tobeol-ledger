/**
 * 굿즈 수집 공통 타입
 *
 * 공식몰(Shopify) 상품 JSON 원본과, 우리 도메인으로 정규화한 형태를 분리해서 둔다.
 */

/**
 * 굿즈를 어디서 수집했는지.
 *
 *   official  — 치이카와 마켓(공식몰). Shopify 상품 JSON 을 받는다
 *   pocket    — 치이카와 포켓 굿즈 스토어. 상품 페이지의 JSON-LD 를 읽는다
 *   mogumogu  — 치이카와 모구모구 본포. 후시미·카와고에·오타루 지역 한정몰.
 *               공식몰과 같은 Shopify 라 상품 JSON 을 그대로 받는다
 *
 * 세 스토어는 같은 굿즈를 팔지 않아서 중복 걱정이 없고, handle 형식도 겹치지 않는다
 * (공식몰은 JAN 코드 같은 숫자, 포켓은 32자 16진수, 모구모구는 `chth-0089` 꼴 품번).
 */
export type ItemSource = 'official' | 'pocket' | 'mogumogu';

/** Shopify 상품 JSON의 variant (필요한 필드만) */
export interface ShopifyVariant {
  id: number;
  title: string;
  /** 정가. 문자열로 내려온다. 예: "1430" */
  price: string;
  /** JAN 코드 */
  sku: string | null;
  available?: boolean;
}

/** Shopify 상품 JSON의 이미지 (필요한 필드만) */
export interface ShopifyImage {
  src: string;
  position: number;
}

/** `/products/{handle}.json` 응답의 product 객체 (필요한 필드만) */
export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  handle: string;
  tags: string | string[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

/** 태그 문자열에서 뽑아낸 구조화 정보 */
export interface ParsedTags {
  /** 발매일 (YYYY-MM-DD). 8자리 숫자 태그 중 가장 이른 것 */
  releasedOn: string | null;
  /** 재입고일 목록 (RE 접두 태그), 오름차순 */
  restockedOn: string[];
  /** 발매 예정일 (PRE 접두 태그) */
  preorderOn: string | null;
  /** 캐릭터 코드 목록. 예: ["chiikawa", "hachiware"] */
  characterCodes: string[];
  /** 종류 코드 목록. 예: ["plush"] */
  categoryCodes: string[];
  /** 1회계당 구매 수량 제한. 예: 2 (`2個/1会計`) */
  purchaseLimit: number | null;
  /** 판매 조건 플래그. 예: ["overseas_ng", "preorder"] */
  flags: string[];
  /** 위 어느 분류에도 안 걸린 나머지 태그 원문 (시리즈·이벤트명 등) */
  rest: string[];
}

/** DB에 적재할 정규화된 굿즈 1건 */
export interface CollectedItem {
  /**
   * 어느 스토어에서 온 굿즈인지.
   *
   * 공식몰만 수집하던 시기의 레코드에는 이 필드가 없다.
   * 읽는 쪽(items/source.ts)에서 'official' 로 채우므로 기존 수집본을 다시 받을 필요는 없다.
   */
  source: ItemSource;
  /**
   * Shopify 상품 id.
   * 포켓 스토어는 상품 페이지에 id 를 노출하지 않아 null 이다.
   */
  shopifyProductId: number | null;
  /** 상품 handle. 이 스토어에서는 JAN 코드와 동일한 경우가 많다 */
  handle: string;
  jan: string | null;
  nameKo: string | null;
  nameJa: string | null;
  descriptionKo: string | null;
  /** 공식몰이 붙인 분류 문자열 (로케일마다 달라서 참고용으로만 쓴다) */
  productTypeKo: string | null;
  productTypeJa: string | null;
  vendor: string | null;
  /** 정가(엔). variants 중 최저가 */
  listPriceJpy: number | null;
  /**
   * 수집 시점 공식몰의 활성 통화.
   * 상품 JSON 에는 통화 표시가 없고 지역에 따라 값이 바뀌므로, 수집할 때 확인한 값을 같이 남긴다.
   * JPY 가 아니면 listPriceJpy 를 정가로 믿으면 안 된다.
   */
  listPriceCurrency: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  /**
   * 수집 시점에 살 수 있었는지.
   *
   * `null` 은 "품절"이 아니라 "알 수 없음"이다. 포켓 스토어가 그렇다.
   * 그쪽은 상품 페이지의 구조화 데이터에 재고 표시가 없어서 확인할 길이 없는데,
   * 모르는 것을 품절로 적으면 거짓이 된다.
   *
   * 언제 본 값인지는 `collectedAt` 이 말해 준다. 수집 주기가 스토어마다 달라서
   * (공식몰 하루, 포켓 한 주, 모구모구 한 달) 이 값만으로 "지금"을 말할 수는 없다.
   */
  inStock: boolean | null;
  /** 태그 원문. 분류 규칙이 바뀌어도 재수집 없이 다시 해석할 수 있도록 통째로 보관한다 */
  tagsRaw: string[];
  parsed: ParsedTags;
  /** 공식몰 기준 최종 수정 시각 */
  updatedAt: string;
  collectedAt: string;
}
