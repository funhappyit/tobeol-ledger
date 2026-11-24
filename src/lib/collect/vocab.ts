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

// ---------------------------------------------------------------------------
// 모구모구 본포 어휘
//
// 공식몰과 같은 Shopify 지만 붙이는 말이 다르다.
//   - 분류 태그가 묶음 표기다: `がま口・ポーチ・巾着`, `タオル・てぬぐい`
//   - 지역이 태그로 들어온다: `伏見稲荷`, `川越`, `小樽`
//   - product_type 이 알차다(59종). 공식몰은 로케일마다 값이 달라 못 믿었지만
//     이 스토어는 일본어 하나뿐이라 품목어가 그대로 들어 있어 종류 판정에 쓸 수 있다
//
// 지역·모티프 태그(`川越`, `おいも`, `和装`)는 어느 표에도 넣지 않는다.
// 분류가 아니라서 rest 로 흘려보내는데, tagsRaw 에 원문이 남아 검색은 그대로 된다.
// ---------------------------------------------------------------------------

/** 모구모구에만 나오는 캐릭터 표기 */
export const MOGUMOGU_CHARACTER_TAGS: Record<string, CharacterDef> = {
  // 라멘집 차림의 요로이상. 같은 캐릭터라 코드를 공유한다
  ラーメンの鎧さん: { code: 'yoroisan', nameKo: '요로이상' },
};

/**
 * 모구모구 분류 태그 -> 종류.
 * 묶음 표기는 대표 코드 하나로 모은다. 더 정확한 종류는 product_type 이 채운다
 */
export const MOGUMOGU_CATEGORY_TAGS: Record<string, CategoryDef> = {
  ファッション小物: { code: 'fashion_accessory', nameKo: '패션소품' },
  'ぬいぐるみ・マスコット': { code: 'plush', nameKo: '인형' },
  'バッグ・ポーチ': { code: 'bag', nameKo: '가방' },
  'がま口・ポーチ・巾着': { code: 'pouch', nameKo: '파우치' },
  'シール・ステッカー': { code: 'sticker', nameKo: '스티커' },
  'タオル・てぬぐい': { code: 'towel', nameKo: '타월' },
  '箸・箸置き': { code: 'chopsticks', nameKo: '젓가락' },
  // 가운뎃점이 반각인 변종이 1건 있다. 표기를 고치지 않고 둘 다 받는다
  '箸･箸置き': { code: 'chopsticks', nameKo: '젓가락' },
  '湯のみ・マグカップ': { code: 'kitchen', nameKo: '주방' },
  Tシャツ: { code: 'tshirt_hoodie', nameKo: '티셔츠·후드' },
  トートバッグ: { code: 'bag', nameKo: '가방' },
  不織布バッグ: { code: 'bag', nameKo: '가방' },
  クリアファイル: { code: 'clear_file', nameKo: '클리어파일' },
  チャーム: { code: 'charm', nameKo: '참·장식' },
  マグネット: { code: 'magnet', nameKo: '마그네트' },
  バッジ: { code: 'badge', nameKo: '뱃지' },
  ソックス: { code: 'socks', nameKo: '양말' },
  マスキングテープ: { code: 'masking_tape', nameKo: '마스킹테이프' },
  陶磁器: { code: 'kitchen', nameKo: '주방' },
  豆皿: { code: 'kitchen', nameKo: '주방' },
  ボールペン: { code: 'stationery', nameKo: '문구' },
  爪切り: { code: 'goods', nameKo: '잡화' },
  その他: { code: 'goods', nameKo: '잡화' },
  // 부적·네츠케·노렌·보자기·부채·고슈인장은 하나하나가 5~19건이라
  // 따로 세우면 필터가 산만해진다. 일본소품으로 묶는다
  お守り: { code: 'japanese_goods', nameKo: '일본소품' },
  ミニ根付: { code: 'japanese_goods', nameKo: '일본소품' },
  のれん: { code: 'japanese_goods', nameKo: '일본소품' },
  小風呂敷: { code: 'japanese_goods', nameKo: '일본소품' },
  扇子: { code: 'japanese_goods', nameKo: '일본소품' },
  御朱印帳: { code: 'japanese_goods', nameKo: '일본소품' },
};

/**
 * 모구모구 product_type -> 종류.
 *
 * 태그보다 품목이 또렷해서 이쪽을 먼저 본다.
 * 비어 있는 상품이 61건 있어 태그와 같이 써야 빈틈이 없다.
 */
