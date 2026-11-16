/**
 * 공식몰 태그 어휘 매핑
 *
 * 공식몰 태그는 일본어 원문이고 분류 체계가 따로 공개되어 있지 않다.
 * 그래서 아래 표는 "지금까지 관측된 것"이지 완전한 목록이 아니다.
 * 새 태그가 나오면 수집 결과의 tagsRaw 를 다시 해석하면 되므로,
 * 분류에 실패한 태그가 있어도 수집을 멈추지 않고 rest 로 흘려보낸다.
 *
 * 캐릭터 태그는 공식몰 태그 필터(/collections/all/{tag})로 실제 사용 여부를 확인했다.
 * `栗まんじゅう`(한자 표기)와 `カニ` 는 실제로는 쓰이지 않아 제외했다.
 */

export interface CharacterDef {
  code: string;
  nameKo: string;
}

/** 일본어 캐릭터 태그 -> 캐릭터 정의 */
export const CHARACTER_TAGS: Record<string, CharacterDef> = {
  ちいかわ: { code: 'chiikawa', nameKo: '치이카와' },
  ハチワレ: { code: 'hachiware', nameKo: '하치와레' },
  うさぎ: { code: 'usagi', nameKo: '우사기' },
  モモンガ: { code: 'momonga', nameKo: '모몽가' },
  ラッコ: { code: 'rakko', nameKo: '랏코' },
  くりまんじゅう: { code: 'kurimanju', nameKo: '쿠리만쥬' },
  シーサー: { code: 'shisa', nameKo: '시사' },
  古本屋: { code: 'furuhonya', nameKo: '후루혼야' },
  あのこ: { code: 'anoko', nameKo: '아노코' },
  鎧さん: { code: 'yoroisan', nameKo: '요로이상' },
  でかつよ: { code: 'dekatsuyo', nameKo: '데카츠요' },
};

export interface CategoryDef {
  code: string;
  nameKo: string;
}

/** 일본어 종류 태그 -> 종류 정의. 서로 다른 표기가 같은 code 로 모일 수 있다 */
export const CATEGORY_TAGS: Record<string, CategoryDef> = {
  ぬいぐるみ: { code: 'plush', nameKo: '인형' },
  マスコット: { code: 'mascot', nameKo: '마스코트' },
  文房具: { code: 'stationery', nameKo: '문구' },
  'メモ・ふせん': { code: 'memo', nameKo: '메모·떡메' },
  ステッカー: { code: 'sticker', nameKo: '스티커' },
  キーホルダー: { code: 'keyholder', nameKo: '키홀더' },
  バッグ: { code: 'bag', nameKo: '가방' },
  タオル: { code: 'towel', nameKo: '타월' },
  ハンドタオル: { code: 'hand_towel', nameKo: '손수건' },
  アパレル: { code: 'apparel', nameKo: '의류' },
  'Tシャツ・パーカー': { code: 'tshirt_hoodie', nameKo: '티셔츠·후드' },
  靴下: { code: 'socks', nameKo: '양말' },
  キッチン: { code: 'kitchen', nameKo: '주방' },
  雑貨: { code: 'goods', nameKo: '잡화' },
  'PC・スマホグッズ': { code: 'pc_phone', nameKo: 'PC·스마트폰' },
  'スマホ・PC': { code: 'pc_phone', nameKo: 'PC·스마트폰' },
  アメニティ: { code: 'amenity', nameKo: '어메니티' },
};

/** 판매 조건·상태를 나타내는 태그 -> 플래그 코드 */
export const FLAG_TAGS: Record<string, string> = {
  海外NG: 'overseas_ng',
  数量制限: 'quantity_limited',
  新商品: 'new_arrival',
  販売開始前: 'not_yet_on_sale',
  店頭発売: 'store_only',
  同梱不可: 'no_bundle',
  同梱不可H: 'no_bundle',
  予約: 'preorder',
  グループ: 'group',
};
