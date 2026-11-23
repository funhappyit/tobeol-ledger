<script setup lang="ts">
/**
 * 구매 기록 입력
 *
 * 단위는 "한 번의 구매"다. 굿즈 여러 개를 한 번에 사고 배송비는 한 번 붙기 때문에,
 * 굿즈별 값은 줄마다 받고 배송비·수수료·환율은 주문 전체에 하나만 받는다.
 *
 * 정가와 환율은 "지금" 값을 복사해 저장한다.
 * 참조로 두면 공식몰이 정가를 고치거나 환율이 움직일 때 과거 기록이 흔들린다.
 */

import { SOURCES, calculatePurchase, formatKrw, formatPremium, type SourceCode } from '@lib/ledger/calc';
import type { DexItem } from '@lib/items/view';
import type { FxResponse } from '~~/server/api/fx.get';
import type { Database } from '~/types/database.types';

const props = defineProps<{
  item: DexItem;
  /** 토벌 완료로 표시한 굿즈만 담을 수 있다 */
  ownedHandles: Set<string>;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();

const supabase = useSupabaseClient<Database>();
const user = useSupabaseUser();

/** 주문에 담긴 줄 하나 */
interface Line {
  item: DexItem;
  quantity: number;
  price: number | null;
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const lines = ref<Line[]>([{ item: props.item, quantity: 1, price: null }]);

const source = ref<SourceCode>('danggeun');
const purchasedOn = ref(today());
const shipping = ref<number | null>(null);
const fee = ref<number | null>(null);
const memo = ref('');

/**
 * 화면에는 100엔 기준으로 보여 준다.
 * 국내 은행·포털이 모두 100엔 단위로 고시해서, 1엔당 값(8.443)을 그대로 띄우면
 * 사용자가 자기가 아는 환율과 맞춰 볼 수 없다.
 */
const fxPer100 = ref<number | null>(null);
const fxRate = computed(() => (fxPer100.value === null ? null : fxPer100.value / 100));
const fxDate = ref<string | null>(null);
const fxTouched = ref(false);
const fxLoading = ref(false);

const saving = ref(false);
const errorMessage = ref<string | null>(null);

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

// --- 굿즈 더 담기 ---

const adding = ref(false);
const searchTerm = ref('');
const searchResults = ref<DexItem[]>([]);
const searching = ref(false);

async function runSearch(): Promise<void> {
  const term = searchTerm.value.trim();
  if (term.length === 0) {
    searchResults.value = [];
    return;
  }

  searching.value = true;
  try {
    const result = await $fetch<{ items: DexItem[] }>('/api/items/search', {
      query: { q: term },
    });
    const already = new Set(lines.value.map((line) => line.item.handle));
    // 토벌 완료로 표시한 것만, 이미 담은 것은 빼고
    searchResults.value = result.items.filter(
      (found) => props.ownedHandles.has(found.handle) && !already.has(found.handle),
    );
  } catch {
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

function addLine(item: DexItem): void {
  lines.value.push({ item, quantity: 1, price: null });
  searchTerm.value = '';
  searchResults.value = [];
  adding.value = false;
}

function removeLine(index: number): void {
  lines.value.splice(index, 1);
}

// --- 계산 ---

const preview = computed(() =>
  calculatePurchase({
    id: '',
    source: source.value,
    purchasedOn: purchasedOn.value,
    shippingKrw: shipping.value ?? 0,
    feeKrw: fee.value ?? 0,
    fxRate: fxRate.value,
    memo: null,
    items: lines.value.map((line) => ({
      handle: line.item.handle,
      name: line.item.nameKo ?? line.item.nameJa ?? line.item.handle,
      quantity: line.quantity,
      itemPriceKrw: line.price ?? 0,
      listPriceJpy: line.item.listPriceJpy,
    })),
  }),
);

const canSave = computed(
  () => lines.value.length > 0 && lines.value.every((line) => (line.price ?? 0) > 0) && !saving.value,
);

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

  // 주문을 먼저 만들고 그 아래에 굿즈를 넣는다
  const { data: created, error: purchaseError } = await supabase
    .from('purchases')
    .insert({
      user_id: userId,
      source: source.value,
      purchased_on: purchasedOn.value,
      shipping_krw: Math.round(shipping.value ?? 0),
      fee_krw: Math.round(fee.value ?? 0),
      fx_rate: fxRate.value,
      fx_rate_manual: fxTouched.value,
      memo: memo.value.trim() || null,
    })
    .select('id')
    .single();

  if (purchaseError || !created) {
    saving.value = false;
    errorMessage.value = purchaseError?.message ?? '구매를 저장하지 못했습니다.';
    return;
  }

  const { error: itemsError } = await supabase.from('purchase_items').insert(
    lines.value.map((line) => ({
      purchase_id: created.id,
      handle: line.item.handle,
      name_snapshot: line.item.nameKo ?? line.item.nameJa,
      quantity: line.quantity,
      item_price_krw: Math.round(line.price ?? 0),
      list_price_jpy: line.item.listPriceJpy,
    })),
  );

  saving.value = false;

  if (itemsError) {
    // 굿즈를 못 넣었으면 빈 주문이 남는다. 지워서 반쪽짜리 기록을 남기지 않는다
    await supabase.from('purchases').delete().eq('id', created.id);
    errorMessage.value = itemsError.message;
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
      class="max-h-full w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border-soft bg-surface p-5 sm:rounded-2xl"
    >
      <header class="mb-4">
        <p class="text-xs text-muted">구매 기록</p>
        <h2 class="mt-1 text-lg font-bold">한 번의 구매</h2>
        <p class="mt-1 text-sm text-muted">
          같이 산 굿즈를 모두 담으세요. 배송비는 주문에 한 번만 붙습니다.
        </p>
      </header>

      <!-- 담긴 굿즈 -->
      <ul class="flex flex-col gap-2">
        <li
          v-for="(line, index) in lines"
          :key="line.item.handle"
          class="rounded-xl border border-border-soft bg-background p-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">
                {{ line.item.nameKo ?? line.item.nameJa ?? line.item.handle }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                정가
                <template v-if="line.item.listPriceJpy">
                  {{ line.item.listPriceJpy.toLocaleString() }}엔
                </template>
                <template v-else>모름 — 이 굿즈는 플미를 계산하지 않습니다</template>
              </p>
            </div>

            <button
              v-if="lines.length > 1"
              type="button"
              class="shrink-0 text-xs text-muted transition-colors hover:text-premium"
              @click="removeLine(index)"
            >
              빼기
            </button>
          </div>

          <div class="mt-2 grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">상품값 (원)</span>
              <input
                v-model.number="line.price"
                type="number"
                min="0"
                inputmode="numeric"
                placeholder="배송비 제외"
                class="rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              >
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted">수량</span>
              <input
                v-model.number="line.quantity"
                type="number"
                min="1"
                inputmode="numeric"
                class="rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              >
            </label>
          </div>
        </li>
      </ul>

      <!-- 굿즈 더 담기 -->
      <div class="mt-2">
        <button
          v-if="!adding"
          type="button"
          class="w-full rounded-xl border border-dashed border-border-soft py-2 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
          @click="adding = true"
        >
          + 같이 산 굿즈 추가
        </button>

        <div v-else class="rounded-xl border border-border-soft bg-background p-3">
          <div class="flex gap-2">
            <input
              v-model="searchTerm"
              type="search"
              placeholder="이름으로 찾기"
              class="min-w-0 flex-1 rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              @keyup.enter="runSearch"
            >
            <button
              type="button"
              class="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white"
              @click="runSearch"
            >
              찾기
            </button>
            <button
              type="button"
              class="shrink-0 rounded-lg border border-border-soft px-3 py-2 text-sm text-muted"
              @click="adding = false"
            >
              닫기
            </button>
          </div>

          <p v-if="searching" class="mt-2 text-xs text-muted">찾는 중...</p>
          <p v-else-if="searchTerm && searchResults.length === 0" class="mt-2 text-xs text-muted">
            토벌 완료로 표시한 굿즈 중에는 없습니다. 도감에서 먼저 체크해 주세요.
          </p>

          <ul v-else class="mt-2 flex flex-col gap-1">
            <li v-for="found in searchResults" :key="found.handle">
              <button
                type="button"
                class="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface"
                @click="addLine(found)"
              >
                {{ found.nameKo ?? found.nameJa ?? found.handle }}
                <span v-if="found.listPriceJpy" class="ml-1 text-xs text-muted">
                  {{ found.listPriceJpy.toLocaleString() }}엔
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- 주문 단위 정보 -->
      <div class="mt-4 flex flex-col gap-3 border-t border-border-soft pt-4">
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
            <span class="text-sm font-medium">배송비 (원)</span>
            <input
              v-model.number="shipping"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="주문당 한 번"
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
          <dt class="text-muted">상품값 합계 ({{ lines.length }}개)</dt>
          <dd>{{ formatKrw(preview.itemTotalKrw) }}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted">정가 합계 (원화 환산)</dt>
          <dd>{{ preview.listTotalKrw > 0 ? formatKrw(preview.listTotalKrw) : '계산 불가' }}</dd>
        </div>
        <div class="flex justify-between font-semibold">
          <dt>플미</dt>
          <dd :class="(preview.premiumKrw ?? 0) > 0 ? 'text-premium' : 'text-fair'">
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
