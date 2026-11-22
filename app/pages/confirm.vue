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

/**
 * Supabase 가 돌려주는 오류 코드를 사람이 읽을 말로 바꾼다.
 * 원문은 영어이고, 무엇을 해야 하는지가 빠져 있어 그대로 보여 주면 막막하다.
 */
const ERROR_MESSAGES: Record<string, string> = {
  otp_expired:
    '로그인 링크가 만료됐거나 이미 사용됐습니다. 링크는 한 번만 쓸 수 있으니, 로그인 화면에서 새 링크를 받아 한 번만 눌러 주세요.',
  access_denied:
    '로그인이 거부됐습니다. 링크가 만료됐거나 이미 사용됐을 가능성이 큽니다. 새 링크를 받아 주세요.',
  flow_state_not_found:
    '로그인 요청과 링크가 짝이 맞지 않습니다. 로그인을 시작한 브라우저에서 가장 최근에 받은 링크를 열어 주세요.',
};

/** 오류는 쿼리로 올 때도 있고 해시(#)로 올 때도 있다 */
function readError(): string | null {
  const hash = import.meta.client
    ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
    : new URLSearchParams();

  const pick = (key: string): string | null => {
    const value = route.query[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    return hash.get(key);
  };

  const code = pick('error_code');
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  const name = pick('error');
  if (name && ERROR_MESSAGES[name]) {
    return ERROR_MESSAGES[name];
  }

  // 모르는 오류는 원문 그대로 보여 준다. 숨기면 알아낼 방법이 없다
  return pick('error_description') ?? name;
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
