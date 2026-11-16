'use client';

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
 * localStorage 는 React 바깥의 저장소라 useSyncExternalStore 로 읽는다.
 * 서버 렌더 때는 값을 알 수 없으므로 빈 상태(EMPTY)를 주고,
 * 하이드레이션이 끝난 뒤 실제 값으로 바뀐다. 이러면 표시가 어긋나지 않는다.
 *
 * 시크릿 창이나 사이트 데이터 차단 환경에서는 읽기만 해도 예외가 나므로
 * 모든 접근을 try/catch 로 감싸고, 실패하면 "기록 없음"으로 조용히 넘어간다.
 */

import { useSyncExternalStore } from 'react';

const OWNED_KEY = 'tobeol-ledger:owned:v1';
const WISH_KEY = 'tobeol-ledger:wish:v1';

export type MarkKind = 'owned' | 'wish';

export interface MarkState {
  owned: Set<string>;
  wish: Set<string>;
}

/** 서버 렌더와 하이드레이션 동안 쓰는 빈 상태. 참조가 고정되어야 해서 상수로 둔다 */
const EMPTY: MarkState = { owned: new Set(), wish: new Set() };

function storageKey(kind: MarkKind): string {
  return kind === 'owned' ? OWNED_KEY : WISH_KEY;
}

function readKey(kind: MarkKind): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) {
      return new Set();
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function writeKey(kind: MarkKind, value: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey(kind), JSON.stringify([...value]));
  } catch {
    // 저장이 막힌 환경에서도 화면은 그대로 쓸 수 있게 둔다
  }
}

/**
 * 마지막으로 읽은 상태.
 * useSyncExternalStore 는 같은 값이면 같은 참조가 돌아오기를 요구하므로
 * 매번 새로 읽지 않고 들고 있다가 바뀔 때만 교체한다.
 */
let cache: MarkState | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** 다른 탭에서 바뀐 기록도 따라가도록 한다 */
function onStorage(event: StorageEvent): void {
  if (event.key === OWNED_KEY || event.key === WISH_KEY) {
    cache = null;
    emit();
  }
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('storage', onStorage);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function getSnapshot(): MarkState {
  if (cache === null) {
    cache = { owned: readKey('owned'), wish: readKey('wish') };
  }
  return cache;
}

function getServerSnapshot(): MarkState {
  return EMPTY;
}

/** 기록을 켜고 끈다. 화면 어디서 불러도 같은 저장소를 본다 */
export function toggleMark(kind: MarkKind, handle: string): void {
  const current = getSnapshot();
  const next = new Set(current[kind]);

  if (next.has(handle)) {
    next.delete(handle);
  } else {
    next.add(handle);
  }

  writeKey(kind, next);
  cache = kind === 'owned' ? { owned: next, wish: current.wish } : { owned: current.owned, wish: next };
  emit();
}

export interface Marks extends MarkState {
  /** 기록을 아직 읽기 전인지. 서버 렌더·하이드레이션 중에는 false */
  ready: boolean;
  toggle: (kind: MarkKind, handle: string) => void;
}

export function useMarks(): Marks {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    owned: state.owned,
    wish: state.wish,
    // 서버 스냅샷을 쓰는 동안에는 참조가 EMPTY 그대로다
    ready: state !== EMPTY,
    toggle: toggleMark,
  };
}
