/**
 * 도감 데이터
 *
 * 수집 파일은 서버에서만 읽고, 화면에는 필요한 항목만 추려 내려보낸다.
 * 캐릭터 탭 건수는 거르기 전 전체를 기준으로 세야 해서 여기서 함께 계산한다.
 *
 * `counts=1` 은 건수만 받는 모드다.
 * 홈 화면은 캐릭터별 숫자만 필요한데, 그걸 위해 1만 건을 통째로 내려보내면
 * 응답이 수 MB가 된다(실제로 홈이 8MB 였다).
 *
 * `limit` 과 `offset` 은 도감을 두 번에 나눠 받기 위한 것이다.
 * 화면이 처음 그리는 카드는 120장인데 1만 1천 건을 함께 기다리게 하면
 * 첫 화면이 827KB 가 된다(실측). 먼저 120건만 보내고 나머지는 화면이 그려진 뒤에 받는다.
 */

import { ALL_CHARACTERS, countByCharacter, filterByCharacter, isKnownCharacter } from '@lib/items/dex';
import { packDexItems, toDexItem, type PackedDexItem } from '@lib/items/view';

export interface DexResponse {
  /** `counts=1` 로 부르면 빈 배열이다 */
  items: PackedDexItem[];
  /** 굿즈의 `img` 가 가리키는 이미지 주소 앞부분 */
  imageBases: string[];
  /** 캐릭터 코드별 건수. 탭 옆 숫자 */
  counts: Record<string, number>;
  /** 수집본에 섞인 통화. JPY 가 아니면 화면에서 경고한다 */
  currencies: string[];
  /** 거르기 전 전체 건수 */
  total: number;
  /**
   * 지금 보고 있는 캐릭터의 스토어별 건수.
   *
   * 화면이 받아 둔 목록을 세지 않는 이유는 도감을 두 번에 나눠 받기 때문이다.
   * 첫 120건은 발매일 최신순이라 전부 공식몰 굿즈다(다른 스토어는 201번째에나 나온다).
   * 그걸 세면 첫 화면에서 스토어 필터가 숨었다가 나머지가 도착할 때 끼어들어 칩이 밀린다.
   */
  sourceCounts: Record<string, number>;
  /**
   * 스토어별로 재고를 마지막으로 확인한 시각.
   *
   * 수집 주기가 스토어마다 달라서(공식몰 하루, 포켓 한 주, 모구모구 한 달)
   * "지금 살 수 있다"를 보장할 수 없다. 언제 본 값인지 화면에 함께 적으려고 보낸다.
   * 굿즈마다 싣지 않는 이유는 1만 건이면 그것만으로 응답이 수백 KB 늘기 때문이다.
   */
  stockCheckedAt: Record<string, string>;
}

/** 스토어별 건수를 센다 */
function countByStore(items: { source: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    counts[item.source] = (counts[item.source] ?? 0) + 1;
  }

  return counts;
}

/** 스토어별로 가장 최근 수집 시각을 고른다 */
function latestByStore(items: { source: string; collectedAt: string }[]): Record<string, string> {
  const latest: Record<string, string> = {};

  for (const item of items) {
    if (item.collectedAt.length === 0) {
      continue;
    }

    const current = latest[item.source];
    if (current === undefined || item.collectedAt > current) {
      latest[item.source] = item.collectedAt;
    }
  }

  return latest;
}

/** 0 이상의 정수만 받는다. 그 밖의 값은 없는 것으로 친다 */
function toCount(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export default defineEventHandler(async (event): Promise<DexResponse> => {
  const query = getQuery(event);
  const character = typeof query.character === 'string' ? query.character : ALL_CHARACTERS;
  const countsOnly = query.counts === '1' || query.counts === 'true';
  const limit = toCount(query.limit);
  const offset = toCount(query.offset) ?? 0;

  if (!isKnownCharacter(character)) {
    throw createError({ statusCode: 404, statusMessage: '없는 캐릭터입니다' });
  }

  /**
   * 응답을 엣지(CDN)에 맡긴다.
   *
   * ── 왜 필요한가
   *
   * 이 핸들러는 굿즈 전량을 DB 에서 읽는다. PostgREST 가 한 번에 1000행까지만 주므로
   * 1만 1천 건이면 12번 왕복이고, 실측 8.0초다(첫 왕복 2.7초, 나머지 300~900ms).
   * 람다 안에 메모리 캐시를 두고 있지만 그것은 인스턴스 하나에만 산다.
   * 인스턴스가 새로 뜨면 빈 상태로 시작하므로 콜드 요청이 16초였다.
   *
   * 엣지가 응답을 들고 있으면 람다를 아예 깨우지 않는다. 캐시 키는 URL 전체라
   * 쿼리가 다르면 다른 칸에 들어간다.
   *
   * ── 왜 routeRules 가 아니라 헤더인가
   *
   * 예전에 `'/api/dex': { swr: 300 }` 을 걸었더니 쿼리가 무시됐다.
   * routeRules 의 swr·isr 은 Vercel 의 prerender 설정으로 내려가고, 그쪽 allowQuery 는
   * "빈 배열이면 쿼리 값을 캐시에 고려하지 않는다"고 되어 있다. 그 경로를 탄 것이다.
   *
   * 응답 헤더는 prerender 를 타지 않고 평범한 CDN 캐시를 쓴다. 캐시 키 문서에
   * "쿼리스트링은 정적 파일에서만 무시된다"고 적혀 있다.
   *
   * ── 숫자를 이렇게 고른 이유
   *
   * s-maxage=300 은 페이지 ISR(5분)과 맞춘 값이다. 재고 수집이 30분마다이므로
   * 5분이면 충분히 촘촘하다.
   *
   * stale-while-revalidate=600 은 만료 뒤를 위한 것이다. 이것이 없으면 5분마다
   * 누군가 한 명이 16초를 기다린다. 두면 그 사람도 묵은 값을 즉시 받고 갱신은
   * 배경에서 돈다.
   *
   * s-maxage 는 Vercel 이 먹고 브라우저에는 전달하지 않는다. 그래서 브라우저는
   * 늘 재검증하고, 캐시는 엣지에만 생긴다.
   *
   * ── 공개 캐시로 두어도 되는 근거
   *
   * 이 응답에는 개인 자료가 없다. 굿즈 목록·건수·통화·재고 확인 시각뿐이다.
   * 토벌 표시는 브라우저가 따로 읽고, 머리글의 로그인 표시도 브라우저에서만 그린다.
   *
   * 404 는 이 줄보다 먼저 던지므로 캐시되지 않는다. 의도한 것이다.
   */
  setResponseHeader(event, 'cache-control', 'public, s-maxage=300, stale-while-revalidate=600');

  const { items, currencies } = await getItems();

  if (countsOnly) {
    return {
      items: [],
      imageBases: [],
      counts: Object.fromEntries(countByCharacter(items)),
      currencies,
      total: items.length,
      sourceCounts: {},
      stockCheckedAt: {},
    };
  }

  const picked = filterByCharacter(items, character);
  const sliced = limit === null ? picked.slice(offset) : picked.slice(offset, offset + limit);
  const packed = packDexItems(sliced.map(toDexItem));

  return {
    items: packed.items,
    imageBases: packed.imageBases,
    counts: Object.fromEntries(countByCharacter(items)),
    currencies,
    total: items.length,
    // 잘라내기 전에 센다. 화면이 쓰는 값은 이 캐릭터의 전체 건수다
    sourceCounts: countByStore(picked),
    stockCheckedAt: latestByStore(items),
  };
});
