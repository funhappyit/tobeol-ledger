<script setup lang="ts">
/**
 * 헤더의 로그인 상태 표시
 *
 * 로그인 여부는 서버 렌더 시점에도 쿠키로 알 수 있어서 깜빡임 없이 그려진다.
 */

const user = useSupabaseUser();
const client = useSupabaseClient();

/** 메일 주소는 길어서 헤더에 다 넣지 않는다. @ 앞부분만 */
const label = computed(() => {
  const email = user.value?.email;
  if (!email) {
    return '';
  }
  return email.split('@')[0] ?? email;
});

async function signOut(): Promise<void> {
  await client.auth.signOut();
}
</script>

<template>
  <div class="ml-auto flex items-center gap-2">
    <template v-if="user">
      <span class="hidden text-sm text-muted sm:inline">{{ label }}</span>
      <button
        type="button"
        class="rounded-full border border-border-soft px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
        @click="signOut"
      >
        로그아웃
      </button>
    </template>

    <NuxtLink
      v-else
      to="/login"
      class="rounded-full border border-border-soft px-3 py-1.5 text-sm transition-colors hover:border-accent"
    >
      로그인
    </NuxtLink>
  </div>
</template>
