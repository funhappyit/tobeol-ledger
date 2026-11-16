// Nuxt 가 프로젝트 구조에 맞춰 만들어 주는 설정을 그대로 쓴다 (.nuxt/eslint.config.mjs)
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt({
  ignores: ['data/**', 'supabase/**'],
});
