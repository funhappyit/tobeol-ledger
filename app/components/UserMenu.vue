<script setup lang="ts">
/**
 * 헤더의 로그인 상태 표시
 *
 * 반드시 브라우저에서만 그려야 한다(SiteHeader 가 ClientOnly 로 감싸고 있다).
 * 로그인 여부는 쿠키라서 서버 렌더 시점에도 알 수 있지만, 도감·홈은 ISR 로
 * 캐시한 HTML 을 모두에게 돌려주는 화면이다. 서버에서 그리면 먼저 들른 사람의
 * 계정이 담긴 HTML 이 캐시돼 다음 방문자에게 그대로 나간다.
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
      <!--
        계정명을 누르면 계정 화면으로 간다.
        비밀번호를 거는 자리가 거기에 있는데, 주소를 직접 치지 않으면 닿을 길이 없었다.
      -->
      <NuxtLink
        to="/login"
        class="hidden text-sm text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline sm:inline"
        title="계정 설정"
      >
        {{ label }}
      </NuxtLink>
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
