<script setup lang="ts">
/**
 * 도감 카드 1장
 *
 * 공식몰의 상품 설명은 싣지 않는다. 이름·정가·발매일처럼 도감으로서 필요한 사실만 둔다.
 * 이미지는 우리가 저장하지 않고 공식몰 CDN 을 그대로 참조한다.
 */

import { withImageWidth } from '@lib/items/image';
import { formatCheckedAt, formatJpy, sourceName } from '@lib/items/labels';
import type { DexItem } from '@lib/items/view';
import type { MarkKind } from '~/composables/useMarks';

const props = defineProps<{
  item: DexItem;
  owned: boolean;
  wish: boolean;
  /** 기록을 읽기 전에는 표시를 켜지 않는다 (서버 렌더와 어긋나지 않게) */
  ready: boolean;
  /** 스토어별로 재고를 마지막으로 확인한 시각 */
  stockCheckedAt?: Record<string, string>;
}>();

const emit = defineEmits<{
  toggle: [kind: MarkKind, handle: string];
  record: [item: DexItem];
}>();

const image = computed(() => withImageWidth(props.item.imageUrl, 400));
const name = computed(() => props.item.nameKo ?? props.item.nameJa ?? '이름 없음');
const showOwned = computed(() => props.ready && props.owned);
const showWish = computed(() => props.ready && props.wish);
/** 공식몰 외의 스토어에서 온 굿즈만 출처를 띄운다 */
const store = computed(() => sourceName(props.item.source));

/**
 * 재고 표시.
 *
 * 값이 없으면 아무것도 띄우지 않는다. 포켓 스토어가 그렇다.
 * 모르는 것을 품절로 적으면 없는 사실을 지어내는 것이 된다.
 */
const stock = computed(() => {
  if (props.item.inStock === undefined) {
    return null;
  }

  return props.item.inStock
    ? { label: '토벌 가능', buyable: true }
    : { label: '품절', buyable: false };
});

/**
 * 언제 본 값인지.
 *
 * 수집 주기가 하루(공식몰)에서 한 달(모구모구)까지라 "지금"이라고 말할 수 없다.
 * 품절이라 적혀 있는데 이미 재입고된 경우가 생기므로 기준 시각을 함께 밝힌다.
 */
const stockTitle = computed(() => {
  const when = formatCheckedAt(props.stockCheckedAt?.[props.item.source ?? 'official']);

  if (when === null) {
    return '수집한 시점의 재고예요';
  }

  return `${when}에 확인한 재고예요`;
});

/** 발매일을 카드에 짧게 (2022.07 발매) */
const released = computed(() => {
  const value = props.item.releasedOn;
  if (!value) {
    return null;
  }

  const [year, month] = value.split('-');
  if (!year || !month) {
    return null;
  }

  return `${year}.${month} 발매`;
});
</script>

