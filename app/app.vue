<script setup lang="ts">
useHead({
  titleTemplate: (title) => (title ? `${title} — 토벌 장부` : '토벌 장부 — 치이카와 굿즈 토벌 기록과 지출 분석'),
  meta: [
    {
      name: 'description',
      content:
        '치이카와(먼작귀) 굿즈를 토벌 리스트에 담고, 손에 넣은 굿즈의 지출을 기록해 정가 대비 얼마나 비싸게 샀는지 보여주는 비공식 팬 서비스.',
    },
  ],
});
</script>

<template>
  <div class="flex min-h-full flex-col">
    <SiteHeader />
    <NuxtPage />
  </div>
</template>
