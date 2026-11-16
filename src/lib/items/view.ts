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

import type { CollectedItem } from '../collect/types';

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
  /** 검색 대조용. 한국어명·일본어명·원본 태그를 소문자로 합쳐 둔 것 */
  search: string;
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
    search: [item.nameKo, item.nameJa, item.handle, ...item.tagsRaw]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase(),
  };
}
