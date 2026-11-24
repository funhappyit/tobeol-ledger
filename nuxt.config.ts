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

  routeRules: {
    // 콜백은 주소에 담겨 온 토큰을 브라우저에서 읽어 처리한다. 서버에서 그릴 것이 없다.
    // 모듈이 redirect 옵션을 켰을 때 넣어 주는 설정인데, 우리는 그 옵션을 꺼서 직접 넣는다.
    '/confirm': { ssr: false },

    /**


    '/': { isr: 300 }, 누구에게나 같은 화면만 캐시한다.
     *
     * 굿즈는 하루 한 번 수집해서 바뀌는데, 요청마다 DB 에서 1만 건을 받아오면
     * PostgREST 를 11번 불러야 한다. 5분 캐시를 두면 그 값을 한 번만 치르고,
     * 스토어에 가는 요청 수가 그렇듯 DB 에 가는 요청 수도 방문자 수와 무관해진다.
     *
     * 개인 자료가 실리는 화면(/ledger·/login·/confirm)은 넣지 않는다.
     * 캐시된 HTML 은 모든 방문자에게 그대로 나가기 때문이다.
     * 머리글의 로그인 표시도 같은 이유로 브라우저에서만 그린다(SiteHeader 참고).
     */
    '/': { isr: 300 },
    '/dex': { isr: 300 },
    '/dex/**': { isr: 300 },

    /**
     * /api/dex 에는 캐시를 걸지 않는다.
     *
     * swr 을 걸어 봤더니 엣지 캐시가 경로만으로 키를 만들어, 쿼리가 달라도
     * 처음 캐시된 응답 하나가 모두에게 돌아갔다. 캐릭터 도감이 전체 목록을 받고
     * offset 이 무시돼 앞 120건이 두 번 들어갔다.
     *
     * 캐시가 필요하면 쿼리까지 키에 넣는 방법을 먼저 확인해야 한다.
     */
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
