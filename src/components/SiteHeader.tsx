/**
 * 상단 내비게이션
 *
 * 껍데기는 정적이고, 현재 위치 표시만 Suspense 안에서 이어 그린다.
 * (이유는 NavLinks.tsx 주석 참고)
 */

import Link from 'next/link';
import { Suspense } from 'react';

import { NavLinks, NavLinksFallback } from './NavLinks';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border-soft bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-bold tracking-tight">
          토벌 장부
        </Link>

        <nav className="flex items-center gap-1">
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
