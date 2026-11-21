<script setup lang="ts">
/**
 * 로그인
 *
 * 세 가지를 모두 둔다.
 *   매직링크 — 외부 등록이 필요 없어 Supabase 만으로 바로 동작한다
 *   Google / Kakao — 대시보드에서 켠 것만 동작한다
 *
 * 로그인하지 않아도 도감은 다 볼 수 있다. 로그인은 "기록을 계정에 묶는" 용도다.
 */

useHead({ title: '로그인' });

const client = useSupabaseClient();
const user = useSupabaseUser();

const email = ref('');
const sending = ref(false);
const sent = ref(false);
const errorMessage = ref<string | null>(null);

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
    errorMessage.value = error.message;
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
      <!-- 매직링크: 비밀번호 없이 메일로 받은 링크를 눌러 들어온다 -->
      <form class="mt-8 flex flex-col gap-3" @submit.prevent="sendMagicLink">
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

        <button
          type="submit"
          :disabled="sending"
          class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {{ sending ? '보내는 중...' : '로그인 링크 받기' }}
        </button>

        <p v-if="sent" class="rounded-xl border border-fair/40 bg-fair/10 px-4 py-3 text-sm text-fair">
          메일을 보냈습니다. 받은 편지함의 링크를 누르면 로그인됩니다.
        </p>
      </form>

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