<template>
  <li
    class="group relative flex flex-col overflow-hidden rounded-2xl border bg-surface transition-shadow hover:shadow-md"
    :class="showOwned ? 'border-accent' : 'border-border-soft'"
  >
    <div class="relative aspect-square bg-white">
      <img
        v-if="image"
        :src="image"
        :alt="name"
        loading="lazy"
        class="h-full w-full object-contain"
      >
      <div v-else class="flex h-full items-center justify-center text-sm text-muted">
        이미지 없음
      </div>

      <!--
        토벌 완료와 토벌 리스트. 이 앱의 주 동작이라 늘 보이게 둔다.
        예전에는 hover 했을 때만 보였는데 휴대폰에는 hover 가 없어서 아예 누를 수 없었다.

        하트는 원래 카드 아래 가격 옆에 있었다. 색이 `border-soft`(테두리용)라
        배경에 묻혀서, 토벌 리스트가 있는 줄도 모르고 지나치게 됐다.
        체크와 같은 꼴로 나란히 세운다.
      -->
      <button
        type="button"
        :aria-pressed="showOwned"
        :aria-label="showOwned ? `${name} 토벌 완료 해제` : `${name} 토벌 완료로 표시`"
        :title="showOwned ? '토벌 완료 해제' : '토벌 완료로 표시'"
        class="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition-colors"
        :class="
          showOwned
            ? 'border-accent bg-accent text-white'
            : 'border-border-soft bg-white/90 text-muted hover:border-accent hover:text-accent'
        "
        @click="emit('toggle', 'owned', item.handle)"
      >
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M5 10.5l3.5 3.5L15 7"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <!--
        토벌 리스트. 오른쪽 아래에 혼자 둔다.
        체크 옆에 나란히 세워 봤더니 같은 원 둘이 붙어 있어 무거웠다.
        네 귀퉁이에 하나씩 놓이면 서로 자리를 다투지 않는다.
      -->
      <button
        type="button"
        :aria-pressed="showWish"
        :aria-label="showWish ? `${name} 토벌 리스트에서 제외` : `${name} 토벌 리스트에 추가`"
        :title="showWish ? '토벌 리스트에서 제외' : '토벌 리스트에 추가(사고 싶은 것)'"
        class="absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition-colors"
        :class="
          showWish
            ? 'border-premium bg-premium text-white'
            : 'border-border-soft bg-white/90 text-muted hover:border-premium hover:text-premium'
        "
        @click="emit('toggle', 'wish', item.handle)"
      >
        <svg
          viewBox="0 0 24 24"
          class="h-4 w-4"
          :fill="showWish ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path
            d="M12 20.5l-1.4-1.3C5.8 15 3 12.4 3 9.2 3 6.7 5 4.8 7.5 4.8c1.4 0 2.8.7 3.6 1.8.8-1.1 2.2-1.8 3.6-1.8C17.2 4.8 19 6.7 19 9.2c0 3.2-2.8 5.8-7.6 10z"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <!--
        왼쪽 위 배지들. 공식몰 굿즈에는 출처를 적지 않는다(대부분이 공식몰이라 소음이 된다).
        포켓 스토어처럼 다른 스토어에서 온 굿즈만 어디서 파는 것인지 밝힌다.
      -->
      <div class="absolute top-2 left-2 flex flex-col items-start gap-1">
        <span
          v-if="store"
          class="rounded-full bg-accent/90 px-2 py-0.5 text-xs font-medium text-white"
        >
          {{ store }}
        </span>
        <!--
          바탕을 고정색으로 둔다. 이 배지는 카드가 아니라 상품 사진 위에 얹히는데,
          테마 토큰(foreground)을 쓰면 다크 모드에서 밝은 색이 되어
          흰 배경 상품 사진 위에 흰 글씨를 올리는 꼴이 된다.
        -->
        <span
          v-if="item.purchaseLimit"
          class="rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white shadow-sm"
        >
          1인 {{ item.purchaseLimit }}개
        </span>
      </div>

      <!--
        재고. 표시가 없으면 "모른다"는 뜻이다(포켓 스토어).
        바탕은 위 배지들과 같은 고정색이다. 상품 사진 위라 테마 토큰을 쓸 자리가 아니다.
      -->
      <span
        v-if="stock"
        :title="stockTitle"
        class="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium shadow-sm"
        :class="stock.buyable ? 'text-white' : 'text-white/60'"
      >
        <span v-if="stock.buyable" class="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        {{ stock.label }}
      </span>
    </div>

    <div class="flex flex-1 flex-col gap-1.5 p-3">
      <h3 class="line-clamp-2 text-sm leading-snug font-semibold">{{ name }}</h3>

      <p v-if="released" class="text-xs text-muted">{{ released }}</p>

      <div class="mt-auto pt-1">
        <p class="text-sm font-bold">{{ formatJpy(item.listPriceJpy) }}</p>
      </div>

      <!--
        토벌 완료로 표시한 것만 기록을 남길 수 있다.
        손에 넣지 않은 굿즈의 지출을 적을 일은 없고,
        1만 건 전부에 버튼을 달면 목록이 시끄러워진다.
      -->
      <button
        v-if="showOwned"
        type="button"
        class="mt-1 w-full rounded-lg border border-border-soft py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
        @click="emit('record', item)"
      >
        구매 기록
      </button>
    </div>
  </li>
</template>