export const MOGUMOGU_PRODUCT_TYPES: Record<string, CategoryDef> = {
  // 의류
  Tシャツ: { code: 'tshirt_hoodie', nameKo: '티셔츠·후드' },
  パーカー: { code: 'tshirt_hoodie', nameKo: '티셔츠·후드' },
  足袋ソックス: { code: 'socks', nameKo: '양말' },

  // 키홀더·참·스탠드
  キーホルダー: { code: 'keyholder', nameKo: '키홀더' },
  ネックストラップ: { code: 'keyholder', nameKo: '키홀더' },
  アクリルチャーム: { code: 'charm', nameKo: '참·장식' },
  アクリルスタンド: { code: 'acrylic_stand', nameKo: '아크릴 스탠드' },

  // 인형·마스코트
  マスコット: { code: 'mascot', nameKo: '마스코트' },
  ぬいぐるみ: { code: 'plush', nameKo: '인형' },

  // 스티커·문구
  ステッカー: { code: 'sticker', nameKo: '스티커' },
  シール: { code: 'sticker', nameKo: '스티커' },
  マスキングテープ: { code: 'masking_tape', nameKo: '마스킹테이프' },
  クリアファイル: { code: 'clear_file', nameKo: '클리어파일' },
  メモ帳: { code: 'memo', nameKo: '메모·떡메' },
  ミニ色紙: { code: 'memo', nameKo: '메모·떡메' },
  ボールペン: { code: 'stationery', nameKo: '문구' },

  // 뱃지
  ピンバッジ: { code: 'badge', nameKo: '뱃지' },
  アクリルバッジ: { code: 'badge', nameKo: '뱃지' },
  缶バッジ: { code: 'can_badge', nameKo: '캔뱃지' },

  // 마그네트
  マグネット: { code: 'magnet', nameKo: '마그네트' },
  スクエアマグネット: { code: 'magnet', nameKo: '마그네트' },
  提灯マグネット: { code: 'magnet', nameKo: '마그네트' },
  'ミニフレーム マグネット': { code: 'magnet', nameKo: '마그네트' },
  アクリルクリップマグネット: { code: 'magnet', nameKo: '마그네트' },

  // 가방·파우치
  トートバッグ: { code: 'bag', nameKo: '가방' },
  エコバッグ: { code: 'bag', nameKo: '가방' },
  ショルダーバッグ: { code: 'bag', nameKo: '가방' },
  不織布バッグ: { code: 'bag', nameKo: '가방' },
  巾着: { code: 'pouch', nameKo: '파우치' },
  ポーチ: { code: 'pouch', nameKo: '파우치' },
  小銭入れ: { code: 'pouch', nameKo: '파우치' },
  印鑑入れ: { code: 'pouch', nameKo: '파우치' },
  ティッシュケース: { code: 'case', nameKo: '케이스' },

  // 타월
  タオル: { code: 'towel', nameKo: '타월' },
  フェイスタオル: { code: 'towel', nameKo: '타월' },
  てぬぐい: { code: 'towel', nameKo: '타월' },
  ハンドタオル: { code: 'hand_towel', nameKo: '손수건' },
  ガーゼハンドタオル: { code: 'hand_towel', nameKo: '손수건' },

  // 식기. 재질(도자기·유리)보다 쓰임으로 묶는다
  マグカップ: { code: 'kitchen', nameKo: '주방' },
  タンブラー: { code: 'kitchen', nameKo: '주방' },
  ゆのみ: { code: 'kitchen', nameKo: '주방' },
  茶碗: { code: 'kitchen', nameKo: '주방' },
  豆皿: { code: 'kitchen', nameKo: '주방' },
  箸: { code: 'chopsticks', nameKo: '젓가락' },
  箸置き: { code: 'chopsticks', nameKo: '젓가락' },
  カトラリー: { code: 'kitchen', nameKo: '주방' },
  カトラリーセット: { code: 'kitchen', nameKo: '주방' },

  // 일본소품
  ミニお守り: { code: 'japanese_goods', nameKo: '일본소품' },
  御朱印帳: { code: 'japanese_goods', nameKo: '일본소품' },
  根付: { code: 'japanese_goods', nameKo: '일본소품' },
  のれん: { code: 'japanese_goods', nameKo: '일본소품' },
  小風呂敷: { code: 'japanese_goods', nameKo: '일본소품' },
  扇子: { code: 'japanese_goods', nameKo: '일본소품' },

  // 패션소품
  ヘアゴム: { code: 'fashion_accessory', nameKo: '패션소품' },
  パッチンピン: { code: 'fashion_accessory', nameKo: '패션소품' },

  // 그 밖
  フィギュア: { code: 'goods', nameKo: '잡화' },
  キャラ撮りスティック: { code: 'goods', nameKo: '잡화' },
  マルチクロス: { code: 'goods', nameKo: '잡화' },
  爪切り: { code: 'goods', nameKo: '잡화' },
};

/** 모구모구 판매 형태 태그 -> 플래그 */
export const MOGUMOGU_FLAG_TAGS: Record<string, string> = {
  // 랜덤 봉입. 무엇이 나올지 모르고 사는 상품이다
  トレーディング商品: 'trading',
  // 특정 점포에서만 파는 상품
  限定商品: 'store_limited',
};
