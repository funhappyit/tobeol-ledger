import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';

/**
 * 수집 파이프라인(src/lib)은 화면 프레임워크와 무관한 코드라 app/ 바깥에 둔다.
 * app 쪽과 서버(nitro) 양쪽에서 같은 경로로 부를 수 있게 별칭을 둘 다 등록한다.
 */
const libPath = fileURLToPath(new URL('./src/lib', import.meta.url));

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxtjs/supabase'],
  compatibilityDate: '2026-11-16',

  supabase: {
    // 도감·홈은 로그인 없이 보는 화면이다.
    // 이 값을 켜 두면(기본값 true) 모든 페이지가 /login 으로 튕긴다.
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: [],
    },
  },
  devtools: { enabled: true },

  alias: { '@lib': libPath },
  nitro: { alias: { '@lib': libPath } },

  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      link: [
        { rel: 'preconnect', href: 'https://cdn.jsdelivr.net', crossorigin: '' },
        {
          rel: 'stylesheet',
          // 한글 본문 폰트. 필요한 글자만 내려받는 동적 서브셋
          href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
        },
      ],
    },
  },
});
