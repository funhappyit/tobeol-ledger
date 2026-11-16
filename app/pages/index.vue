<script setup lang="ts">
import { dexTabs } from '@lib/items/dex';
import type { DexResponse } from '~~/server/api/dex.get';

// 홈은 캐릭터별 숫자만 쓴다. 굿즈 목록까지 받으면 응답이 수 MB가 된다
const { data } = await useFetch<DexResponse>('/api/dex', {
  key: 'dex:counts',
  query: { counts: '1' },
});

/** 캐릭터별 바로가기. 수집된 굿즈가 있는 캐릭터만 띄운다 */
const shortcuts = computed(() => {
  const counts = data.value?.counts ?? {};
  return dexTabs().filter((tab) => (counts[tab.code] ?? 0) > 0);
});
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
    <header>
      <p class="text-sm font-medium text-accent">비공식 치이카와 굿즈 장부</p>
      <h1 class="mt-2 text-4xl font-bold tracking-tight">토벌 장부</h1>
      <p class="mt-4 max-w-xl text-muted">
        굿즈를 토벌 리스트에 담고, 손에 넣은 굿즈의 지출을 기록하면 정가보다 얼마나 비싸게 샀는지
        계산해 줍니다.
      </p>

      <NuxtLink
        to="/dex"
        class="mt-6 inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        도감 보러 가기
      </NuxtLink>
    </header>

    <section v-if="shortcuts.length > 0" class="mt-12">
      <h2 class="text-sm font-semibold text-muted">캐릭터별로 보기</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <NuxtLink
          v-for="tab in shortcuts"
          :key="tab.code"
          :to="tab.href"
          class="rounded-full border border-border-soft bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
        >
          {{ tab.nameKo }}
          <span class="ml-1.5 text-xs text-muted">{{ data?.counts[tab.code] }}</span>
        </NuxtLink>
      </div>
    </section>

    <footer class="mt-16 border-t border-border-soft pt-6 text-xs text-muted">
      <p>
        비공식 개인 프로젝트입니다. 모든 캐릭터·이미지의 저작권은 원작자 ナガノ(Nagano) 및 정식
        라이선시에게 있습니다.
      </p>
    </footer>
  </main>
</template>
