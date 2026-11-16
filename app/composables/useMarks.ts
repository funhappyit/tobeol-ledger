/**
 * 토벌 기록 (브라우저 저장)
 *
 * 로그인 없이도 바로 체크할 수 있어야 하므로 기록은 일단 localStorage 에 둔다.
 * 나중에 Supabase 로그인이 붙으면 이 기록을 서버로 합치게 되는데,
 * 그때 덮어쓰기 사고가 나지 않도록 저장 형식에 버전(v1)을 붙여 둔다.
 *
 * 저장 키를 두 개로 나눈 이유:
 *   owned — 이미 손에 넣은 것. 나중에 지출·플미 계산의 대상이 된다
 *   wish  — 노리고 있는 것. 계산 대상이 아니라 알림·목표 용도다
 *
 * 상태를 useState 로 두는 이유는 SSR 때문이다. 모듈 최상단에 ref 를 두면
 * 서버에서 요청끼리 같은 값을 공유하게 된다. useState 는 요청마다 분리된다.
 *
 * localStorage 는 시크릿 창이나 사이트 데이터 차단 환경에서 읽기만 해도 예외가 나므로
 * 모든 접근을 try/catch 로 감싸고, 실패하면 "기록 없음"으로 조용히 넘어간다.
 */

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
  const ownedList = useState<string[]>('marks:owned', () => []);
  const wishList = useState<string[]>('marks:wish', () => []);
  // 서버 렌더 중에는 기록을 알 수 없다. 읽기 전에는 표시를 켜지 않아야 화면이 깜빡이지 않는다
  const ready = useState<boolean>('marks:ready', () => false);

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

  function toggle(kind: MarkKind, handle: string): void {
    const list = listFor(kind);
    const next = list.value.includes(handle)
      ? list.value.filter((value) => value !== handle)
      : [...list.value, handle];

    list.value = next;
    writeKey(kind, next);
  }

  return { owned, wish, ready, toggle };
}
