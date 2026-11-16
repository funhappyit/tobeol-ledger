import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '토벌 장부 — 치이카와 굿즈 토벌 기록과 지출 분석',
  description:
    '치이카와(먼작귀) 굿즈를 토벌 리스트에 담고, 손에 넣은 굿즈의 지출을 기록해 정가 대비 얼마나 비싸게 샀는지 보여주는 비공식 팬 서비스.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 한글 본문 폰트. 필요한 글자만 내려받는 동적 서브셋 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
