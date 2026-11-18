<script setup lang="ts">
/**
 * 가로로 넘기는 칩 줄
 *
 * 종류가 열일곱 가지라 한 줄에 다 안 들어간다.
 * 그냥 overflow-x-auto 로 두면 스크롤바를 감춘 탓에 "뒤에 더 있다"는 것도,
 * 어떻게 넘기는지도 알 수 없다. 마우스로는 가로 스크롤이 어렵기도 하다.
 * 그래서 넘길 수 있는 방향에만 화살표를 띄운다.
 */

const props = withDefaults(
  defineProps<{
    /** 패널이 아니라 페이지 배경 위에 놓인 줄이면 켠다. 화살표 주변 색이 달라진다 */
    onBackground?: boolean;
  }>(),
  { onBackground: false },
);

const arrowClass = computed(() => (props.onBackground ? 'chip-arrow chip-arrow-on-background' : 'chip-arrow'));

const track = ref<HTMLElement | null>(null);
const canLeft = ref(false);
const canRight = ref(false);

function update(): void {
  const el = track.value;
  if (!el) {
    return;
  }

  // 소수점 오차로 화살표가 깜빡이지 않도록 1px 여유를 둔다
  canLeft.value = el.scrollLeft > 1;
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

/** 한 번에 보이는 너비의 80% 만큼 넘긴다. 끝 칩이 살짝 남아야 이어지는 느낌이 난다 */
function page(direction: -1 | 1): void {
  const el = track.value;
  if (!el) {
    return;
  }

  el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
}

onMounted(() => {
  update();
  window.addEventListener('resize', update);
});

onUnmounted(() => {
  window.removeEventListener('resize', update);
});

// 칩 목록이 바뀌면(캐릭터 탭 이동 등) 넘길 수 있는 방향도 달라진다
onUpdated(() => {
  nextTick(update);
});
</script>

<template>
  <div class="relative">
    <div
      ref="track"
      class="no-scrollbar flex gap-1.5 overflow-x-auto scroll-smooth"
      @scroll="update"
    >
      <slot />
    </div>

    <button
      v-if="canLeft"
      type="button"
      aria-label="이전 목록 보기"
      :class="[arrowClass, 'left-0']"
      @click="page(-1)"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M15 5l-7 7 7 7"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <button
      v-if="canRight"
      type="button"
      aria-label="다음 목록 보기"
      :class="[arrowClass, 'right-0']"
      @click="page(1)"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" aria-hidden="true">
        <path
          d="M9 5l7 7-7 7"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
</template>
