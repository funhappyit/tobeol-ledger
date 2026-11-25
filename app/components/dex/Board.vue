<script setup lang="ts">
/**
 * 도감 본문
 *
 * 캐릭터는 경로로 이미 걸러진 상태로 들어온다. 여기서는 검색·종류·보기 조건만 다룬다.
 * 걸러내기를 서버 왕복 없이 하는 이유는, 도감은 조건을 자주 바꿔 가며 훑어보는 화면이기 때문이다.
 *
 * 카드는 한 번에 다 그리지 않는다. 캐릭터 하나가 천 건을 넘기 때문에
 * 전부 그리면 조건을 바꿀 때마다 화면이 멎는다. 끊어서 그리고 "더 보기"로 이어 붙인다.
 */

import { categoryName, formatCheckedAt, storeName } from '@lib/items/labels';
import { buildSearchText, type DexItem } from '@lib/items/view';
import type { MarkKind } from '~/composables/useMarks';

const props = defineProps<{
  items: DexItem[];
  /**
   * 나머지 굿즈를 아직 받는 중인지.
   *
   * 도감은 첫 120건만 먼저 받고 나머지는 화면이 그려진 뒤에 받는다(Screen.vue).
   * 그 사이에 검색하면 받아 둔 만큼만 걸리므로, 모자란 상태라는 것을 밝혀 둔다.
   */
  indexing?: boolean;
  /** 스토어별로 재고를 마지막으로 확인한 시각. "지금 토벌 가능" 안내에 쓴다 */
  stockCheckedAt?: Record<string, string>;
  /** 이 캐릭터의 스토어별 건수. 스토어 필터를 띄울지 정하는 데 쓴다 */
  sourceCounts?: Record<string, number>;
}>();

/** 한 번에 그릴 카드 수 */
const PAGE_SIZE = 120;

/** 보기 조건. 토벌 기록으로 거르기 */
type OwnedFilter = 'all' | 'owned' | 'not-owned' | 'wish';

const OWNED_FILTERS: { value: OwnedFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'owned', label: '토벌 완료' },
  { value: 'not-owned', label: '미토벌' },
  { value: 'wish', label: '토벌 리스트' },
];

/**
 * 어느 스토어 굿즈를 볼지.
 *
 * 이 필터가 없으면 포켓 스토어 굿즈를 사실상 볼 수 없다.
 * 그쪽은 발매일을 공개하지 않아 발매일순 정렬에서 전부 맨 뒤로 가는데,
 * 전체가 1만 건이라 "더 보기"를 수십 번 눌러야 닿기 때문이다.
 */
type SourceFilter = 'all' | 'official' | 'pocket' | 'mogumogu';

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: '모든 스토어' },
  { value: 'official', label: '공식몰' },
  { value: 'pocket', label: '포켓 스토어' },
  { value: 'mogumogu', label: '모구모구' },
];

const query = ref('');
const category = ref<string | null>(null);
const ownedFilter = ref<OwnedFilter>('all');
const sourceFilter = ref<SourceFilter>('all');

/**
 * 아직 살 수 있는 굿즈만 보기.
 *
 * 품절 배지를 달지 않고 이쪽으로 가는 이유는 비율 때문이다.
 * 공식몰 표본 750건 중 93%가 품절이라, 품절을 칠하면 거의 모든 카드가 칠해져
 * 아무것도 가리키지 못한다. 나머지 7%를 드러내는 편이 쓸모 있다.
 */
const inStockOnly = ref(false);

const shown = ref(PAGE_SIZE);

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

/**
 * 공식몰 말고 다른 스토어 굿즈가 섞여 있을 때만 스토어 필터를 띄운다.
 *
 * 받아 둔 목록을 훑지 않는다. 도감은 첫 120건만 먼저 받는데 그게 전부 공식몰이라
 * (다른 스토어는 201번째에나 나온다) 필터가 숨었다가 나중에 끼어들어 칩이 밀린다.
 * 서버가 센 값으로 판단하면 첫 화면부터 제자리에 있다.
 */
const hasOtherStore = computed(() =>
  Object.entries(props.sourceCounts ?? {}).some(
    ([source, count]) => source !== 'official' && count > 0,
  ),
);

/**
 * 검색 대조용 글자를 미리 만들어 둔다.
 * 목록이 바뀔 때만 다시 만든다. 글자를 칠 때마다 1만 건을 다시 훑지 않기 위한 것이다.
 */
