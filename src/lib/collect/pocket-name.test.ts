/**
 * 포켓 스토어 상품명 번역 테스트
 *
 * 입력값은 전부 실제 상품명이다.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hasJapanese, translatePocketName } from './pocket-name';

describe('translatePocketName', () => {
  it('시리즈·테마·품목·캐릭터를 모두 옮긴다', () => {
    assert.equal(
      translatePocketName('ちいかわぽけっと ピクニックなマスコット（ちいかわ）'),
      '치이카와 포켓 피크닉 마스코트 (치이카와)',
    );
  });

  it('테마와 품목을 잇는 な 는 띄어쓰기가 된다', () => {
    assert.equal(
      translatePocketName('ちいかわぽけっと 江戸なクリアファイル'),
      '치이카와 포켓 에도 클리어파일',
    );
  });

  /** 긴 말이 짧은 말보다 먼저 걸려야 한다 */
  it('ハンドタオル 를 タオル 로 쪼개지 않는다', () => {
    const result = translatePocketName('ちいかわぽけっと 恐竜なハンドタオル');

    assert.equal(result, '치이카와 포켓 공룡 핸드타월');
  });

  it('大きめトートバッグ 를 トートバッグ 로 쪼개지 않는다', () => {
    assert.equal(
      translatePocketName('ちいかわぽけっと フルーツな大きめトートバッグ'),
      '치이카와 포켓 과일 큰 토트백',
    );
  });

  it('L/S Tシャツ 를 Tシャツ 로 쪼개지 않는다', () => {
    assert.equal(
      translatePocketName('ちいかわぽけっと フルーツなL/S Tシャツ ホワイト（フリーサイズ）'),
      '치이카와 포켓 과일 긴팔 티셔츠 화이트 (프리사이즈)',
    );
  });

  it('괄호 안에 캐릭터가 여럿이면 가운뎃점으로 잇는다', () => {
    assert.equal(
      translatePocketName('ちいかわぽけっと 恐竜なハンドタオル（ちいかわ・ハチワレ・うさぎ）'),
      '치이카와 포켓 공룡 핸드타월 (치이카와·하치와레·우사기)',
    );
  });

  /** 조사 "와"는 앞말에 붙여 쓴다 */
  it('と 로 이어진 등장인물은 "와" 로 잇는다', () => {
    assert.equal(
      translatePocketName('ちいかわクリスマスマーケット レイヤーアクリルスタンド（ハチワレと三ツ星）'),
      '치이카와 크리스마스 마켓 레이어 아크릴 스탠드 (하치와레와 세 별)',
    );
    assert.equal(
      translatePocketName('ちいかわクリスマスマーケット マスコット（くりまんじゅうとトナカイ）'),
      '치이카와 크리스마스 마켓 마스코트 (쿠리만쥬와 순록)',
    );
  });

  it('수량·형태 표기를 옮긴다', () => {
    assert.equal(
      translatePocketName('ちいかわぽけっと 江戸なトレーディング缶バッジ（全7種）単品'),
      '치이카와 포켓 에도 트레이딩 캔뱃지 (전7종) 단품',
    );
    assert.equal(
      translatePocketName('ちいかわクリスマスマーケット ミニハンドクリームセット（3個入り）'),
      '치이카와 크리스마스 마켓 미니 핸드크림 세트 (3개입)',
    );
  });

  it('긴 품목 이름도 통째로 옮긴다', () => {
    assert.equal(
      translatePocketName('ちいかわぽけっと ピクニックなスマホに貼れるサイズのステッカー（ピクニックなみんな）'),
      '치이카와 포켓 피크닉 휴대폰 크기 스티커 (피크닉 모두)',
    );
  });

  it('클리어 크리스마스 시리즈도 옮긴다', () => {
    assert.equal(
      translatePocketName('ちいかわクリスマスマーケット クリスマスブランケット（ポーチ付き）'),
      '치이카와 크리스마스 마켓 크리스마스 담요 (파우치 포함)',
    );
  });

  /** 사전에 없는 말은 일본어로 남는다. 틀린 한국어보다 낫다 */
  it('모르는 말은 그대로 둔다', () => {
    const result = translatePocketName('ちいかわぽけっと 謎のナニカなマスコット');

    assert.ok(result.includes('치이카와 포켓'));
    assert.ok(result.includes('마스코트'));
    assert.ok(result.includes('謎'));
  });

  it('빈 문자열은 빈 문자열이다', () => {
    assert.equal(translatePocketName(''), '');
  });
});

describe('hasJapanese', () => {
  it('히라가나·가타카나·한자를 찾는다', () => {
    assert.equal(hasJapanese('ちいかわ'), true);
    assert.equal(hasJapanese('マスコット'), true);
    assert.equal(hasJapanese('江戸'), true);
  });

  it('한국어와 영문만 있으면 없다고 본다', () => {
    assert.equal(hasJapanese('치이카와 포켓 피크닉 마스코트'), false);
    assert.equal(hasJapanese('BOX 단품 (전7종)'), false);
  });
});
