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
  { to: '/ledger', label: '내 장부' },
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

      <!--
        로그인 상태는 반드시 브라우저에서만 그린다.
        도감·홈은 ISR 로 캐시된 HTML 을 모두에게 돌려주는 화면이라,
        서버에서 그리면 먼저 들른 사람의 계정이 담긴 HTML 이 캐시돼 남에게 나간다.
        자리만 미리 잡아 두어 메뉴가 뜰 때 머리글이 흔들리지 않게 한다.
      -->
      <ClientOnly>
        <UserMenu />
        <template #fallback>
          <div class="ml-auto h-[34px] w-20" aria-hidden="true" />
        </template>
      </ClientOnly>
    </div>
  </header>
</template>
