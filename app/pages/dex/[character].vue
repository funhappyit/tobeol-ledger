<script setup lang="ts">
import { ALL_CHARACTERS, isKnownCharacter } from '@lib/items/dex';

const route = useRoute();
const character = computed(() => String(route.params.character ?? ''));

// 전체는 /dex 가 담당한다. 모르는 캐릭터와 함께 404 로 보낸다
if (character.value === ALL_CHARACTERS || !isKnownCharacter(character.value)) {
  throw createError({ statusCode: 404, statusMessage: '없는 캐릭터입니다', fatal: true });
}
</script>

<template>
  <DexScreen :character="character" />
</template>
