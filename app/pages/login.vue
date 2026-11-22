<script setup lang="ts">
/**
 * 로그인
 *
 * 네 가지를 둔다.
 *   비밀번호 — 메일을 보내지 않아 발송 한도와 무관하다. 가장 확실하게 동작한다
 *   매직링크 — 비밀번호 없이 쓸 수 있지만 메일 발송 한도가 있다
 *   Google / Kakao — 대시보드에서 켠 것만 동작한다
 *
 * 로그인하지 않아도 도감은 다 볼 수 있다. 로그인은 "기록을 계정에 묶는" 용도다.
 */

useHead({ title: '로그인' });

const client = useSupabaseClient();
const user = useSupabaseUser();
const router = useRouter();

const email = ref('');
const password = ref('');
const sending = ref(false);
const signingIn = ref(false);
const sent = ref(false);
const errorMessage = ref<string | null>(null);

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
    errorMessage.value =
      error.message === 'Invalid login credentials'
        ? '이메일 또는 비밀번호가 맞지 않습니다. 계정이 아직 없다면 Supabase 대시보드에서 만들어 주세요.'
        : error.message;
    return;
  }

  password.value = '';
  router.replace('/dex');
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
    // 무료 플랜은 시간당 발송 수가 묶여 있다. 원문만 보면 무슨 한도인지 알 수 없다
    errorMessage.value = error.message.includes('rate limit')
      ? '메일 발송 한도를 넘었습니다. 한 시간쯤 뒤에 다시 되거나, 위의 비밀번호 로그인을 쓰시면 됩니다.'
      : error.message;
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
    errorMessage.value = error.message;
  }
}

async function signOut(): Promise<void> {
  await client.auth.signOut();
}
</script>

<template>
  <main class="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
    <h1 class="text-2xl font-bold tracking-tight">로그인</h1>
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
      <!-- 비밀번호: 메일을 거치지 않아 발송 한도와 무관하다 -->
      <form class="mt-8 flex flex-col gap-3" @submit.prevent="signInWithPassword">
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
            autocomplete="current-password"
            class="rounded-xl border border-border-soft bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
          >
        </label>

        <button
          type="submit"
          :disabled="signingIn"
          class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {{ signingIn ? '로그인 중...' : '로그인' }}
        </button>
      </form>

      <!-- 매직링크: 비밀번호 없이 메일로 받은 링크를 눌러 들어온다 -->
      <button
        type="button"
        :disabled="sending"
        class="mt-3 w-full rounded-xl border border-border-soft px-4 py-2.5 text-sm transition-colors hover:border-accent disabled:opacity-50"
        @click="sendMagicLink"
      >
        {{ sending ? '보내는 중...' : '비밀번호 없이 메일 링크로 로그인' }}
      </button>

      <p v-if="sent" class="mt-3 rounded-xl border border-fair/40 bg-fair/10 px-4 py-3 text-sm text-fair">
        메일을 보냈습니다. 받은 편지함의 링크를 누르면 로그인됩니다. 링크는 한 번만 쓸 수 있습니다.
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
