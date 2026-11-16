<script setup lang="ts">
/**
 * 도감 본문
 *
 * 캐릭터는 경로로 이미 걸러진 상태로 들어온다. 여기서는 검색·종류·보기 조건만 다룬다.
 * 걸러내기를 서버 왕복 없이 하는 이유는, 도감은 조건을 자주 바꿔 가며 훑어보는 화면이기 때문이다.
 */

import { categoryName } from '@lib/items/labels';
import type { DexItem } from '@lib/items/view';
import type { MarkKind } from '~/composables/useMarks';

const props = defineProps<{ items: DexItem[] }>();

/** 보기 조건. 토벌 기록으로 거르기 */
type OwnedFilter = 'all' | 'owned' | 'not-owned' | 'wish';

const OWNED_FILTERS: { value: OwnedFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'owned', label: '토벌 완료' },
  { value: 'not-owned', label: '미토벌' },
  { value: 'wish', label: '토벌 리스트' },
];

const query = ref('');
const category = ref<string | null>(null);
const ownedFilter = ref<OwnedFilter>('all');

const { owned, wish, ready, toggle } = useMarks();

/** 화면에 띄울 종류 필터 후보. 실제로 쓰인 종류만 건수 많은 순으로 */
const categories = computed(() => {
  const counts = new Map<string, number>();

  for (const item of props.items) {
    for (const code of item.categoryCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
});

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();

  return props.items.filter((item) => {
    if (needle.length > 0 && !item.search.includes(needle)) {
      return false;
    }

    if (category.value !== null && !item.categoryCodes.includes(category.value)) {
      return false;
    }

    // 기록을 읽기 전에는 거르지 않는다. 안 그러면 첫 렌더에서 전부 사라진다
    if (!ready.value || ownedFilter.value === 'all') {
      return true;
    }
    if (ownedFilter.value === 'owned') {
      return owned.value.has(item.handle);
    }
    if (ownedFilter.value === 'not-owned') {
      return !owned.value.has(item.handle);
    }
    return wish.value.has(item.handle);
  });
});

const ownedCount = computed(() =>
  ready.value ? props.items.filter((item) => owned.value.has(item.handle)).length : 0,
);

const percent = computed(() =>
  props.items.length > 0 ? Math.round((ownedCount.value / props.items.length) * 100) : 0,
);

function onToggle(kind: MarkKind, handle: string): void {
  toggle(kind, handle);
}

function pickCategory(code: string): void {
  category.value = category.value === code ? null : code;
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label class="relative w-full sm:max-w-sm">
        <span class="sr-only">굿즈 검색</span>
        <input
          v-model="query"
          type="search"
          placeholder="이름, 일본어, 태그로 찾기"
          class="w-full rounded-full border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        >
      </label>

      <p class="text-sm text-muted">
        토벌 <strong class="font-semibold text-foreground">{{ ownedCount }}</strong> /
        {{ items.length.toLocaleString() }}건
        <span v-if="items.length > 0" class="ml-1.5 text-accent">({{ percent }}%)</span>
      </p>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="filter in OWNED_FILTERS"
        :key="filter.value"
        type="button"
        :aria-pressed="ownedFilter === filter.value"
        class="rounded-full border px-3 py-1.5 text-sm transition-colors"
        :class="
          ownedFilter === filter.value
            ? 'border-accent bg-accent text-white'
            : 'border-border-soft bg-surface text-muted hover:text-foreground'
        "
        @click="ownedFilter = filter.value"
      >
        {{ filter.label }}
      </button>
    </div>

    <div v-if="categories.length > 0" class="flex flex-wrap gap-1.5 border-t border-border-soft pt-4">
      <button
        type="button"
        :aria-pressed="category === null"
        class="rounded-full border px-3 py-1.5 text-sm transition-colors"
        :class="
          category === null
            ? 'border-accent bg-accent text-white'
            : 'border-border-soft bg-surface text-muted hover:text-foreground'
        "
        @click="category = null"
      >
        모든 종류
      </button>
      <button
        v-for="entry in categories"
        :key="entry.code"
        type="button"
        :aria-pressed="category === entry.code"
        class="rounded-full border px-3 py-1.5 text-sm transition-colors"
        :class="
          category === entry.code
            ? 'border-accent bg-accent text-white'
            : 'border-border-soft bg-surface text-muted hover:text-foreground'
        "
        @click="pickCategory(entry.code)"
      >
        {{ categoryName(entry.code) }} {{ entry.count }}
      </button>
    </div>

    <p
      v-if="visible.length === 0"
      class="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center text-muted"
    >
      조건에 맞는 굿즈가 없습니다.
    </p>

    <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      <DexItemCard
        v-for="item in visible"
        :key="item.handle"
        :item="item"
        :owned="owned.has(item.handle)"
        :wish="wish.has(item.handle)"
        :ready="ready"
        @toggle="onToggle"
      />
    </ul>
  </div>
</template>
