'use client';

/**
 * 도감 카드 1장
 *
 * 공식몰의 상품 설명은 싣지 않는다. 이름·정가·발매일처럼 도감으로서 필요한 사실만 둔다.
 * 이미지는 우리가 저장하지 않고 공식몰 CDN 을 그대로 참조한다.
 */

import type { CollectedItem } from '@/lib/collect/types';
import type { MarkKind } from '@/lib/collection/marks';
import { formatJpy } from '@/lib/items/labels';
import { withImageWidth } from '@/lib/items/image';

interface Props {
  item: CollectedItem;
  owned: boolean;
  wish: boolean;
  /** 기록을 읽기 전에는 표시를 켜지 않는다 (서버 렌더와 어긋나지 않게) */
  ready: boolean;
  onToggle: (kind: MarkKind, handle: string) => void;
}

/** 발매일을 카드에 짧게 (2022.07 발매) */
function shortReleased(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [year, month] = value.split('-');
  if (!year || !month) {
    return null;
  }

  return `${year}.${month} 발매`;
}

export function ItemCard({ item, owned, wish, ready, onToggle }: Props) {
  const image = withImageWidth(item.imageUrl, 400);
  const name = item.nameKo ?? item.nameJa ?? '이름 없음';
  const released = shortReleased(item.parsed.releasedOn);
  const showOwned = ready && owned;
  const showWish = ready && wish;

  return (
    <li
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-surface transition-shadow hover:shadow-md ${
        showOwned ? 'border-accent' : 'border-border-soft'
      }`}
    >
      <div className="relative aspect-square bg-white">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={name}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            이미지 없음
          </div>
        )}

        <button
          type="button"
          onClick={() => onToggle('owned', item.handle)}
          aria-pressed={showOwned}
          aria-label={showOwned ? `${name} 토벌 완료 해제` : `${name} 토벌 완료로 표시`}
          className={`absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
            showOwned
              ? 'border-accent bg-accent text-white'
              : 'border-border-soft bg-white/90 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <CheckIcon />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{name}</h3>

        {released && <p className="text-xs text-muted">{released}</p>}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <p className="text-sm font-bold">{formatJpy(item.listPriceJpy)}</p>

          <button
            type="button"
            onClick={() => onToggle('wish', item.handle)}
            aria-pressed={showWish}
            aria-label={showWish ? `${name} 토벌 리스트에서 제외` : `${name} 토벌 리스트에 추가`}
            className={`transition-colors ${
              showWish ? 'text-premium' : 'text-border-soft hover:text-muted'
            }`}
          >
            <HeartIcon filled={showWish} />
          </button>
        </div>
      </div>
    </li>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M5 10.5l3.5 3.5L15 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M12 20.5l-1.4-1.3C5.8 15 3 12.4 3 9.2 3 6.7 5 4.8 7.5 4.8c1.4 0 2.8.7 3.6 1.8.8-1.1 2.2-1.8 3.6-1.8C17.2 4.8 19 6.7 19 9.2c0 3.2-2.8 5.8-7.6 10z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
