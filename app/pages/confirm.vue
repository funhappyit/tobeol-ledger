<script setup lang="ts">
/**
 * 로그인 콜백
 *
 * 매직링크나 OAuth 를 거쳐 돌아오는 자리다.
 * 토큰 교환 자체는 supabase 클라이언트가 주소에 담겨 온 값을 보고 알아서 한다
 * (createBrowserClient 의 detectSessionInUrl). 그래서 여기서 직접 교환하지 않는다.
 * 두 번 교환하면 "code already used" 로 오히려 실패한다.
 *
 * 다만 실패했을 때 가만히 멈춰 있으면 안 된다.
 * 실패는 주소의 error 파라미터로 오거나, 아무 일도 일어나지 않는 형태로 온다.
 * 둘 다 화면에 드러내야 사용자가 다음에 무엇을 할지 알 수 있다.
 */

useHead({ title: '로그인 확인' });

const user = useSupabaseUser();
const route = useRoute();
const router = useRouter();

/** 교환이 끝나기를 기다리는 시간. 이보다 오래 걸리면 실패로 본다 */
const TIMEOUT_MS = 6000;

const failure = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

/** 오류는 쿼리로 올 때도 있고 해시(#)로 올 때도 있다 */
function readError(): string | null {
  const fromQuery = route.query.error_description ?? route.query.error;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    return fromQuery;
  }

  if (import.meta.client) {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return hash.get('error_description') ?? hash.get('error');
  }

  return null;
}

onMounted(() => {
  const error = readError();
  if (error) {
    failure.value = error;
    return;
  }

  timer = setTimeout(() => {
    if (!user.value) {
      failure.value =
        '로그인 정보를 확인하지 못했습니다. 링크가 만료됐거나 이미 사용됐을 수 있고, 로그인을 시작한 브라우저와 다른 브라우저에서 링크를 열어도 이렇게 됩니다.';
    }
  }, TIMEOUT_MS);
});

onUnmounted(() => {
  if (timer) {
    clearTimeout(timer);
  }
});

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
    <template v-if="failure">
      <p class="rounded-xl border border-premium/40 bg-premium/10 px-4 py-3 text-left text-sm text-premium">
        {{ failure }}
      </p>
      <NuxtLink
        to="/login"
        class="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        다시 로그인하기
      </NuxtLink>
    </template>

    <template v-else>
      <p class="text-muted">로그인 중입니다...</p>
      <NuxtLink to="/login" class="mt-4 inline-block text-sm text-muted hover:text-foreground">
        화면이 바뀌지 않으면 다시 시도하기
      </NuxtLink>
    </template>
  </main>
</template>
