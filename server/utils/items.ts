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
    }
  } else if (mode === 'db') {
    throw new Error('Supabase 설정이 없습니다. NUXT_PUBLIC_SUPABASE_URL / KEY 를 확인해 주세요.');
  }

  return getItemsFromFiles();
}

/** 굿즈 전량. 5분 동안은 같은 값을 돌려준다 */
export async function getItems(): Promise<ItemListResult> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.value;
  }

  const value = await load();
  cache = { at: Date.now(), value };

  return value;
}
