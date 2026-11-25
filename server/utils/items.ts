/**
 * 굿즈 목록을 어디서 읽을지 고른다
 *
 * DB(Supabase)가 기본이고 수집본 파일이 받침이다.
 *   - 배포 환경에는 수집본 파일을 둘 곳이 없다(Vercel 파일시스템은 읽기 전용)
 *   - 로컬에서는 DB 를 안 채웠어도 파일만으로 화면이 떠야 한다
 *
 * 받아온 목록은 잠시 메모리에 둔다. 전량을 받으려면 PostgREST 를 11번 불러야 해서
 * 요청마다 하면 화면이 눈에 띄게 느려진다. 수집은 하루 한 번이라 5분 묵은 값이어도
 * 사실상 최신이다. 배포 뒤에는 그 앞단에 ISR 캐시가 하나 더 붙는다.
 *
 * ── 빈 목록을 다루는 규칙
 *
 * DB 읽기가 한 번 끊기면 받침인 파일로 넘어가는데, 배포 환경에는 그 파일이 없어서
 * 빈 목록이 된다. 그 빈 목록이 200 으로 나가면 ISR 이 "아직 수집된 굿즈가 없습니다"
 * 화면을 정상으로 알고 굳혀 버린다. 실제로 그렇게 되어 도감이 한참 비어 있었다.
 *
 * 그래서 세 가지를 지킨다.
 *   1. 빈 목록은 캐시하지 않는다. 한 번 끊긴 것 때문에 5분을 버리지 않는다
 *   2. 한 번 받아 둔 목록(lastGood)이 있으면 그걸 내준다. 묵은 목록이 빈 화면보다 낫다
 *   3. DB 가 끊겼는데 받침도 비면 에러를 올린다. 없는 사실을 200 으로 말하지 않는다
 *
 * 환경변수로 읽을 곳을 못박을 수 있다.
 *   ITEMS_SOURCE=files  수집본 파일만 본다(수집 결과를 바로 확인할 때)
 *   ITEMS_SOURCE=db     DB 만 본다. 실패해도 파일로 넘어가지 않는다(배포 점검용)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getItemsFromDb } from '@lib/items/db';
import { getItemsFromFiles, type ItemListResult } from '@lib/items/source';

/** 메모리에 두는 시간 */
const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; value: ItemListResult } | null = null;

/**
 * 마지막으로 굿즈가 들어 있던 목록.
 * 캐시가 만료된 뒤 DB 가 끊겨도 화면이 비지 않도록 따로 들고 있는다.
 */
let lastGood: ItemListResult | null = null;

let client: SupabaseClient | null = null;

/** 공개 키로 만든 읽기 전용 클라이언트. 굿즈 표는 누구나 읽을 수 있다(RLS public_read) */
function getClient(): SupabaseClient | null {
  if (client) {
    return client;
  }

  const supabase = useRuntimeConfig().public.supabase as { url?: string; key?: string } | undefined;
  if (!supabase?.url || !supabase?.key) {
    return null;
  }

  client = createClient(supabase.url, supabase.key, { auth: { persistSession: false } });
  return client;
}

async function load(): Promise<ItemListResult> {
  const mode = process.env.ITEMS_SOURCE;

  if (mode === 'files') {
    return getItemsFromFiles();
  }

  const supabase = getClient();

  /** DB 가 응답하지 않은 이유. 받침까지 비었을 때 이 값을 그대로 올린다 */
  let dbError: unknown = null;

  if (supabase) {
    try {
      const result = await getItemsFromDb(supabase);

      // 아직 적재하지 않았다면 파일로 넘어간다. 빈 도감을 보여 줄 이유가 없다
      if (result.items.length > 0 || mode === 'db') {
        return result;
      }
    } catch (error) {
      if (mode === 'db') {
        throw error;
      }
      // DB 가 응답하지 않아도 파일이 있으면 화면은 뜬다
      console.warn('DB 에서 굿즈를 읽지 못해 수집본 파일로 대체합니다:', error);
      dbError = error;
    }
  } else if (mode === 'db') {
    throw new Error('Supabase 설정이 없습니다. NUXT_PUBLIC_SUPABASE_URL / KEY 를 확인해 주세요.');
  }

  const files = await getItemsFromFiles();

  /**
   * DB 가 끊겼는데 받침도 비어 있으면 "굿즈가 없다"고 말할 수 없다.
   * 빈 목록을 200 으로 내보내면 ISR 이 그 화면을 굳혀 버린다. 에러면 굳히지 않는다.
   *
   * DB 를 쓰지 않는 로컬에서는 dbError 가 없으므로 지금까지처럼 수집 안내가 뜬다.
   */
  if (files.items.length === 0 && dbError !== null) {
    throw dbError;
  }

  return files;
}

/** 굿즈 전량. 5분 동안은 같은 값을 돌려준다 */
export async function getItems(): Promise<ItemListResult> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.value;
  }

  let value: ItemListResult;

  try {
    value = await load();
  } catch (error) {
    if (lastGood === null) {
      throw error;
    }

    // 한 번 받아 둔 것이 있으면 그걸 내준다. 캐시에는 넣지 않으므로 다음 요청에 다시 시도한다
    console.warn('굿즈를 새로 읽지 못해 직전 목록을 그대로 씁니다:', error);
    return lastGood;
  }

  if (value.items.length === 0 && lastGood !== null) {
    console.warn('굿즈가 한 건도 오지 않아 직전 목록을 그대로 씁니다');
    return lastGood;
  }

  // 빈 목록은 캐시하지 않는다. 한 번 끊긴 것 때문에 5분 내내 빈 도감을 보여 주게 된다
  if (value.items.length > 0) {
    cache = { at: Date.now(), value };
    lastGood = value;
  }

  return value;
}
