'use client';

/**
 * 도감 본문
 *
 * 캐릭터는 경로로 이미 걸러진 상태로 들어온다. 여기서는 검색·종류·보기 조건만 다룬다.
 * 걸러내기를 서버 왕복 없이 하는 이유는, 도감은 조건을 자주 바꿔 가며 훑어보는 화면이기 때문이다.
 */

import { useMemo, useState } from 'react';

import type { CollectedItem } from '@/lib/collect/types';
import { useMarks } from '@/lib/collection/marks';
import { categoryName } from '@/lib/items/labels';
import { categoryOptions, searchHaystack } from '@/lib/items/dex';
import { ItemCard } from './ItemCard';

/** 보기 조건. 토벌 기록으로 거르기 */
type OwnedFilter = 'all' | 'owned' | 'not-owned' | 'wish';

const OWNED_FILTERS: { value: OwnedFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'owned', label: '토벌 완료' },
  { value: 'not-owned', label: '미토벌' },
  { value: 'wish', label: '토벌 리스트' },
];

interface Props {
  items: CollectedItem[];
}

export function DexBoard({ items }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const { ready, owned, wish, toggle } = useMarks();

  const categories = useMemo(() => categoryOptions(items), [items]);

  // 검색어는 입력할 때마다 바뀌므로 대조용 문자열을 미리 만들어 둔다
  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      map.set(item.handle, searchHaystack(item));
    }
    return map;
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return items.filter((item) => {
      if (needle.length > 0 && !(haystacks.get(item.handle) ?? '').includes(needle)) {
        return false;
      }

      if (category !== null && !item.parsed.categoryCodes.includes(category)) {
        return false;
      }

      // 기록을 읽기 전에는 거르지 않는다. 안 그러면 첫 렌더에서 전부 사라진다
      if (!ready || ownedFilter === 'all') {
        return true;
      }
      if (ownedFilter === 'owned') {
        return owned.has(item.handle);
      }
      if (ownedFilter === 'not-owned') {
        return !owned.has(item.handle);
      }
      return wish.has(item.handle);
    });
  }, [items, haystacks, query, category, ownedFilter, ready, owned, wish]);

  const ownedCount = ready ? items.filter((item) => owned.has(item.handle)).length : 0;
  const percent = items.length > 0 ? Math.round((ownedCount / items.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-sm">
          <span className="sr-only">굿즈 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, 일본어, 태그로 찾기"
            className="w-full rounded-full border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <p className="text-sm text-muted">
          토벌 <strong className="font-semibold text-foreground">{ownedCount}</strong> /{' '}
          {items.length.toLocaleString()}건
          {items.length > 0 && <span className="ml-1.5 text-accent">({percent}%)</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {OWNED_FILTERS.map((filter) => (
          <FilterChip
            key={filter.value}
            active={ownedFilter === filter.value}
            onClick={() => setOwnedFilter(filter.value)}
          >
            {filter.label}
          </FilterChip>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border-soft pt-4">
          <FilterChip active={category === null} onClick={() => setCategory(null)}>
            모든 종류
          </FilterChip>
          {categories.map(({ code, count }) => (
            <FilterChip
              key={code}
              active={category === code}
              onClick={() => setCategory(category === code ? null : code)}
            >
              {categoryName(code)} {count}
            </FilterChip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center text-muted">
          조건에 맞는 굿즈가 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((item) => (
            <ItemCard
              key={item.handle}
              item={item}
              owned={owned.has(item.handle)}
              wish={wish.has(item.handle)}
              ready={ready}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-border-soft bg-surface text-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
