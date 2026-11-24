<script setup lang="ts">
/**
 * 로그인 · 회원가입
 *
 * 들어오는 길을 네 가지 둔다.
 *   비밀번호 — 메일을 보내지 않아 발송 한도와 무관하다. 가장 확실하게 동작한다
 *   매직링크 — 비밀번호 없이 쓸 수 있지만 메일 발송 한도가 있다. 계정이 없으면 만들어 준다
 *   Google / Kakao — 대시보드에서 켠 것만 동작한다
 *
 * 로그인하지 않아도 도감은 다 볼 수 있다. 로그인은 "기록을 계정에 묶는" 용도다.
 */

useHead({ title: '로그인' });

const client = useSupabaseClient();
const user = useSupabaseUser();
const router = useRouter();

/** 같은 폼을 로그인과 회원가입이 나눠 쓴다. 입력 항목이 같아서 창을 따로 둘 이유가 없다 */
type Mode = 'signin' | 'signup';

const mode = ref<Mode>('signin');
const email = ref('');
const password = ref('');
const sending = ref(false);
const signingIn = ref(false);
const sent = ref(false);
const signedUp = ref(false);
const errorMessage = ref<string | null>(null);

const isSignUp = computed(() => mode.value === 'signup');

// 길을 바꾸면 앞서 띄운 안내는 더 이상 맞지 않는다
watch(mode, () => {
  sent.value = false;
  signedUp.value = false;
  errorMessage.value = null;
});

/**
 * Supabase 가 돌려주는 영문 메시지를 읽을 수 있는 말로 바꾼다.
 * 원문만 보면 무슨 한도에 걸렸는지, 무엇을 고쳐야 하는지 알 수 없는 것들이다.
 */
const ERROR_MESSAGES: { match: string; message: string }[] = [
  {
    match: 'Invalid login credentials',
    message: '이메일 또는 비밀번호가 맞지 않습니다. 계정이 아직 없다면 위에서 회원가입을 눌러 주세요.',
  },
  { match: 'at least 6 characters', message: '비밀번호는 6자 이상이어야 합니다.' },
  { match: 'Password should be', message: '비밀번호가 조건에 맞지 않습니다. 6자 이상으로 적어 주세요.' },
  { match: 'already registered', message: '이미 가입된 이메일입니다. 로그인을 눌러 주세요.' },
  {
    match: 'rate limit',
    message: '메일 발송 한도를 넘었습니다. 한 시간쯤 뒤에 다시 되거나, 비밀번호 방식을 쓰시면 됩니다.',
  },
  { match: 'Unable to validate email', message: '이메일 형식을 다시 확인해 주세요.' },
];

function toKorean(message: string): string {
  return ERROR_MESSAGES.find((entry) => message.includes(entry.match))?.message ?? message;
}

/** 비밀번호로 로그인. 메일을 거치지 않아 즉시 끝난다 */
async function signInWithPassword(): Promise<void> {
  const address = email.value.trim();
  if (address.length === 0 || password.value.length === 0 || signingIn.value) {
    return;
  }

  signingIn.value = true;
  errorMessage.value = null;

  const { error } = await client.auth.signInWithPassword({
    email: address,
    password: password.value,
  });

  signingIn.value = false;

  if (error) {
    errorMessage.value = toKorean(error.message);
    return;
  }

  password.value = '';
  router.replace('/dex');
}

/**
 * 회원가입.
 *
 * 가입 뒤 무엇이 일어나는지는 Supabase 의 "Confirm email" 설정에 달렸다.
 *   켜져 있으면 — 확인 메일이 가고 세션은 아직 없다
 *   꺼져 있으면 — 그 자리에서 세션이 생겨 바로 로그인된다
 * 어느 쪽인지 코드가 알 수 없으므로 응답의 session 유무로 가른다.
 */
async function signUp(): Promise<void> {
  const address = email.value.trim();
  if (address.length === 0 || password.value.length === 0 || signingIn.value) {
    return;
  }

  signingIn.value = true;
  errorMessage.value = null;

  const { data, error } = await client.auth.signUp({
    email: address,
    password: password.value,
    options: { emailRedirectTo: callbackUrl() },
  });

  signingIn.value = false;

  if (error) {
    errorMessage.value = toKorean(error.message);
    return;
  }

  password.value = '';

  if (data.session) {
    router.replace('/dex');
    return;
  }

  // 이미 가입된 주소로 가입을 눌러도 Supabase 는 오류를 내지 않고 같은 모양으로 답한다.
  // 어느 메일이 가입돼 있는지 남에게 알려주지 않기 위한 동작이라, 안내도 똑같이 둔다
  signedUp.value = true;
}

function onSubmit(): void {
  if (isSignUp.value) {
    void signUp();
  } else {
    void signInWithPassword();
  }
}

/** 로그인 뒤 돌아올 주소. 서버에서는 window 를 못 보므로 호출 시점에 만든다 */
function callbackUrl(): string {
  return `${window.location.origin}/confirm`;
}

async function sendMagicLink(): Promise<void> {
  const address = email.value.trim();
  if (address.length === 0 || sending.value) {
    return;
  }

  sending.value = true;
  errorMessage.value = null;

  const { error } = await client.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: callbackUrl() },
  });

  sending.value = false;

  if (error) {
    errorMessage.value = toKorean(error.message);
    return;
  }

  sent.value = true;
}

