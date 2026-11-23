<script setup lang="ts">
/**
 * 구매 기록 입력
 *
 * 굿즈 하나를 얼마에 샀는지 남긴다. 정가와 환율은 "지금" 값을 복사해 저장한다.
 * 참조로 두면 공식몰이 정가를 고치거나 환율이 움직일 때 과거 기록이 흔들린다.
 *
 * 상품값과 배송비·수수료를 나눠 받는 이유:
 * 합쳐 버리면 배대지를 거쳐 정가에 산 것도 "웃돈 줬다"로 보인다.
 */

import { SOURCES, calculatePremium, formatKrw, formatPremium, type SourceCode } from '@lib/ledger/calc';
import type { DexItem } from '@lib/items/view';
import type { FxResponse } from '~~/server/api/fx.get';
import type { Database } from '~/types/database.types';

const props = defineProps<{ item: DexItem }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const supabase = useSupabaseClient<Database>();
const user = useSupabaseUser();

/** 오늘 날짜를 YYYY-MM-DD 로. 시간대 때문에 toISOString 을 쓰면 하루 어긋날 수 있다 */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const source = ref<SourceCode>('danggeun');
const purchasedOn = ref(today());
const quantity = ref(1);
const itemPrice = ref<number | null>(null);
const shipping = ref<number | null>(null);
const fee = ref<number | null>(null);
const memo = ref('');

/**
 * 화면에는 100엔 기준으로 보여 준다.
 * 국내 은행·포털이 모두 100엔 단위로 고시해서, 1엔당 값(8.443)을 그대로 띄우면
 * 사용자가 자기가 아는 환율과 맞춰 볼 수 없다.
 * 계산과 저장은 1엔당 값으로 하므로 들어올 때와 나갈 때만 100 으로 나누고 곱한다.
 */
const fxPer100 = ref<number | null>(null);
const fxRate = computed(() => (fxPer100.value === null ? null : fxPer100.value / 100));
const fxDate = ref<string | null>(null);
const fxTouched = ref(false);
const fxLoading = ref(false);

const saving = ref(false);
const errorMessage = ref<string | null>(null);

/** 구매일이 바뀌면 그 날짜의 환율을 다시 불러온다. 사용자가 직접 고친 뒤에는 건드리지 않는다 */
async function loadRate(): Promise<void> {
  if (fxTouched.value) {
    return;
  }

  fxLoading.value = true;
  try {
    const result = await $fetch<FxResponse>('/api/fx', { query: { date: purchasedOn.value } });
    // 소수점이 길어지면 읽기 어렵다. 100엔 기준에서 둘째 자리면 충분하다
    fxPer100.value = Math.round(result.rate * 100 * 100) / 100;
    fxDate.value = result.date;
  } catch {
    // 환율을 못 받아도 기록은 남길 수 있어야 한다. 직접 입력하게 둔다
    fxPer100.value = null;
    fxDate.value = null;
  } finally {
    fxLoading.value = false;
  }
}

watch(purchasedOn, loadRate);
onMounted(loadRate);

function onFxInput(): void {
  fxTouched.value = true;
}

/** 입력한 값으로 지금 플미가 얼마인지 바로 보여 준다 */
const preview = computed(() =>
  calculatePremium({
    id: '',
    handle: props.item.handle,
    source: source.value,
    purchasedOn: purchasedOn.value,
    quantity: quantity.value,
    itemPriceKrw: itemPrice.value ?? 0,
    shippingKrw: shipping.value ?? 0,
    feeKrw: fee.value ?? 0,
    listPriceJpy: props.item.listPriceJpy,
    fxRate: fxRate.value,
    memo: null,
  }),
);

const canSave = computed(() => (itemPrice.value ?? 0) > 0 && !saving.value);

