/**
 * 일본어 상품명 어휘 치환 번역기
 *
 * 공식몰은 `/ko/` 경로로 번역된 상품명을 내려주지만, 포켓 스토어와 모구모구 본포는
 * 일본어뿐이다. 그대로 두면 도감에 일본어 이름만 줄줄이 보인다.
 *
 * 기계 번역을 붙이지 않고 어휘 치환으로 푸는 이유는 상품명이 규칙적이기 때문이다.
 * 조각을 사전에 넣고 긴 것부터 바꿔치기하면 외부 호출 없이, 매번 같은 결과로 번역된다.
 * 사전에 없는 말은 일본어로 남는다. 틀린 한국어보다 낫고, 무엇을 더할지도 바로 보인다.
 *
 * 스토어마다 쓰는 말이 달라서 사전은 스토어별로 따로 둔다(pocket-name.ts, mogumogu-name.ts).
 * 치환 규칙과 조사 처리는 일본어 문법이라 스토어와 무관하므로 이 파일에 모았다.
 */

/**
 * 조각 사이를 잇는 말.
 * `な`·`の` 는 수식을 잇는 조사라 한국어에서는 띄어쓰기로 충분하다.
 * `と`(나열)는 앞말에 붙여 써야 해서 따로 다룬다.
 */
const PARTICLES: Record<string, string> = {
  な: ' ',
  の: ' ',
  '・': '·',
};

/** 일본어 글자가 남아 있는지. 번역이 어디까지 됐는지 세는 데 쓴다 */
export function hasJapanese(value: string): boolean {
  return /[぀-ヿ一-鿿]/.test(value);
}

/**
 * 사전 하나로 번역 함수를 만든다.
 *
 * 포함 관계가 있는 말은 사전을 쓰는 쪽에서 신경 쓰지 않아도 된다.
 * 긴 것부터 바꾸기 때문에 `ハンドタオル` 가 `タオル` 보다,
 * `大きめトートバッグ` 가 `トートバッグ` 보다 먼저 걸린다.
 */
export function createNameTranslator(dictionary: Record<string, string>): (name: string) => string {
  const keysByLength = Object.keys(dictionary).sort((a, b) => b.length - a.length);

  return function translate(name: string): string {
    let out = name;

    for (const japanese of keysByLength) {
      if (!out.includes(japanese)) {
        continue;
      }
      // 앞뒤에 공백을 두어 조각끼리 붙지 않게 한다. 남는 공백은 마지막에 정리한다
      out = out.split(japanese).join(` ${dictionary[japanese]} `);
    }

    for (const [particle, replacement] of Object.entries(PARTICLES)) {
      out = out.split(particle).join(replacement);
    }

    // `と` 는 "하치와레와 세 별"처럼 앞말에 붙는다. 사전 치환이 남긴 앞 공백을 함께 거둔다
    out = out.replace(/\s*と\s*/g, '와 ');

    return (
      out
        .replace(/（/g, ' (')
        .replace(/）/g, ') ')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        // 가운뎃점은 이름을 바로 잇는 기호라 양옆을 붙인다
        .replace(/\s*·\s*/g, '·')
        // 느낌표·물음표는 앞말에 붙는다. 사전 치환이 남긴 앞 공백을 거둔다
        .replace(/\s+([!?！？])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
    );
  };
}