const searchIndex = computed(() => {
  const index = new Map<string, string>();

  for (const item of props.items) {
    index.set(item.handle, buildSearchText(item));
  }

  return index;
});

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const index = searchIndex.value;

  return props.items.filter((item) => {
    if (needle.length > 0 && !(index.get(item.handle) ?? '').includes(needle)) {
      return false;
    }

    if (category.value !== null && !item.categoryCodes.includes(category.value)) {
      return false;
    }

    // 공식몰 굿즈는 응답에 source 가 실리지 않는다. 값이 없으면 공식몰이라는 뜻이다
    if (sourceFilter.value !== 'all' && (item.source ?? 'official') !== sourceFilter.value) {
      return false;
    }

    // 살 수 있었던 굿즈에만 inStock 이 실린다. 품절과 모름은 둘 다 키가 없다
    if (inStockOnly.value && item.inStock !== true) {
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

const rendered = computed(() => visible.value.slice(0, shown.value));
const remaining = computed(() => visible.value.length - rendered.value.length);

/**
 * 결과가 0건일 때 할 말.
 *
 * 나머지를 받는 중에는 "없습니다"라고 하면 안 된다. 첫 120건은 발매일 최신순이라
 * 전부 공식몰 굿즈여서, 그 사이에 스토어 필터를 누르면 0건이 된다.
 * 없는 것이 아니라 아직 안 온 것인데 "없습니다"라고 하면 고장으로 읽힌다.
 */
const emptyMessage = computed(() => {
  if (!props.indexing) {
    return '조건에 맞는 굿즈가 없습니다.';
  }

  const store = SOURCE_FILTERS.find((filter) => filter.value === sourceFilter.value);
  const waiting = sourceFilter.value === 'all' ? undefined : props.sourceCounts?.[sourceFilter.value];
  const noneYet = !props.items.some((item) => (item.source ?? 'official') === sourceFilter.value);

  // 그 스토어 굿즈가 아직 한 건도 안 왔다면 몇 건이 올지 서버가 알려 준 값으로 말해 준다
  if (store && waiting !== undefined && waiting > 0 && noneYet) {
    return `${store.label} ${waiting.toLocaleString()}개를 불러오는 중이에요. 잠시만요`;
  }

  return '나머지 굿즈를 불러오는 중이에요. 잠시만요';
});

// 조건이 바뀌면 처음부터 다시 그린다
watch([query, category, ownedFilter, sourceFilter, inStockOnly], () => {
  shown.value = PAGE_SIZE;
});

/**
 * 재고를 언제 본 값인지.
 *
 * 공식몰은 하루, 포켓은 한 주, 모구모구는 한 달 주기로 수집한다.
 * "지금 살 수 있다"를 보장할 수 없으므로 언제 본 값인지 함께 밝힌다.
 * 포켓은 재고를 확인할 길이 없어 여기에도, 필터 결과에도 나오지 않는다.
 */
const stockNotice = computed(() => {
  const seen = props.stockCheckedAt ?? {};

  // 재고를 확인할 수 있는 스토어만. 포켓은 값 자체가 없다
  const parts = (['official', 'mogumogu'] as const).flatMap((source) => {
    const when = formatCheckedAt(seen[source]);
    return when === null ? [] : [`${storeName(source)} ${when}`];
  });

  if (parts.length === 0) {
    return '재고는 수집한 시점의 값이라 지금과 다를 수 있어요';
  }

  return `${parts.join(' · ')} 기준이에요. 포켓 스토어는 재고를 알 수 없어 빠져요`;
});

function onToggle(kind: MarkKind, handle: string): void {
  toggle(kind, handle);
}

/** 구매 기록 입력 중인 굿즈. null 이면 닫혀 있다 */
const recording = ref<DexItem | null>(null);
const userId = useUserId();
const savedNotice = ref(false);

function openRecord(item: DexItem): void {
  if (!userId.value) {
    // 기록은 계정에 묶이는 자료라 로그인이 있어야 한다
    navigateTo('/login');
    return;
  }
  recording.value = item;
}

function onSaved(): void {
  // 토벌 완료로 표시한 굿즈에만 기록 버튼이 보이므로 여기서 따로 체크할 것이 없다
  recording.value = null;
  savedNotice.value = true;
  setTimeout(() => {
    savedNotice.value = false;
  }, 3000);
}

function pickCategory(code: string | null): void {
  category.value = category.value === code ? null : code;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 종류. 열일곱 가지라 한 줄에 안 들어가서 좌우로 넘긴다 -->
    <ChipScroller v-if="categories.length > 0">
      <button
        type="button"
        :aria-pressed="category === null"
        class="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
        :class="
          category === null
            ? 'bg-foreground text-surface'
            : 'bg-background text-muted hover:text-foreground'
        "
        @click="pickCategory(null)"
      >
        전체 <span class="ml-0.5 opacity-70">{{ items.length.toLocaleString() }}</span>
      </button>
      <button
        v-for="entry in categories"
        :key="entry.code"
        type="button"
        :aria-pressed="category === entry.code"
        class="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
        :class="
          category === entry.code
            ? 'bg-foreground text-surface'
            : 'bg-background text-muted hover:text-foreground'
        "
        @click="pickCategory(entry.code)"
      >
        {{ categoryName(entry.code) }}
        <span class="ml-0.5 opacity-70">{{ entry.count.toLocaleString() }}</span>
      </button>
    </ChipScroller>

    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label class="relative w-full sm:max-w-xs">
        <span class="sr-only">굿즈 검색</span>
        <input
          v-model="query"
          type="search"
          placeholder="이름, 일본어, 태그로 찾기"
          class="w-full rounded-full border border-border-soft bg-background px-4 py-2 text-sm outline-none focus:border-accent"
        >
        <!-- 결과가 0건이면 아래 빈 자리에 같은 말이 크게 나오므로 여기서는 비켜 준다 -->
        <span
          v-if="indexing && visible.length > 0"
          class="mt-1 block px-4 text-xs text-muted"
          aria-live="polite"
        >
          나머지 굿즈를 불러오는 중이에요. 지금은 {{ items.length.toLocaleString() }}개 안에서 찾아요
        </span>
      </label>

      <ChipScroller class="min-w-0 flex-1">
        <button
          v-for="filter in OWNED_FILTERS"
          :key="filter.value"
          type="button"
          :aria-pressed="ownedFilter === filter.value"
          class="shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors"
          :class="
            ownedFilter === filter.value
              ? 'border-accent bg-accent text-white'
              : 'border-border-soft text-muted hover:text-foreground'
          "
          @click="ownedFilter = filter.value"
        >
          {{ filter.label }}
        </button>

        <!-- 스토어 필터. 성격이 다른 조건이라 선으로 끊어 둔다 -->
        <template v-if="hasOtherStore">
          <span class="mx-1 h-6 w-px shrink-0 self-center bg-border-soft" aria-hidden="true" />
          <button
            v-for="filter in SOURCE_FILTERS"
            :key="filter.value"
            type="button"
            :aria-pressed="sourceFilter === filter.value"
            class="shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors"
            :class="
              sourceFilter === filter.value
                ? 'border-foreground bg-foreground text-surface'
                : 'border-border-soft text-muted hover:text-foreground'
            "
            @click="sourceFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </template>

        <!--
          재고 필터. 품절이 열에 아홉이라 품절을 칠하는 대신 살 수 있는 쪽을 드러낸다
        -->
        <span class="mx-1 h-6 w-px shrink-0 self-center bg-border-soft" aria-hidden="true" />
        <button
          type="button"
          :aria-pressed="inStockOnly"
          class="shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors"
          :class="
            inStockOnly
              ? 'border-accent bg-accent text-white'
              : 'border-border-soft text-muted hover:text-foreground'
          "
          @click="inStockOnly = !inStockOnly"
        >
          지금 토벌 가능
        </button>
      </ChipScroller>
    </div>

    <p v-if="inStockOnly" class="px-1 text-xs text-muted">{{ stockNotice }}</p>

    <p
      v-if="visible.length === 0"
      class="rounded-2xl border border-dashed border-border-soft p-10 text-center text-muted"
      :aria-live="indexing ? 'polite' : undefined"
    >
      {{ emptyMessage }}
    </p>

    <template v-else>
      <!-- 아이콘 두 개가 각각 무엇인지 글로 밝혀 둔다. 모양만으로는 구분되지 않는다 -->
      <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span class="inline-flex items-center gap-1.5">
          <span
            class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent bg-accent text-white"
          >
            <svg viewBox="0 0 20 20" class="h-3 w-3" fill="none" aria-hidden="true">
              <path
                d="M5 10.5l3.5 3.5L15 7"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          체크 = 토벌 완료(손에 넣은 것)
        </span>
        <span class="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" class="h-4 w-4 text-premium" fill="currentColor" aria-hidden="true">
            <path
              d="M12 20.5l-1.4-1.3C5.8 15 3 12.4 3 9.2 3 6.7 5 4.8 7.5 4.8c1.4 0 2.8.7 3.6 1.8.8-1.1 2.2-1.8 3.6-1.8C17.2 4.8 19 6.7 19 9.2c0 3.2-2.8 5.8-7.6 10z"
            />
          </svg>
          하트 = 토벌 리스트(사고 싶은 것)
        </span>
      </p>

      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <DexItemCard
          v-for="item in rendered"
          :key="item.handle"
          :item="item"
          :owned="owned.has(item.handle)"
          :wish="wish.has(item.handle)"
          :ready="ready"
          :stock-checked-at="stockCheckedAt"
          @toggle="onToggle"
          @record="openRecord"
        />
      </ul>

      <button
        v-if="remaining > 0"
        type="button"
        class="mx-auto rounded-full border border-border-soft px-6 py-2.5 text-sm font-medium transition-colors hover:border-accent"
        @click="shown += PAGE_SIZE"
      >
        더 보기 <span class="text-muted">({{ remaining.toLocaleString() }}개 남음)</span>
      </button>
    </template>

    <LedgerRecordDialog
      v-if="recording"
      :item="recording"
      :owned-handles="owned"
      :wish-handles="wish"
      @close="recording = null"
      @saved="onSaved"
    />

    <p
      v-if="savedNotice"
      class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-5 py-2.5 text-sm text-surface shadow-lg"
    >
      기록했습니다.
      <NuxtLink to="/ledger" class="ml-1 underline">내 장부 보기</NuxtLink>
    </p>
  </div>
</template>
