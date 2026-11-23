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
  calculateItem,
  calculatePurchase,
  formatKrw,
  formatPremium,
  sourceName,
  summarize,
  type Purchase,
} from '@lib/ledger/calc';
import type { Database } from '~/types/database.types';

useHead({ title: '내 장부' });

const supabase = useSupabaseClient<Database>();
const user = useSupabaseUser();

const purchases = ref<Purchase[]>([]);
const loading = ref(true);
const errorMessage = ref<string | null>(null);

async function load(): Promise<void> {
  if (!user.value) {
    loading.value = false;
    return;
  }

  loading.value = true;
  errorMessage.value = null;

  // 주문과 담긴 굿즈를 따로 받아 묶는다.
  // 중첩 select 를 쓰면 손으로 적은 타입으로는 결과가 추론되지 않는다.
  const { data: rows, error } = await supabase
    .from('purchases')
    .select('*')
    .order('purchased_on', { ascending: false });

  if (error) {
    loading.value = false;
    errorMessage.value = error.message;
    return;
  }

  const orders = rows ?? [];
  if (orders.length === 0) {
    purchases.value = [];
    loading.value = false;
    return;
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from('purchase_items')
    .select('*')
    .in(
      'purchase_id',
      orders.map((order) => order.id),
    );

  loading.value = false;

  if (itemsError) {
    errorMessage.value = itemsError.message;
    return;
  }

  const byPurchase = new Map<string, Purchase['items']>();
  for (const row of itemRows ?? []) {
    const list = byPurchase.get(row.purchase_id) ?? [];
    list.push({
      handle: row.handle,
      name: row.name_snapshot ?? row.handle,
      quantity: row.quantity,
      itemPriceKrw: row.item_price_krw,
      listPriceJpy: row.list_price_jpy,
    });
    byPurchase.set(row.purchase_id, list);
  }

  purchases.value = orders.map((order) => ({
    id: order.id,
    source: order.source,
    purchasedOn: order.purchased_on,
    shippingKrw: order.shipping_krw,
    feeKrw: order.fee_krw,
    fxRate: order.fx_rate === null ? null : Number(order.fx_rate),
    memo: order.memo,
    items: byPurchase.get(order.id) ?? [],
  }));
}

async function remove(id: string): Promise<void> {
  // purchase_items 는 on delete cascade 라 함께 지워진다
  const { error } = await supabase.from('purchases').delete().eq('id', id);

  if (error) {
    errorMessage.value = error.message;
    return;
  }

  purchases.value = purchases.value.filter((purchase) => purchase.id !== id);
}

watch(user, load, { immediate: true });

const summary = computed(() => summarize(purchases.value));

/** 주문과 계산 결과를 미리 짝지어 둔다. 템플릿에서 매번 계산하지 않도록 */
const rows = computed(() =>
  purchases.value.map((purchase) => ({
    purchase,
    result: calculatePurchase(purchase),
    lines: purchase.items.map((item) => ({
      item,
      result: calculateItem(item, purchase.fxRate),
    })),
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
        v-else-if="purchases.length === 0"
        class="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center"
      >
        <p class="text-lg font-semibold">아직 기록이 없습니다</p>
        <p class="mt-2 text-sm text-muted">
          도감에서 토벌 완료로 체크한 뒤 <strong>구매 기록</strong> 을 눌러 남겨 보세요.
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
            <p class="mt-1 text-xs text-muted">
              {{ summary.purchaseCount }}번 구매 · 굿즈 {{ summary.itemCount }}개
            </p>
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
          굿즈 {{ summary.unknownCount }}개는 정가나 환율을 몰라 플미 계산에서 빠졌습니다.
        </p>

        <!-- 주문 목록 -->
        <ul class="mt-6 flex flex-col gap-3">
          <li
            v-for="row in rows"
            :key="row.purchase.id"
            class="rounded-2xl border border-border-soft bg-surface p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-semibold">
                  {{ row.purchase.purchasedOn }} · {{ sourceName(row.purchase.source) }}
                  <span class="ml-1 font-normal text-muted">굿즈 {{ row.purchase.items.length }}개</span>
                </p>
                <p v-if="row.purchase.memo" class="mt-1 text-xs text-muted">{{ row.purchase.memo }}</p>
              </div>

              <button
                type="button"
                class="shrink-0 text-xs text-muted transition-colors hover:text-premium"
                @click="remove(row.purchase.id)"
              >
                삭제
              </button>
            </div>

            <!-- 담긴 굿즈 -->
            <ul class="mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3">
              <li
                v-for="(line, index) in row.lines"
                :key="`${line.item.handle}-${index}`"
                class="flex items-baseline justify-between gap-3 text-sm"
              >
                <span class="min-w-0 truncate">
                  {{ line.item.name }}
                  <span v-if="line.item.quantity > 1" class="text-xs text-muted">
                    ×{{ line.item.quantity }}
                  </span>
                </span>
                <span class="shrink-0 text-right">
                  {{ formatKrw(line.item.itemPriceKrw) }}
                  <span
                    v-if="line.result.premiumKrw !== null"
                    class="ml-1.5 text-xs"
                    :class="line.result.premiumKrw > 0 ? 'text-premium' : 'text-fair'"
                  >
                    {{ formatPremium(line.result.premiumKrw) }}
                  </span>
                </span>
              </li>
            </ul>

            <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border-soft pt-3 text-xs sm:grid-cols-4">
              <div class="flex justify-between sm:block">
                <dt class="text-muted">상품값</dt>
                <dd class="font-medium sm:mt-0.5">{{ formatKrw(row.result.itemTotalKrw) }}</dd>
              </div>
              <div class="flex justify-between sm:block">
                <dt class="text-muted">배송비·수수료</dt>
                <dd class="font-medium sm:mt-0.5">
                  {{ formatKrw(row.purchase.shippingKrw + row.purchase.feeKrw) }}
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
