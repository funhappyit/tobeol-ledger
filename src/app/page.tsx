import { connection } from 'next/server';
import { Suspense } from 'react';

import { getItems, withImageWidth } from '@/lib/items/source';
import { categoryName, characterName, formatDate, formatJpy } from '@/lib/items/labels';

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-medium text-accent">토벌 장부</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">굿즈 도감</h1>
        <p className="mt-3 max-w-2xl text-muted">
          공식몰에서 수집한 치이카와 굿즈입니다. 여기서 토벌 리스트에 담고, 손에 넣은 굿즈의 지출을
          기록하면 정가보다 얼마나 비싸게 샀는지 계산해 줍니다.
        </p>
      </header>

      <Suspense fallback={<LoadingState />}>
        <ItemSection />
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

/**
 * 수집 결과는 요청 시점의 파일 내용이라 미리 만들어 둘 수 없다.
 * Next 16 의 cacheComponents 환경에서는 connection() 으로 요청 시점 렌더링을 선언한다.
 */
async function ItemSection() {
  await connection();

  const { items, currencies } = await getItems();
  const hasWrongCurrency = currencies.some((currency) => currency !== 'JPY');

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-border-soft bg-surface px-3 py-1.5 text-sm">
          수집된 굿즈 <strong className="font-semibold">{items.length.toLocaleString()}</strong>건
        </span>
        {currencies.length > 0 && (
          <span
            className={`rounded-full border px-3 py-1.5 text-sm ${
              hasWrongCurrency
                ? 'border-premium/40 bg-premium/10 text-premium'
                : 'border-fair/40 bg-fair/10 text-fair'
            }`}
          >
            정가 통화 {currencies.join(', ')}
            {hasWrongCurrency ? ' — 엔화가 아닙니다. 다시 수집하세요' : ' 확인됨'}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const image = withImageWidth(item.imageUrl, 400);
            const released = formatDate(item.parsed.releasedOn);

            return (
              <li
                key={item.handle}
                className="overflow-hidden rounded-2xl border border-border-soft bg-surface transition-shadow hover:shadow-md"
              >
                <div className="aspect-square bg-background">
                  {image ? (
                    // 이미지는 저장하지 않고 공식몰 CDN 을 그대로 참조한다
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt={item.nameKo ?? item.nameJa ?? '굿즈 이미지'}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">
                      이미지 없음
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 p-3">
                  {released && <p className="text-xs text-muted">{released} 발매</p>}

                  <h2 className="text-sm leading-snug font-semibold">
                    {item.nameKo ?? item.nameJa ?? '이름 없음'}
                  </h2>

                  {item.nameJa && item.nameKo && (
                    <p className="line-clamp-2 text-xs text-muted">{item.nameJa}</p>
                  )}

                  <p className="text-base font-bold">{formatJpy(item.listPriceJpy)}</p>

                  {(item.parsed.characterCodes.length > 0 ||
                    item.parsed.categoryCodes.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {item.parsed.characterCodes.map((code) => (
                        <span
                          key={code}
                          className="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs text-foreground"
                        >
                          {characterName(code)}
                        </span>
                      ))}
                      {item.parsed.categoryCodes.map((code) => (
                        <span
                          key={code}
                          className="rounded-md border border-border-soft px-1.5 py-0.5 text-xs text-muted"
                        >
                          {categoryName(code)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-10 text-center text-muted">
      굿즈를 불러오는 중...
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border-soft bg-surface p-10 text-center">
      <p className="text-lg font-semibold">아직 수집된 굿즈가 없습니다</p>
      <p className="mt-2 text-sm text-muted">
        아래 명령으로 공식몰에서 굿즈를 받아오면 이 자리에 채워집니다.
      </p>
      <pre className="mt-4 inline-block rounded-lg bg-background px-4 py-2 text-left text-sm">
        npm run collect -- --limit 50
      </pre>
    </div>
  );
}
