<script setup lang="ts">
/**
 * 상단 내비게이션
 *
 * 도감은 하위 경로(/dex/chiikawa)에서도 선택된 상태로 보여야 하므로
 * NuxtLink 의 기본 활성 판정 대신 경로 앞부분으로 직접 따진다.
 */

const route = useRoute();

const NAV = [
  { to: '/', label: '홈' },
  { to: '/dex', label: '도감' },
];

function isActive(to: string): boolean {
  if (to === '/') {
    return route.path === '/';
  }
  return route.path.startsWith(to);
}
</script>

<template>
  <header class="sticky top-0 z-10 border-b border-border-soft bg-surface/90 backdrop-blur">
    <div class="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
      <NuxtLink to="/" class="text-base font-bold tracking-tight">토벌 장부</NuxtLink>

      <nav class="flex items-center gap-1">
        <NuxtLink
          v-for="entry in NAV"
          :key="entry.to"
          :to="entry.to"
          :aria-current="isActive(entry.to) ? 'page' : undefined"
          class="rounded-full px-3 py-1.5 text-sm transition-colors"
          :class="
            isActive(entry.to) ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
          "
        >
          {{ entry.label }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
