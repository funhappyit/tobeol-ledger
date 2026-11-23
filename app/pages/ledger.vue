<script setup lang="ts">
/**
 * 내 장부
 *
 * 구매 기록을 모아 보고, 정가 대비 얼마나 더 썼는지 합산해 보여 준다.
 *
 * 합계를 두 갈래로 나눠 보여 주는 이유:
 *   플미   — 상품값만 정가와 견준 것. 배송비·수수료는 뺀다
 *   총지출 — 실제로 나간 돈 전부
 * 합쳐 버리면 배대지를 거쳐 정가에 산 것도 웃돈 준 것으로 보인다.
 */

import {
  calculatePremium,
  formatKrw,
  formatPremium,
  sourceName,
  summarize,
  type Acquisition,
} from '@lib/ledger/calc';
import type { AcquisitionRow, Database } from '~/types/database.types';

useHead({ title: '내 장부' });

const supabase = useSupabaseClient<Database>();
const user = useSupabaseUser();

const records = ref<Acquisition[]>([]);
const loading = ref(true);
const errorMessage = ref<string | null>(null);

/** DB 행을 계산 모듈이 쓰는 모양으로 바꾼다 */
function toAcquisition(row: AcquisitionRow): Acquisition {
  return {
    id: row.id,
    handle: row.handle,
    source: row.source,
    purchasedOn: row.purchased_on,
    quantity: row.quantity,
    itemPriceKrw: row.item_price_krw,
    shippingKrw: row.shipping_krw,
    feeKrw: row.fee_krw,
    listPriceJpy: row.list_price_jpy,
    fxRate: row.fx_rate === null ? null : Number(row.fx_rate),
    memo: row.memo,
  };
}

/** 이름은 기록 시점 값을 그대로 쓴다. 수집본이 없어도 무엇을 샀는지 남아야 한다 */
const names = ref<Record<string, string>>({});

async function load(): Promise<void> {
  if (!user.value) {
    loading.value = false;
    return;
  }

  loading.value = true;
  errorMessage.value = null;

  const { data, error } = await supabase
    .from('acquisitions')
    .select('*')
    .order('purchased_on', { ascending: false });

  loading.value = false;

  if (error) {
    errorMessage.value = error.message;
    return;
  }

  const rows = data ?? [];
  records.value = rows.map(toAcquisition);
  names.value = Object.fromEntries(
    rows.map((row) => [row.id, row.name_snapshot ?? row.handle]),
  );
}

async function remove(id: string): Promise<void> {
  const { error } = await supabase.from('acquisitions').delete().eq('id', id);

  if (error) {
    errorMessage.value = error.message;
    return;
  }

  records.value = records.value.filter((record) => record.id !== id);
}

watch(user, load, { immediate: true });

const summary = computed(() => summarize(records.value));

/**
 * 기록과 계산 결과를 미리 짝지어 둔다.
 * 템플릿에서 calculatePremium 을 직접 부르면 한 행에 여러 번 계산된다.
 */
const rows = computed(() =>
  records.value.map((record) => ({
    record,
    name: names.value[record.id] ?? record.handle,
    result: calculatePremium(record),
  })),
);
</script>

