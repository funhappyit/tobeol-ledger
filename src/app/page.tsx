import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { countByCharacter, dexTabs } from '@/lib/items/dex';
import { getItems } from '@/lib/items/source';

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <header>
        <p className="text-sm font-medium text-accent">비공식 치이카와 굿즈 장부</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">토벌 장부</h1>
        <p className="mt-4 max-w-xl text-muted">
          굿즈를 토벌 리스트에 담고, 손에 넣은 굿즈의 지출을 기록하면 정가보다 얼마나 비싸게 샀는지
          계산해 줍니다.
        </p>

        <Link
          href="/dex"
          className="mt-6 inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          도감 보러 가기
        </Link>
      </header>

      <Suspense fallback={null}>
        <CharacterShortcuts />
      </Suspense>

      <footer className="mt-16 border-t border-border-soft pt-6 text-xs text-muted">
        <p>
          비공식 개인 프로젝트입니다. 모든 캐릭터·이미지의 저작권은 원작자 ナガノ(Nagano) 및 정식
          라이선시에게 있습니다.
        </p>
      </footer>
    </main>
  );
}

/** 캐릭터별 바로가기. 수집된 굿즈가 있는 캐릭터만 띄운다 */
async function CharacterShortcuts() {
  await connection();

  const { items } = await getItems();
  if (items.length === 0) {
    return null;
  }

  const counts = countByCharacter(items);
  const tabs = dexTabs().filter((tab) => (counts.get(tab.code) ?? 0) > 0);

  return (
    <section className="mt-12">
      <h2 className="text-sm font-semibold text-muted">캐릭터별로 보기</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.code}
            href={tab.href}
            className="rounded-full border border-border-soft bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
          >
            {tab.nameKo}
            <span className="ml-1.5 text-xs text-muted">{counts.get(tab.code)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
