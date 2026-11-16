'use client';

/**
 * 상단 메뉴 링크
 *
 * 현재 위치 표시에 usePathname 이 필요한데, 이건 요청 시점에야 알 수 있는 값이다.
 * Next 16 의 cacheComponents 환경에서는 이런 값을 Suspense 밖에서 읽으면 프리렌더가 막힌다.
 * 그래서 링크 자체는 정적으로(NavLinksFallback) 먼저 그리고,
 * 활성 표시만 붙은 쪽(NavLinks)을 Suspense 안에서 이어 그린다.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: '홈' },
  { href: '/dex', label: '도감' },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        active ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
      }`}
    >
      {label}
    </Link>
  );
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV.map((entry) => (
        <NavLink
          key={entry.href}
          href={entry.href}
          label={entry.label}
          // 도감은 하위 경로(/dex/chiikawa)에서도 선택된 상태로 보여야 한다
          active={entry.href === '/' ? pathname === '/' : pathname.startsWith(entry.href)}
        />
      ))}
    </>
  );
}

/** 위치를 알기 전에 그려지는 모양. 활성 표시만 빠져 있고 링크는 똑같이 동작한다 */
export function NavLinksFallback() {
  return (
    <>
      {NAV.map((entry) => (
        <NavLink key={entry.href} href={entry.href} label={entry.label} active={false} />
      ))}
    </>
  );
}
