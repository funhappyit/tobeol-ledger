<script setup lang="ts">
/**
 * 도감 화면 틀
 *
 * `/dex` 와 `/dex/{캐릭터}` 가 같은 화면을 쓰므로 한곳에 모아 둔다.
 * 굿즈 목록은 서버에서 수집 파일을 읽어 내려준다(server/api/dex.get.ts).
 *
 * 캐릭터 탭을 패널 위에 얹은 모양으로 둔 이유는, 도감이 "캐릭터별 책자를 넘겨 보는" 화면이라
 * 지금 어느 책자를 펴고 있는지가 한눈에 보여야 하기 때문이다.
 */

import { ALL_CHARACTERS, characterTitle, dexTabs, minorCharacterNames, OTHER_CHARACTERS } from '@lib/items/dex';
import { sourceName } from '@lib/items/labels';
import type { ItemSource } from '@lib/collect/types';
import type { DexResponse } from '~~/server/api/dex.get';

const props = defineProps<{ character: string }>();

const title = computed(() =>
  props.character === ALL_CHARACTERS ? '굿즈 도감' : `${characterTitle(props.character)} 도감`,
);

useHead({ title: () => title.value });

const { data, status } = await useFetch<DexResponse>('/api/dex', {
  // 캐릭터가 바뀌면 다시 받아야 하므로 키를 캐릭터별로 나눈다
  key: () => `dex:${props.character}`,
  query: computed(() => ({ character: props.character })),
});

const tabs = dexTabs();
const { owned, ready } = useMarks();

const items = computed(() => data.value?.items ?? []);

const hasWrongCurrency = computed(() =>
  (data.value?.currencies ?? []).some((currency) => currency !== 'JPY'),
);

const ownedCount = computed(() =>
  ready.value ? items.value.filter((item) => owned.value.has(item.handle)).length : 0,
);

const percent = computed(() =>
  items.value.length > 0 ? Math.round((ownedCount.value / items.value.length) * 100) : 0,
);

/**
 * 지금 보고 있는 목록에 섞인 다른 스토어 굿즈 수.
 * 전체 건수를 서버에서 받아 두지 않고 여기서 세는 이유는, 캐릭터로 거른 뒤의 수여야 하기 때문이다.
 * 공식몰 굿즈는 응답에서 source 키를 빼기 때문에(items/view.ts) 세어지지 않는다.
 */
const otherStoreCounts = computed(() => {
  const counts = new Map<string, number>();

  for (const item of items.value) {
    if (item.source === undefined || item.source === 'official') {
      continue;
    }
    counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  }

  return [...counts.entries()].map(([source, count]) => ({
    label: sourceName(source as ItemSource) ?? source,
    count,
  }));
});

/** "다른 친구들" 탭에서는 어떤 캐릭터가 묶여 있는지 알려 준다 */
const subtitle = computed(() => {
  const total = items.value.length.toLocaleString();
  const mixed =
    otherStoreCounts.value.length > 0
      ? ` · ${otherStoreCounts.value
          .map((store) => `${store.label} ${store.count.toLocaleString()}개`)
          .join(', ')} 포함`
      : '';

  if (props.character === OTHER_CHARACTERS) {
    return `전체 ${total}개${mixed} · ${minorCharacterNames().join(', ')}와 캐릭터 표기가 없는 굿즈`;
  }

  return `전체 ${total}개${mixed} · 카드의 체크를 누르면 토벌 도장이 찍혀요`;
});
</script>

<template>
  <main class="mx-auto w-full max-w-7xl px-3 pt-4 pb-10 sm:px-6">
    <!-- 탭 바. 좁은 화면에서는 가로로 넘긴다 -->
    <ChipScroller class="-mb-px" on-background>
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.code"
        :to="tab.href"
        :aria-current="tab.code === character ? 'page' : undefined"
        :style="{ '--tint': tab.tint }"
        class="dex-tab flex shrink-0 items-center gap-2 rounded-t-2xl border border-b-0 px-3 py-2 transition-colors"
      >
        <span
          class="dex-badge flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        >
          {{ tab.short }}
        </span>
        <span class="flex flex-col leading-tight">
          <span class="text-sm font-semibold whitespace-nowrap">{{ tab.nameKo }}</span>
          <span class="text-xs text-muted">{{ (data?.counts[tab.code] ?? 0).toLocaleString() }}</span>
        </span>
      </NuxtLink>
    </ChipScroller>

    <section class="rounded-2xl rounded-tl-none border border-border-soft bg-surface p-4 sm:p-6">
      <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ title }}</h1>
          <p class="mt-1.5 text-sm text-muted">{{ subtitle }}</p>
        </div>

        <div
          v-if="items.length > 0"
          class="shrink-0 rounded-full border border-border-soft px-4 py-2 text-sm"
        >
          토벌 <strong class="font-semibold">{{ ownedCount.toLocaleString() }}</strong> /
          {{ items.length.toLocaleString() }}
          <span class="ml-1 text-accent">({{ percent }}%)</span>
        </div>
      </header>

      <p
        v-if="hasWrongCurrency"
        class="mt-5 rounded-xl border border-premium/40 bg-premium/10 px-4 py-3 text-sm text-premium"
      >
        정가가 엔화가 아닌 통화({{ data?.currencies.join(', ') }})로 수집됐습니다. 다시 수집해
        주세요.
      </p>

      <p v-if="status === 'pending'" class="mt-8 text-center text-muted">도감을 불러오는 중...</p>

      <div
        v-else-if="!data || data.total === 0"
        class="mt-6 rounded-2xl border border-dashed border-border-soft p-10 text-center"
      >
        <p class="text-lg font-semibold">아직 수집된 굿즈가 없습니다</p>
        <p class="mt-2 text-sm text-muted">
          Git Bash 에서 아래 명령을 실행하면 공식몰에서 굿즈를 받아옵니다.
        </p>
        <pre class="mt-4 inline-block rounded-lg bg-background px-4 py-2 text-left text-sm">npx tsx scripts/collect-items.ts --interval 2000</pre>
      </div>

      <DexBoard v-else class="mt-6" :items="data.items" />
    </section>

    <footer class="mt-8 px-1 text-xs text-muted">
      <p>
        비공식 개인 프로젝트입니다. 모든 캐릭터·이미지의 저작권은 원작자 ナガノ(Nagano) 및 정식
        라이선시에게 있습니다.
      </p>
    </footer>
  </main>
</template>