async function save(): Promise<void> {
  const userId = user.value?.id;
  if (!userId) {
    errorMessage.value = '로그인이 필요합니다.';
    return;
  }
  if (!canSave.value) {
    return;
  }

  saving.value = true;
  errorMessage.value = null;

  const { error } = await supabase.from('acquisitions').insert({
    user_id: userId,
    handle: props.item.handle,
    name_snapshot: props.item.nameKo ?? props.item.nameJa,
    source: source.value,
    purchased_on: purchasedOn.value,
    quantity: quantity.value,
    item_price_krw: Math.round(itemPrice.value ?? 0),
    shipping_krw: Math.round(shipping.value ?? 0),
    fee_krw: Math.round(fee.value ?? 0),
    list_price_jpy: props.item.listPriceJpy,
    fx_rate: fxRate.value,
    fx_rate_manual: fxTouched.value,
    memo: memo.value.trim() || null,
  });

  saving.value = false;

  if (error) {
    errorMessage.value = error.message;
    return;
  }

  emit('saved');
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    @click.self="emit('close')"
  >
    <div
      class="max-h-full w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border-soft bg-surface p-5 sm:rounded-2xl"
    >
      <header class="mb-4">
        <p class="text-xs text-muted">구매 기록</p>
        <h2 class="mt-1 text-lg leading-snug font-bold">
          {{ item.nameKo ?? item.nameJa ?? item.handle }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          정가
          <template v-if="item.listPriceJpy">{{ item.listPriceJpy.toLocaleString() }}엔</template>
          <template v-else>모름 — 플미를 계산할 수 없습니다</template>
        </p>
      </header>

      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">구매처</span>
            <select
              v-model="source"
              class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option v-for="(label, code) in SOURCES" :key="code" :value="code">{{ label }}</option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">구매일</span>
            <input
              v-model="purchasedOn"
              type="date"
              class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
          </label>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">상품값 (원)</span>
            <input
              v-model.number="itemPrice"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="배송비 제외"
              class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">수량</span>
            <input
              v-model.number="quantity"
              type="number"
              min="1"
              inputmode="numeric"
              class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
          </label>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">배송비 (원)</span>
            <input
              v-model.number="shipping"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="0"
              class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">수수료 (원)</span>
            <input
              v-model.number="fee"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="대행·결제 수수료"
              class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            >
          </label>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">
            환율 (100엔당 원)
            <span v-if="fxLoading" class="ml-1 text-xs font-normal text-muted">불러오는 중...</span>
            <span v-else-if="fxDate && !fxTouched" class="ml-1 text-xs font-normal text-muted">
              {{ fxDate }} 고시 기준
            </span>
            <span v-else-if="fxTouched" class="ml-1 text-xs font-normal text-accent">직접 입력함</span>
          </span>
          <input
            v-model.number="fxPer100"
            type="number"
            step="0.01"
            min="0"
            inputmode="decimal"
            class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            @input="onFxInput"
          >
          <span class="text-xs text-muted">
            은행 앱에 뜨는 100엔 기준 숫자를 그대로 넣으시면 됩니다. 고시 환율이라 카드·대행
            결제에 실제 적용된 값과는 차이가 납니다.
          </span>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">메모</span>
          <input
            v-model="memo"
            type="text"
            placeholder="선택"
            class="rounded-xl border border-border-soft bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          >
        </label>
      </div>

      <!-- 입력하는 동안 플미가 어떻게 되는지 바로 보여 준다 -->
      <dl class="mt-5 flex flex-col gap-2 rounded-xl border border-border-soft bg-background p-4 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted">정가 (원화 환산)</dt>
          <dd>{{ preview.listPriceKrw === null ? '계산 불가' : formatKrw(preview.listPriceKrw) }}</dd>
        </div>
        <div class="flex justify-between font-semibold">
          <dt>플미</dt>
          <dd :class="preview.premiumKrw !== null && preview.premiumKrw > 0 ? 'text-premium' : 'text-fair'">
            <template v-if="preview.premiumKrw === null">-</template>
            <template v-else>
              {{ formatPremium(preview.premiumKrw) }}
              <span class="ml-1 text-xs font-normal">({{ preview.premiumRate }}%)</span>
            </template>
          </dd>
        </div>
        <div class="flex justify-between border-t border-border-soft pt-2">
          <dt class="text-muted">총지출 (배송비·수수료 포함)</dt>
          <dd class="font-semibold">{{ formatKrw(preview.totalKrw) }}</dd>
        </div>
      </dl>

      <p v-if="errorMessage" class="mt-3 rounded-xl border border-premium/40 bg-premium/10 px-4 py-3 text-sm text-premium">
        {{ errorMessage }}
      </p>

      <div class="mt-5 flex gap-2">
        <button
          type="button"
          :disabled="!canSave"
          class="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          @click="save"
        >
          {{ saving ? '저장 중...' : '기록 저장' }}
        </button>
        <button
          type="button"
          class="rounded-xl border border-border-soft px-4 py-2.5 text-sm transition-colors hover:border-accent"
          @click="emit('close')"
        >
          취소
        </button>
      </div>
    </div>
  </div>
</template>
