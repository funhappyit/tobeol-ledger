/**
 * 도감 화면 틀
 *
 * `/dex` 와 `/dex/{캐릭터}` 가 같은 화면을 쓰므로 한곳에 모아 둔다.
 * 굿즈 목록은 요청 시점의 수집 파일을 읽기 때문에 미리 만들어 둘 수 없다.
 * Next 16 의 cacheComponents 환경에서는 connection() 으로 요청 시점 렌더링임을 알린다.
 */

import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { ALL_CHARACTERS, characterTitle, countByCharacter, dexTabs, filterByCharacter } from '@/lib/items/dex';
import { getItems } from '@/lib/items/source';
import { DexBoard } from './DexBoard';

interface Props {
  character: string;
}

export function DexScreen({ character }: Props) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-sm font-medium text-accent">토벌 장부</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {character === ALL_CHARACTERS ? '굿즈 도감' : `${characterTitle(character)} 도감`}
        </h1>
      </header>

      <Suspense fallback={<LoadingState />}>
        <DexContent character={character} />
      </Suspense>

      <footer className="mt-12 border-t border-border-soft pt-6 text-xs text-muted">
        <p>
          비공식 개인 프로젝트입니다. 모든 캐릭터·이미지의 저작권은 원작자 ナガノ(Nagano) 및 정식
          라이선시에게 있습니다.
        </p>
      </footer>
    </main>
  );
}

async function DexContent({ character }: Props) {
  await connection();

  const { items, currencies } = await getItems();
  const counts = countByCharacter(items);
  const scoped = filterByCharacter(items, character);
  const hasWrongCurrency = currencies.some((currency) => currency !== 'JPY');

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {hasWrongCurrency && (
        <p className="mb-5 rounded-xl border border-premium/40 bg-premium/10 px-4 py-3 text-sm text-premium">
          정가가 엔화가 아닌 통화({currencies.join(', ')})로 수집됐습니다. 다시 수집해 주세요.
        </p>
      )}

      <nav className="mb-6 flex flex-wrap gap-1.5 border-b border-border-soft pb-4">
        {dexTabs().map((tab) => {
          const count = counts.get(tab.code) ?? 0;
          const active = tab.code === character;

          return (
            <Link
              key={tab.code}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                active
                  ? 'border-accent bg-accent text-white'
                  : 'border-border-soft bg-surface text-muted hover:text-foreground'
              }`}
            >
              {tab.nameKo}
              <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-muted'}`}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      <DexBoard items={scoped} />
    </>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-10 text-center text-muted">
      도감을 불러오는 중...
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center">
      <p className="text-lg font-semibold">아직 수집된 굿즈가 없습니다</p>
      <p className="mt-2 text-sm text-muted">
        Git Bash 에서 아래 명령을 실행하면 공식몰에서 굿즈를 받아옵니다.
      </p>
      <pre className="mt-4 inline-block rounded-lg bg-background px-4 py-2 text-left text-sm">
        npx tsx scripts/collect-items.ts --limit 50
      </pre>
    </div>
  );
}
