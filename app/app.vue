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
    <!--
      화면을 옮길 때 위쪽에 진행 막대를 띄운다.
      도감은 굿즈 목록을 통째로 받고 나서야 그려지는데, 그동안 아무 표시가 없으면
      누른 것이 먹히지 않은 것처럼 보인다. 받는 중이라는 사실만이라도 알린다.
    -->
    <NuxtLoadingIndicator color="var(--accent)" :height="3" />

    <SiteHeader />
    <NuxtPage />
  </div>
</template>
