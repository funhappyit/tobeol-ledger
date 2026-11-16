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

export interface DexItem {
  handle: string;
  nameKo: string | null;
  nameJa: string | null;
  listPriceJpy: number | null;
  imageUrl: string | null;
  sourceUrl: string;
  releasedOn: string | null;
  characterCodes: string[];
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
    sourceUrl: item.sourceUrl,
    releasedOn: item.parsed.releasedOn,
    characterCodes: item.parsed.characterCodes,
    categoryCodes: item.parsed.categoryCodes,
    purchaseLimit: item.parsed.purchaseLimit,
    search: [item.nameKo, item.nameJa, item.handle, ...item.tagsRaw]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase(),
  };
}
