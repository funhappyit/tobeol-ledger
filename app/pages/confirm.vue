<script setup lang="ts">
/**
 * 로그인 콜백
 *
 * 매직링크나 OAuth 를 거쳐 돌아오는 자리다.
 * 토큰 교환은 원래 supabase 클라이언트가 알아서 한다(detectSessionInUrl).
 * 그런데 PKCE 방식에서는 로그인을 시작할 때 저장해 둔 검증값(code verifier)이 있어야만
 * 교환을 시도한다. 검증값이 없으면 아무 일도 하지 않고 조용히 넘어가서,
 * 주소에 ?code= 가 그대로 남은 채 화면이 멈춘다.
 *
 * 그래서 세션이 없고 code 가 남아 있으면 직접 교환해 본다.
 * 실패하면 이유가 오류 메시지로 돌아오므로 그것을 그대로 보여 준다.
 * (자동 교환이 이미 성공한 경우에는 code 가 주소에서 지워지므로 여기까지 오지 않는다)
 */

useHead({ title: '로그인 확인' });

const supabase = useSupabaseClient();
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

onMounted(async () => {
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

  // 자동 교환이 일어나지 않은 경우에만 직접 교환한다
  const code = route.query.code;
  if (typeof code !== 'string' || user.value) {
    return;
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    failure.value = `${exchangeError.message} (code ${exchangeError.status ?? '?'})`;
  }
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
