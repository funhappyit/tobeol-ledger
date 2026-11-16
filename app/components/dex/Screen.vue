<script setup lang="ts">
/**
 * 도감 화면 틀
 *
 * `/dex` 와 `/dex/{캐릭터}` 가 같은 화면을 쓰므로 한곳에 모아 둔다.
 * 굿즈 목록은 서버에서 수집 파일을 읽어 내려준다(server/api/dex.get.ts).
 */

import { ALL_CHARACTERS, characterTitle, dexTabs } from '@lib/items/dex';
import type { DexResponse } from '~~/server/api/dex.get';

const props = defineProps<{ character: string }>();

const title = computed(() =>
  props.character === ALL_CHARACTERS ? '굿즈 도감' : `${characterTitle(props.character)} 도감`,
);

useHead({ title: title.value });

const { data, status } = await useFetch<DexResponse>('/api/dex', {
  // 캐릭터가 바뀌면 다시 받아야 하므로 키를 캐릭터별로 나눈다
  key: () => `dex:${props.character}`,
  query: computed(() => ({ character: props.character })),
});

const tabs = dexTabs();
const hasWrongCurrency = computed(() =>
  (data.value?.currencies ?? []).some((currency) => currency !== 'JPY'),
);
</script>

<template>
  <main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-sm font-medium text-accent">토벌 장부</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight">{{ title }}</h1>
    </header>

    <p
      v-if="status === 'pending'"
      class="rounded-2xl border border-border-soft bg-surface p-10 text-center text-muted"
    >
      도감을 불러오는 중...
    </p>

    <div
      v-else-if="!data || data.total === 0"
      class="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center"
    >
      <p class="text-lg font-semibold">아직 수집된 굿즈가 없습니다</p>
      <p class="mt-2 text-sm text-muted">
        Git Bash 에서 아래 명령을 실행하면 공식몰에서 굿즈를 받아옵니다.
      </p>
      <pre class="mt-4 inline-block rounded-lg bg-background px-4 py-2 text-left text-sm">npx tsx scripts/collect-items.ts --limit 50</pre>
    </div>

    <template v-else>
      <p
        v-if="hasWrongCurrency"
        class="mb-5 rounded-xl border border-premium/40 bg-premium/10 px-4 py-3 text-sm text-premium"
      >
        정가가 엔화가 아닌 통화({{ data.currencies.join(', ') }})로 수집됐습니다. 다시 수집해 주세요.
      </p>

      <nav class="mb-6 flex flex-wrap gap-1.5 border-b border-border-soft pb-4">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.code"
          :to="tab.href"
          :aria-current="tab.code === character ? 'page' : undefined"
          class="rounded-full border px-3.5 py-1.5 text-sm transition-colors"
          :class="
            tab.code === character
              ? 'border-accent bg-accent text-white'
              : 'border-border-soft bg-surface text-muted hover:text-foreground'
          "
        >
          {{ tab.nameKo }}
          <span
            class="ml-1.5 text-xs"
            :class="tab.code === character ? 'text-white/80' : 'text-muted'"
          >
            {{ data.counts[tab.code] ?? 0 }}
          </span>
        </NuxtLink>
      </nav>

      <DexBoard :items="data.items" />
    </template>

    <footer class="mt-12 border-t border-border-soft pt-6 text-xs text-muted">
      <p>
        비공식 개인 프로젝트입니다. 모든 캐릭터·이미지의 저작권은 원작자 ナガノ(Nagano) 및 정식
        라이선시에게 있습니다.
      </p>
    </footer>
  </main>
</template>