async function signInWith(provider: 'google' | 'kakao'): Promise<void> {
  errorMessage.value = null;

  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl() },
  });

  if (error) {
    errorMessage.value = toKorean(error.message);
  }
}

async function signOut(): Promise<void> {
  await client.auth.signOut();
}
</script>

<template>
  <main class="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
    <h1 class="text-2xl font-bold tracking-tight">{{ isSignUp ? '회원가입' : '로그인' }}</h1>
    <p class="mt-2 text-sm text-muted">
      로그인하면 토벌 기록이 계정에 저장돼 다른 기기에서도 이어집니다. 지금까지 이 브라우저에
      체크해 둔 기록은 로그인할 때 함께 올라갑니다.
    </p>

    <!-- 이미 로그인한 상태로 들어온 경우 -->
    <div
      v-if="user"
      class="mt-8 rounded-2xl border border-border-soft bg-surface p-5 text-sm"
    >
      <p>
        <strong class="font-semibold">{{ user.email }}</strong> 으로 로그인되어 있습니다.
      </p>
      <div class="mt-4 flex gap-2">
        <NuxtLink
          to="/dex"
          class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          도감으로
        </NuxtLink>
        <button
          type="button"
          class="rounded-full border border-border-soft px-4 py-2 text-sm transition-colors hover:border-accent"
          @click="signOut"
        >
          로그아웃
        </button>
      </div>
    </div>

    <template v-else>
      <!-- 로그인과 회원가입은 적는 것이 같아서 폼 하나를 나눠 쓴다 -->
      <div
        role="tablist"
        class="mt-8 flex gap-1 rounded-xl border border-border-soft bg-background p-1"
      >
        <button
          v-for="tab in [
            { value: 'signin' as Mode, label: '로그인' },
            { value: 'signup' as Mode, label: '회원가입' },
          ]"
          :key="tab.value"
          type="button"
          role="tab"
          :aria-selected="mode === tab.value"
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="mode === tab.value ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'"
          @click="mode = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 비밀번호: 메일을 거치지 않아 발송 한도와 무관하다 -->
      <form class="mt-4 flex flex-col gap-3" @submit.prevent="onSubmit">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">이메일</span>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
          >
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">비밀번호</span>
          <input
            v-model="password"
            type="password"
            required
            :minlength="isSignUp ? 6 : undefined"
            :autocomplete="isSignUp ? 'new-password' : 'current-password'"
            class="rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
          >
          <span v-if="isSignUp" class="text-xs text-muted">6자 이상</span>
        </label>

        <button
          type="submit"
          :disabled="signingIn"
          class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <template v-if="signingIn">{{ isSignUp ? '가입 중...' : '로그인 중...' }}</template>
          <template v-else>{{ isSignUp ? '가입하기' : '로그인' }}</template>
        </button>
      </form>

      <p
        v-if="signedUp"
        class="mt-3 rounded-xl border border-fair/40 bg-fair/10 px-4 py-3 text-sm text-fair"
      >
        확인 메일을 보냈습니다. 받은 편지함의 링크를 누르면 가입이 끝납니다.
        메일이 안 보이면 스팸함도 확인해 주세요.
      </p>

      <!-- 매직링크: 비밀번호 없이 메일로 받은 링크를 눌러 들어온다 -->
      <button
        type="button"
        :disabled="sending"
        class="mt-3 w-full rounded-xl border border-border-soft px-4 py-2.5 text-sm transition-colors hover:border-accent disabled:opacity-50"
        @click="sendMagicLink"
      >
        <template v-if="sending">보내는 중...</template>
        <template v-else>{{ isSignUp ? '비밀번호 없이 메일 링크로 시작하기' : '비밀번호 없이 메일 링크로 로그인' }}</template>
      </button>

      <p v-if="sent" class="mt-3 rounded-xl border border-fair/40 bg-fair/10 px-4 py-3 text-sm text-fair">
        메일을 보냈습니다. 받은 편지함의 링크를 누르면 로그인됩니다.
        계정이 없으면 그때 만들어집니다. 링크는 한 번만 쓸 수 있습니다.
      </p>

      <div class="my-6 flex items-center gap-3 text-xs text-muted">
        <span class="h-px flex-1 bg-border-soft" />
        또는
        <span class="h-px flex-1 bg-border-soft" />
      </div>

      <div class="flex flex-col gap-2">
        <button
          type="button"
          class="rounded-xl border border-border-soft px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent"
          @click="signInWith('google')"
        >
          Google 로 계속하기
        </button>
        <button
          type="button"
          class="rounded-xl border border-border-soft px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent"
          @click="signInWith('kakao')"
        >
          Kakao 로 계속하기
        </button>
      </div>

      <p class="mt-3 text-xs text-muted">
        Google·Kakao 는 Supabase 대시보드에서 켜 둔 경우에만 동작합니다.
      </p>
    </template>

    <p v-if="errorMessage" class="mt-5 rounded-xl border border-premium/40 bg-premium/10 px-4 py-3 text-sm text-premium">
      {{ errorMessage }}
    </p>

    <NuxtLink to="/dex" class="mt-8 inline-block text-sm text-muted hover:text-foreground">
      로그인 없이 도감 보기
    </NuxtLink>
  </main>
</template>
