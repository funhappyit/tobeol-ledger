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
/**
 * 상품명에서 종류를 찾을 때 쓰는 키워드.
 *
 * 포켓 굿즈 스토어는 태그를 제공하지 않는다. 대신 상품명이 규칙적이다.
 *   `ちいかわぽけっと 江戸なクリアファイル`
 *   `ちいかわぽけっと ピクニックなマスコット（ちいかわ）`
 * 품목 이름이 끝에 붙는 형태라 상품명만으로 종류를 판정할 수 있다.
 *
 * 위의 CATEGORY_TAGS 와 따로 두는 이유는 성격이 다르기 때문이다.
 * 저쪽은 공식몰이 붙인 분류어(`文房具`, `雑貨`)이고, 이쪽은 상품명에 실제로 나오는
 * 품목어(`クリアファイル`, `アクリルスタンド`)다. 분류어는 상품명에 나오지 않는다.
 *
 * 긴 키워드가 짧은 키워드를 포함하는 경우가 있어(`ハンドタオル` ⊃ `タオル`)
 * 매칭하는 쪽에서 긴 것부터 시도해야 한다.
 */
export const CATEGORY_NAME_KEYWORDS: Record<string, CategoryDef> = {
  クリアファイル: { code: 'clear_file', nameKo: '클리어파일' },
  アクリルスタンド: { code: 'acrylic_stand', nameKo: '아크릴 스탠드' },
  アクリルキーホルダー: { code: 'keyholder', nameKo: '키홀더' },
  ラバーキーホルダー: { code: 'keyholder', nameKo: '키홀더' },
  キーホルダー: { code: 'keyholder', nameKo: '키홀더' },
  カンバッジ: { code: 'can_badge', nameKo: '캔뱃지' },
  缶バッジ: { code: 'can_badge', nameKo: '캔뱃지' },
  ぬいぐるみ: { code: 'plush', nameKo: '인형' },
  マスコット: { code: 'mascot', nameKo: '마스코트' },
  ハンドタオル: { code: 'hand_towel', nameKo: '손수건' },
  タオル: { code: 'towel', nameKo: '타월' },
  トートバッグ: { code: 'bag', nameKo: '가방' },
  ポーチ: { code: 'pouch', nameKo: '파우치' },
  ステッカー: { code: 'sticker', nameKo: '스티커' },
  シール: { code: 'sticker', nameKo: '스티커' },
  Tシャツ: { code: 'tshirt_hoodie', nameKo: '티셔츠·후드' },
  トレーナー: { code: 'tshirt_hoodie', nameKo: '티셔츠·후드' },
  靴下: { code: 'socks', nameKo: '양말' },
  ソックス: { code: 'socks', nameKo: '양말' },
  マフラー: { code: 'apparel', nameKo: '의류' },
  手ぬぐい: { code: 'towel', nameKo: '타월' },
  巾着: { code: 'pouch', nameKo: '파우치' },
  // 주방·식기류는 한 종류로 묶는다. 컵·접시·받침을 따로 세면 필터가 산만해진다
  マグカップ: { code: 'kitchen', nameKo: '주방' },
  ティーカップ: { code: 'kitchen', nameKo: '주방' },
  プレート: { code: 'kitchen', nameKo: '주방' },
  コースター: { code: 'kitchen', nameKo: '주방' },
  // 목욕·손 관리 용품
  バスソルト: { code: 'amenity', nameKo: '어메니티' },
  ハンドクリーム: { code: 'amenity', nameKo: '어메니티' },
  チャーム: { code: 'charm', nameKo: '참·장식' },
  ケース: { code: 'case', nameKo: '케이스' },
  ボールペン: { code: 'stationery', nameKo: '문구' },
  ノート: { code: 'stationery', nameKo: '문구' },
  カード: { code: 'stationery', nameKo: '문구' },
  メモ: { code: 'memo', nameKo: '메모·떡메' },
  // 장식·소품
  オーナメント: { code: 'goods', nameKo: '잡화' },
  スノードーム: { code: 'goods', nameKo: '잡화' },
  ブランケット: { code: 'goods', nameKo: '잡화' },
};

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
