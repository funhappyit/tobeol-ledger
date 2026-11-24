/**
 * 모구모구 상품명 번역 테스트
 *
 * 표본은 모두 스토어 원문이다. 표기가 흔들리는 자리(전각 영숫자·반각 가나·오타)를
 * 일부러 골라 두었다. 사전이 늘어도 이 꼴들이 깨지지 않아야 한다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hasJapanese, normalizeMogumoguName, translateMogumoguName } from './mogumogu-name';

describe('normalizeMogumoguName', () => {
  it('전각 영숫자를 반각으로 모은다', () => {
    assert.equal(normalizeMogumoguName('Ｔシャツ ＸＬ'), 'Tシャツ XL');
    assert.equal(normalizeMogumoguName('（全１０種ＢＯＸ）'), '（全10種BOX）');
  });

  it('반각 가나를 전각으로 모은다', () => {
    assert.equal(normalizeMogumoguName('ﾐﾆ提灯マグネット'), 'ミニ提灯マグネット');
  });

  /** `耐熱ガラスマグカップﾟ` 처럼 반탁점만 떠 있는 원문이 있다 */
  it('떠 있는 반각 탁점·반탁점은 지운다', () => {
    assert.equal(normalizeMogumoguName('マグカップﾟ'), 'マグカップ');
  });

  it('전각 공백을 보통 공백으로 모은다', () => {
    assert.equal(normalizeMogumoguName('川越店限定　今治産'), '川越店限定 今治産');
  });
});

describe('translateMogumoguName', () => {
  it('점포 한정 + 모티프 + 품목 + 캐릭터 꼴', () => {
    assert.equal(
      translateMogumoguName('伏見店限定 鈴付きアクリルキーホルダー （稲荷なちいかわ）'),
      '후시미점 한정 방울 달린 아크릴 키홀더 (이나리 치이카와)',
    );
  });

  it('카와고에 지역 명물', () => {
    assert.equal(
      translateMogumoguName('川越限定 おいもなぬいぐるみ (ちいかわ)'),
      '카와고에 한정 고구마 인형 (치이카와)',
    );
  });

  it('오타루 지역 명물', () => {
    assert.equal(
      translateMogumoguName('小樽限定 ステンドグラスなガラス箸置き くりまんじゅう'),
      '오타루 한정 스테인드글라스 유리 젓가락 받침 쿠리만쥬',
    );
  });

  /**
   * `~になっちゃった`(~가 되어버린)는 앞말 받침에 따라 조사가 갈린다.
   * 조사를 피해 수식어 `변신` 으로 옮긴다
   */
  it('`~가 되어버린` 은 조사 없이 `변신` 으로 옮긴다', () => {
    assert.equal(
      translateMogumoguName('川越限定 犬張り子になっちゃったマスコット くりまんじゅう'),
      '카와고에 한정 이누하리코 변신 마스코트 쿠리만쥬',
    );
    assert.equal(
      translateMogumoguName('トレーディング風鈴になっちゃったアクリルチャーム(全9種)  BOX'),
      '트레이딩 풍경 변신 아크릴참 (전9종) BOX',
    );
  });

  it('수량 표기는 숫자에 붙인다', () => {
    assert.equal(
      translateMogumoguName('伏見店限定 ミニ巾着２個セット（FUSHIMIINARI）'),
      '후시미점 한정 미니 복주머니 2개 세트 (FUSHIMIINARI)',
    );
    assert.equal(translateMogumoguName('3枚セットタオル'), '3장 세트 타월');
  });

  it('전각 영숫자가 섞인 이름', () => {
    assert.equal(
      translateMogumoguName('川越限定 Ｔシャツ さつまいも イエロー ＸＬ'),
      '카와고에 한정 티셔츠 고구마 옐로 XL',
    );
  });

  it('반각 가나가 섞인 이름', () => {
    assert.equal(
      translateMogumoguName('川越限定 ﾐﾆ提灯マグネット 鯛だらけな ちいかわ・ハチワレ・うさぎ'),
      '카와고에 한정 미니 조등 마그네트 도미 가득 치이카와·하치와레·우사기',
    );
  });

  it('`と` 는 앞말에 붙여 `와` 로 옮긴다', () => {
    assert.equal(
      translateMogumoguName('小風呂敷 和装なくりまんじゅうとシーサー'),
      '작은 보자기 일본옷 쿠리만쥬와 시사',
    );
  });

  it('느낌표·물음표는 앞말에 붙인다', () => {
    assert.equal(translateMogumoguName('クリアファイル(ちいかわ わ！！)'), '클리어파일 (치이카와 와!!)');
    assert.equal(translateMogumoguName('湯呑み （なんでェ？）'), '찻잔 (난데에?)');
  });

  /** 스토어 원문의 오타를 고쳐 쓰지 않고 오타째로 받는다 */
  it('원문 오타도 번역한다', () => {
    assert.equal(
      translateMogumoguName('小樽限定 巾着ショルダーバッグ レトロブ ラウンONE'),
      '오타루 한정 복주머니 숄더백 레트로 브라운 ONE',
    );
    assert.equal(
      translateMogumoguName('川越限定 手触りのいいクリアフィル(だるま）'),
      '카와고에 한정 촉감 좋은 클리어파일 (다루마)',
    );
  });

  it('부적 문구를 옮긴다', () => {
    assert.equal(
      translateMogumoguName('ミニ絵馬根付け 金運上昇 くりまんじゅう'),
      '미니 에마 네츠케 금운상승 쿠리만쥬',
    );
  });

  it('빈 이름은 빈 문자열', () => {
    assert.equal(translateMogumoguName(''), '');
  });
});

describe('hasJapanese', () => {
  it('일본어가 남아 있으면 참', () => {
    assert.equal(hasJapanese('伏見稲荷'), true);
    assert.equal(hasJapanese('ちりめん'), true);
  });

  it('한국어·숫자·영문만 있으면 거짓', () => {
    assert.equal(hasJapanese('후시미점 한정 아크릴 키홀더'), false);
    assert.equal(hasJapanese('티셔츠 FUSHIMIINARI 먹색 M'), false);
  });
});