<template>
  <main class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <header class="mb-6">
      <p class="text-sm font-medium text-accent">토벌 장부</p>
      <h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">내 장부</h1>
      <p class="mt-1.5 text-sm text-muted">
        정가보다 얼마나 더 썼는지 모아 봅니다. 배송비·수수료는 플미에서 빼고 따로 셉니다.
      </p>
    </header>

    <div
      v-if="!user"
      class="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center"
    >
      <p class="text-lg font-semibold">로그인이 필요합니다</p>
      <p class="mt-2 text-sm text-muted">지출 기록은 계정에 저장됩니다.</p>
      <NuxtLink
        to="/login"
        class="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        로그인하기
      </NuxtLink>
    </div>

    <template v-else>
      <p v-if="loading" class="text-center text-muted">불러오는 중...</p>

      <p
        v-else-if="errorMessage"
        class="rounded-xl border border-premium/40 bg-premium/10 px-4 py-3 text-sm text-premium"
      >
        {{ errorMessage }}
      </p>

      <div
        v-else-if="records.length === 0"
        class="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center"
      >
        <p class="text-lg font-semibold">아직 기록이 없습니다</p>
        <p class="mt-2 text-sm text-muted">
          도감에서 굿즈 카드의 <strong>구매 기록</strong> 을 눌러 남겨 보세요.
        </p>
        <NuxtLink
          to="/dex"
          class="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          도감으로
        </NuxtLink>
      </div>

      <template v-else>
        <!-- 합계 -->
        <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-2xl border border-border-soft bg-surface p-4">
            <p class="text-xs text-muted">총지출</p>
            <p class="mt-1 text-xl font-bold">{{ formatKrw(summary.totalKrw) }}</p>
            <p class="mt-1 text-xs text-muted">{{ summary.count }}건</p>
          </div>

          <div class="rounded-2xl border border-border-soft bg-surface p-4">
            <p class="text-xs text-muted">플미로 더 쓴 돈</p>
            <p
              class="mt-1 text-xl font-bold"
              :class="summary.premiumKrw > 0 ? 'text-premium' : 'text-fair'"
            >
              {{ formatPremium(summary.premiumKrw) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              <template v-if="summary.premiumRate !== null">정가 대비 {{ summary.premiumRate }}%</template>
              <template v-else>계산 가능한 기록 없음</template>
            </p>
          </div>

          <div class="rounded-2xl border border-border-soft bg-surface p-4">
            <p class="text-xs text-muted">배송비</p>
            <p class="mt-1 text-xl font-bold">{{ formatKrw(summary.shippingTotalKrw) }}</p>
          </div>

          <div class="rounded-2xl border border-border-soft bg-surface p-4">
            <p class="text-xs text-muted">수수료</p>
            <p class="mt-1 text-xl font-bold">{{ formatKrw(summary.feeTotalKrw) }}</p>
          </div>
        </section>

        <p v-if="summary.unknownCount > 0" class="mt-3 text-xs text-muted">
          {{ summary.unknownCount }}건은 정가나 환율을 몰라 플미 계산에서 빠졌습니다.
        </p>

        <!-- 기록 목록 -->
        <ul class="mt-6 flex flex-col gap-2">
          <li
            v-for="row in rows"
            :key="row.record.id"
            class="rounded-2xl border border-border-soft bg-surface p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">{{ row.name }}</p>
                <p class="mt-1 text-xs text-muted">
                  {{ row.record.purchasedOn }} · {{ sourceName(row.record.source) }}
                  <template v-if="row.record.quantity > 1"> · {{ row.record.quantity }}개</template>
                </p>
                <p v-if="row.record.memo" class="mt-1 text-xs text-muted">{{ row.record.memo }}</p>
              </div>

              <button
                type="button"
                class="shrink-0 text-xs text-muted transition-colors hover:text-premium"
                @click="remove(row.record.id)"
              >
                삭제
              </button>
            </div>

            <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div class="flex justify-between sm:block">
                <dt class="text-muted">상품값</dt>
                <dd class="font-medium sm:mt-0.5">{{ formatKrw(row.record.itemPriceKrw) }}</dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-muted">정가 환산</dt>
                <dd class="font-medium sm:mt-0.5">
                  {{ row.result.listPriceKrw === null ? '-' : formatKrw(row.result.listPriceKrw) }}
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-muted">플미</dt>
                <dd
                  class="font-semibold sm:mt-0.5"
                  :class="(row.result.premiumKrw ?? 0) > 0 ? 'text-premium' : 'text-fair'"
                >
                  <template v-if="row.result.premiumKrw === null">-</template>
                  <template v-else>
                    {{ formatPremium(row.result.premiumKrw) }} ({{ row.result.premiumRate }}%)
                  </template>
                </dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-muted">총지출</dt>
                <dd class="font-medium sm:mt-0.5">{{ formatKrw(row.result.totalKrw) }}</dd>
              </div>
            </dl>
          </li>
        </ul>
      </template>
    </template>
  </main>
</template>
