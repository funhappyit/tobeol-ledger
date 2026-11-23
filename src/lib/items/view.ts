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
