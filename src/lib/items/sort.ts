/**
 * 굿즈 목록의 공통 모양과 정렬
 *
 * 굿즈는 파일(수집본)에서도 오고 DB(Supabase)에서도 온다.
 * 어느 쪽에서 왔든 화면이 보는 모양과 늘어놓는 순서는 같아야 해서 여기 모아 둔다.
 * 이 파일은 node:fs 도 Supabase 도 모르므로 서버·클라이언트 어디서든 읽을 수 있다.
 */

import type { CollectedItem } from '../collect/types';

export interface ItemListResult {
  items: CollectedItem[];
  /** 수집본에 섞인 통화 목록. JPY 외의 값이 있으면 화면에서 경고를 띄운다 */
  currencies: string[];
}

/**
 * 정렬에 쓸 날짜. 아래 순서로 "그 굿즈가 언제 것인지"에 가장 가까운 값을 고른다.
 *
 *   1. 발매일        — 가장 정확하다
 *   2. 예약 개시일   — 예약 상품은 발매일 태그가 없고 PRE 태그만 붙는다
 *   3. 최종 수정 시각 — 둘 다 없을 때의 마지막 수단
 *
 * 2번을 건너뛰면 안 된다. 예약 상품은 상품 정보가 자주 손질돼서 수정 시각이
 * 늘 최근이고, 그것으로 정렬하면 1년 전에 예약을 연 굿즈가 신상 자리에 올라온다.
 *
 * 3번은 발매일이 없는 굿즈를 통째로 뒤로 보내지 않기 위한 것이다.
 * 포켓 스토어는 발매일을 공개하지 않아 그쪽 굿즈가 전부 뒤로 가는데,
 * 전체가 1만 건이라 목록 끝까지 가지 않으면 한 건도 볼 수 없게 된다.
 * 수정 시각은 발매일이 아니지만 "언제쯤 올라온 굿즈인지"는 말해 주므로
 * 최신순으로 늘어놓기에는 충분하고, 화면에 날짜로 띄우지는 않는다.
 */
export function sortKey(item: CollectedItem): string {
  return item.parsed.releasedOn ?? item.parsed.preorderOn ?? (item.updatedAt ?? '').slice(0, 10);
}

/**
 * 최신순으로 늘어놓는다. 원본 배열을 바꾼다.
 *
 * 날짜가 같을 때는 handle 로 한 번 더 가른다.
 * 같은 날 나온 굿즈가 백 건을 넘는 일이 흔한데, 2차 기준이 없으면 그들 사이 순서가
 * 들어온 순서에 좌우된다. 수집본 파일은 수집 순서, DB 는 조회 순서라 서로 달라서
 * 읽는 곳을 바꾸면 목록이 뒤섞인 것처럼 보인다.
 */
export function sortByDate(items: CollectedItem[]): CollectedItem[] {
  return items.sort((a, b) => {
    const byDate = sortKey(b).localeCompare(sortKey(a));
    return byDate !== 0 ? byDate : a.handle.localeCompare(b.handle);
  });
}

/**
 * 중복 handle 을 걸러내며 목록을 합친다.
 *
 * 두 스토어의 handle 형식은 겹치지 않지만(공식몰은 JAN 코드, 포켓은 32자 16진수),
 * 같은 수집본을 두 번 읽는 설정 실수까지 막아 둔다.
 */
export function mergeItems(groups: CollectedItem[][]): ItemListResult {
  const items: CollectedItem[] = [];
  const currencies = new Set<string>();
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.handle)) {
        continue;
      }

      seen.add(item.handle);
      items.push(item);

      if (item.listPriceCurrency) {
        currencies.add(item.listPriceCurrency);
      }
    }
  }

  return { items: sortByDate(items), currencies: [...currencies] };
}
