/**
 * 화면에 보낼 형태로 줄이기
 *
 * 수집 레코드(CollectedItem)를 그대로 내려보내면 두 가지가 곤란하다.
 *   1. 상품 설명(descriptionKo)까지 실려 나간다. 화면에 띄우지 않을 내용이다.
 *   2. 전량 9천여 건이면 페이로드가 지나치게 커진다.
 *
 * 그래서 도감이 실제로 쓰는 항목만 추려 보낸다.
 * 검색 대조용 문자열도 서버에서 미리 만들어 두면 원본 태그를 통째로 보낼 필요가 없다.
 */

import type { CollectedItem, ItemSource } from '../collect/types';

/**
 * 여기 있는 항목은 전부 화면이 실제로 쓰는 것이다.
 * 캐릭터 코드나 원본 주소처럼 서버에서만 필요한 값은 일부러 뺐다.
 * 1만 건이 넘다 보니 한 건에 수십 바이트만 더해도 전체로는 메가 단위가 된다.
 */
export interface DexItem {
  handle: string;
  nameKo: string | null;
  nameJa: string | null;
  listPriceJpy: number | null;
  imageUrl: string | null;
  releasedOn: string | null;
  categoryCodes: string[];
  /** 1회계당 구매 수량 제한. 공식몰에서 수량을 묶어 파는 굿즈 표시용 */
  purchaseLimit: number | null;
  /**
   * 공식몰이 아닌 스토어의 굿즈일 때만 들어 있다. 카드에 출처 배지를 띄우는 데 쓴다.
   *
   * 값이 없으면 공식몰이라는 뜻이다. 전체 1만 건 중 공식몰이 대부분이라
   * `"source":"official"` 을 매 건에 실어 보내면 그것만으로 응답이 200KB 늘어난다.
   */
  source?: ItemSource;
  /**
   * 수집 시점에 살 수 있었던 굿즈에만 들어 있다.
   *
   * 품절(false)과 모름(null)은 키를 통째로 생략한다.
   * 공식몰 표본 750건 중 93%가 품절이라 그쪽을 실어 보내면 응답만 커지는데,
   * 화면이 쓰는 것은 "아직 살 수 있다" 하나뿐이다.
   */
  inStock?: true;
  /**
   * 검색 대조용 태그. 원본 태그를 소문자로 이어 붙인 것.
   *
   * 이름과 handle 은 담지 않는다. 그 값들은 이 응답에 이미 들어 있어서
   * 합쳐 두면 같은 글자가 두 번 실린다. 1만 건이면 그 중복만 2MB 였다.
   * 검색할 때 이름·handle 과 합치는 일은 화면 쪽이 한 번만 하면 된다(buildSearchText).
   */
  tags: string;
}

export function toDexItem(item: CollectedItem): DexItem {
  return {
    handle: item.handle,
    nameKo: item.nameKo,
    nameJa: item.nameJa,
    listPriceJpy: item.listPriceJpy,
    imageUrl: item.imageUrl,
    releasedOn: item.parsed.releasedOn,
    categoryCodes: item.parsed.categoryCodes,
    purchaseLimit: item.parsed.purchaseLimit,
    // undefined 인 키는 JSON 에 실리지 않는다. 공식몰 굿즈는 이 항목을 통째로 생략한다
    source: item.source === 'official' ? undefined : item.source,
    // true 일 때만 싣는다. 품절과 모름은 화면에서 쓰지 않는다
    inStock: item.inStock === true ? true : undefined,
    tags: item.tagsRaw.join(' ').toLowerCase(),
  };
}

/**
 * 검색에 쓸 글자를 만든다.
 *
 * 화면에서 굿즈 목록을 받은 뒤 한 번만 만들어 두고 쓴다.
 * 입력이 바뀔 때마다 만들면 1만 건을 매번 훑게 되고, 서버에서 만들어 보내면
 * 이름과 handle 이 응답에 두 번 실린다. 받는 쪽에서 한 번 만드는 것이 양쪽을 피한다.
 */
export function buildSearchText(item: DexItem): string {
  return [item.nameKo, item.nameJa, item.handle, item.tags]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

/**
 * 전송용으로 줄인 굿즈.
 *
 * `imageUrl` 자리에 `[접두어 번호, 파일명]` 이 들어간다.
 * 이미지 주소는 전체 응답의 28%를 차지하는데, 접두어가 다섯 가지뿐이라
 * 같은 55자를 1만 번 넘게 싣고 있었다.
 */
export interface PackedDexItem extends Omit<DexItem, 'imageUrl'> {
  img?: [number, string];
}

export interface PackedDexItems {
  /** `img[0]` 이 가리키는 주소 앞부분. 마지막 `/` 까지 포함한다 */
  imageBases: string[];
  items: PackedDexItem[];
}

/**
 * 이미지 주소를 접두어와 파일명으로 쪼갠다.
 *
 * `?v=1742359550` 은 Shopify 가 붙이는 캐시 갱신용 값이다.
 * 떼고 받아도 같은 이미지가 같은 크기로 내려와서(확인함) 싣지 않는다.
 * 크기 파라미터는 화면에서 붙인다(items/image.ts).
 */
export function packDexItems(items: DexItem[]): PackedDexItems {
  const imageBases: string[] = [];
  const indexByBase = new Map<string, number>();

  const packed = items.map((item): PackedDexItem => {
    const { imageUrl, ...rest } = item;

    if (!imageUrl) {
      return rest;
    }

    const url = imageUrl.split('?')[0] ?? imageUrl;
    const cut = url.lastIndexOf('/') + 1;
    const base = url.slice(0, cut);

    let index = indexByBase.get(base);
    if (index === undefined) {
      index = imageBases.push(base) - 1;
      indexByBase.set(base, index);
    }

    return { ...rest, img: [index, url.slice(cut)] };
  });

  return { imageBases, items: packed };
}

/** 쪼개 보낸 굿즈를 화면이 쓰는 모양으로 되돌린다 */
export function unpackDexItems(packed: PackedDexItems): DexItem[] {
  return packed.items.map((item): DexItem => {
    const { img, ...rest } = item;
    const base = img ? packed.imageBases[img[0]] : undefined;

    return { ...rest, imageUrl: base === undefined || !img ? null : `${base}${img[1]}` };
  });
}
