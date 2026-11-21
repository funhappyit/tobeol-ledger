/**
 * 토벌 기록
 *
 * 저장 위치가 로그인 여부에 따라 달라진다.
 *   비로그인 — 브라우저 localStorage. 가입을 강요하지 않으려는 것이다
 *   로그인   — Supabase 의 user_marks 표. 기기를 바꿔도 이어진다
 *
 * 로그인하면 로컬에 있던 기록을 서버로 합친다(합집합). 로컬 기록은 지우지 않고 그대로 둔다.
 * 로그아웃했을 때 기록이 통째로 사라진 것처럼 보이면 안 되기 때문이다.
 *
 * 기록 종류를 둘로 나눈 이유:
 *   owned — 이미 손에 넣은 것. 나중에 지출·플미 계산의 대상이 된다
 *   wish  — 노리고 있는 것. 계산 대상이 아니다
 *
 * 상태를 useState 로 두는 이유는 SSR 때문이다. 모듈 최상단에 ref 를 두면
 * 서버에서 요청끼리 같은 값을 공유하게 된다. useState 는 요청마다 분리된다.
 *
 * localStorage 는 시크릿 창이나 사이트 데이터 차단 환경에서 읽기만 해도 예외가 나므로
 * 모든 접근을 try/catch 로 감싸고, 실패하면 "기록 없음"으로 조용히 넘어간다.
 */

import type { Database } from '~/types/database.types';

const OWNED_KEY = 'tobeol-ledger:owned:v1';
const WISH_KEY = 'tobeol-ledger:wish:v1';

export type MarkKind = 'owned' | 'wish';

function storageKey(kind: MarkKind): string {
  return kind === 'owned' ? OWNED_KEY : WISH_KEY;
}

function readKey(kind: MarkKind): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeKey(kind: MarkKind, value: string[]): void {
  try {
    window.localStorage.setItem(storageKey(kind), JSON.stringify(value));
  } catch {
    // 저장이 막힌 환경에서도 화면은 그대로 쓸 수 있게 둔다
  }
}

export function useMarks() {
  const supabase = useSupabaseClient<Database>();
  const user = useSupabaseUser();

  const ownedList = useState<string[]>('marks:owned', () => []);
  const wishList = useState<string[]>('marks:wish', () => []);
  // 서버 렌더 중에는 기록을 알 수 없다. 읽기 전에는 표시를 켜지 않아야 화면이 깜빡이지 않는다
  const ready = useState<boolean>('marks:ready', () => false);
  const syncing = useState<boolean>('marks:syncing', () => false);
  /** 어느 계정까지 서버와 맞췄는지. 여러 컴포넌트가 같이 불러도 한 번만 맞추기 위한 표식 */
  const syncedFor = useState<string | null>('marks:synced-for', () => null);

  const owned = computed(() => new Set(ownedList.value));
  const wish = computed(() => new Set(wishList.value));

  function listFor(kind: MarkKind) {
    return kind === 'owned' ? ownedList : wishList;
  }

  /** 다른 탭에서 바뀐 기록도 따라간다 */
  function onStorage(event: StorageEvent): void {
    if (event.key === OWNED_KEY) {
      ownedList.value = readKey('owned');
    } else if (event.key === WISH_KEY) {
      wishList.value = readKey('wish');
    }
  }

  /**
   * 로그인 직후 한 번. 서버 기록을 받아 로컬 기록과 합치고, 로컬에만 있던 것을 올린다.
   * 합집합으로 두는 이유는, 어느 쪽을 지워야 할지 판단할 근거가 없기 때문이다.
   * (기기 A 에서 지운 것인지, 기기 B 에서 새로 넣은 것인지 구분할 수 없다)
   */
  async function syncWithServer(userId: string): Promise<void> {
    if (syncedFor.value === userId || syncing.value) {
      return;
    }

    syncing.value = true;

    try {
      const { data, error } = await supabase
        .from('user_marks')
        .select('handle, kind')
        .eq('user_id', userId);

      if (error) {
        // 서버가 응답하지 않아도 로컬 기록으로 화면은 계속 쓸 수 있어야 한다
        console.warn('토벌 기록을 불러오지 못했습니다:', error.message);
        return;
      }

      const serverOwned = new Set<string>();
      const serverWish = new Set<string>();
      for (const row of data ?? []) {
        (row.kind === 'owned' ? serverOwned : serverWish).add(row.handle);
      }

      const localOwned = readKey('owned');
      const localWish = readKey('wish');

      // 로컬에만 있던 것을 서버로 올린다
      const toUpload = [
        ...localOwned.filter((handle) => !serverOwned.has(handle)).map((handle) => ({ handle, kind: 'owned' })),
        ...localWish.filter((handle) => !serverWish.has(handle)).map((handle) => ({ handle, kind: 'wish' })),
      ].map((row) => ({ ...row, user_id: userId }));

      if (toUpload.length > 0) {
        const { error: uploadError } = await supabase.from('user_marks').upsert(toUpload);
        if (uploadError) {
          console.warn('로컬 기록을 올리지 못했습니다:', uploadError.message);
        }
      }

      const mergedOwned = [...new Set([...serverOwned, ...localOwned])];
      const mergedWish = [...new Set([...serverWish, ...localWish])];

      ownedList.value = mergedOwned;
      wishList.value = mergedWish;
      // 로그아웃해도 기록이 사라진 것처럼 보이지 않도록 로컬에도 남긴다
      writeKey('owned', mergedOwned);
      writeKey('wish', mergedWish);

      syncedFor.value = userId;
    } finally {
      syncing.value = false;
    }
  }

  onMounted(() => {
    // 여러 컴포넌트가 같이 부르므로 처음 한 번만 읽는다
    if (!ready.value) {
      ownedList.value = readKey('owned');
      wishList.value = readKey('wish');
      ready.value = true;
    }
    window.addEventListener('storage', onStorage);
  });

  onUnmounted(() => {
    window.removeEventListener('storage', onStorage);
  });

  // 로그인하면 서버와 합치고, 로그아웃하면 로컬 기록만 남긴다
  watch(
    user,
    (value) => {
      if (!import.meta.client) {
        return;
      }
      if (value) {
        void syncWithServer(value.id);
      } else {
        syncedFor.value = null;
      }
    },
    { immediate: true },
  );

  function toggle(kind: MarkKind, handle: string): void {
    const list = listFor(kind);
    const adding = !list.value.includes(handle);
    const next = adding ? [...list.value, handle] : list.value.filter((value) => value !== handle);

    list.value = next;
    writeKey(kind, next);

    const userId = user.value?.id;
    if (!userId) {
      return;
    }

    // 서버 반영은 화면을 막지 않는다. 실패하면 로컬 기록이 남아 다음 로그인 때 다시 올라간다
    void (async () => {
      const { error } = adding
        ? await supabase.from('user_marks').upsert({ user_id: userId, handle, kind })
        : await supabase
            .from('user_marks')
            .delete()
            .eq('user_id', userId)
            .eq('handle', handle)
            .eq('kind', kind);

      if (error) {
        console.warn('토벌 기록을 저장하지 못했습니다:', error.message);
      }
    })();
  }

  return { owned, wish, ready, syncing, toggle };
}
