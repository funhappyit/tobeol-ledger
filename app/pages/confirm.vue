<script setup lang="ts">
/**
 * 로그인 콜백
 *
 * 매직링크나 OAuth 를 거쳐 돌아오는 자리다.
 * 토큰 교환은 @nuxtjs/supabase 가 처리하므로 여기서는 세션이 잡힐 때까지 기다렸다가 보내 준다.
 */

useHead({ title: '로그인 확인' });

const user = useSupabaseUser();
const router = useRouter();

watch(
  user,
  (value) => {
    if (value) {
      router.replace('/dex');
    }
  },
  { immediate: true },
);
</script>

<template>
  <main class="mx-auto w-full max-w-md px-4 py-20 text-center sm:px-6">
    <p class="text-muted">로그인 중입니다...</p>
    <NuxtLink to="/login" class="mt-4 inline-block text-sm text-muted hover:text-foreground">
      화면이 바뀌지 않으면 다시 시도하기
    </NuxtLink>
  </main>
</template>
