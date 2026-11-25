/**
 * Supabase 에서 굿즈 읽기
 *
 * 배포 환경에서는 수집본 파일을 둘 곳이 없다(Vercel 파일시스템은 읽기 전용).
 * 수집은 GitHub Actions 가 하고 결과는 DB 에 들어가므로, 화면은 이쪽에서 읽는다.
 *
 * 클라이언트를 인자로 받는 이유는 이 파일이 Nuxt 를 모르게 하기 위해서다.
 * 키를 어디서 가져올지는 부르는 쪽(server/utils/items.ts)이 정한다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CollectedItem, ItemSource } from '../collect/types';
import { mergeItems, type ItemListResult } from './sort';

/**
 * 한 번에 받을 행 수.
 * PostgREST 는 응답 행 수에 상한이 있어(Supabase 기본 1000) 나눠 받아야 한다.
 */
const PAGE_SIZE = 1000;

/**
 * 받아올 컬럼.
 *
 * 도감이 쓰지 않는 것은 일부러 뺐다. 특히 description_ko 는 한 건에 수백 바이트라
 * 1만 건이면 그것만으로 응답이 몇 MB 늘어나는데 화면에 띄우지 않는 값이다.
 * jan·vendor·product_type 도 같은 이유로 제외한다.
 */
const COLUMNS = [
  'source',
  'shopify_product_id',
  'handle',
  'name_ko',
  'name_ja',
  'list_price_jpy',
  'image_url',
  'source_url',
  'in_stock',
  'tags_raw',
  'released_on',
  'preorder_on',
  'restocked_on',
  'purchase_limit',
  'flags',
  'source_updated_at',
  'last_synced_at',
  'stock_checked_at',
  'item_characters(character_code)',
  'item_categories(category_code)',
].join(', ');

/**
 * 적재되는 정가는 전부 엔화다.
 * 적재 스크립트가 다른 통화를 막기 때문에 DB 에는 통화 컬럼을 두지 않았다.
 */
const CURRENCY = 'JPY';

/** 받아온 한 행의 모양 */
interface ItemRow {
  source: string | null;
  shopify_product_id: number | null;
  handle: string;
  name_ko: string | null;
  name_ja: string | null;
  list_price_jpy: number | null;
  image_url: string | null;
  source_url: string;
  in_stock: boolean | null;
  tags_raw: string[] | null;
  released_on: string | null;
  preorder_on: string | null;
  restocked_on: string[] | null;
  purchase_limit: number | null;
  flags: string[] | null;
  source_updated_at: string | null;
  last_synced_at: string | null;
  stock_checked_at: string | null;
  item_characters: { character_code: string }[] | null;
  item_categories: { category_code: string }[] | null;
}

/**
 * DB 행을 수집 레코드 모양으로 되돌린다.
 *
 * 받아오지 않은 컬럼은 null 로 둔다. 화면이 쓰지 않는 값이고,
 * 원본이 필요하면 수집본 파일이나 DB 를 직접 보면 된다.
 */
/**
 * DB 의 source 문자열을 출처로 바꾼다.
 *
 * 모르는 값은 'official' 로 둔다. 적재 쪽(0006 마이그레이션)의 체크 제약이
 * 값을 제한하고 있지만, 스토어가 새로 늘어난 뒤 배포 순서가 어긋나면
 * 읽는 쪽이 모르는 값을 만날 수 있다. 그때 목록이 비는 것보다 낫다.
 */
const KNOWN_SOURCES: ItemSource[] = ['official', 'pocket', 'mogumogu'];

function toSource(value: string | null): ItemSource {
  const found = KNOWN_SOURCES.find((source) => source === value);
  return found ?? 'official';
}

/**
 * 재고를 마지막으로 확인한 시각.
 *
 * 두 가지 수집이 재고를 본다.
 *   전체 수집   — 이름·가격까지 다시 받는다. last_synced_at 에 찍힌다
 *   재고 스윕   — 재고만 다시 본다. stock_checked_at 에 찍힌다 (0008 마이그레이션)
 *
 * 둘 중 늦은 쪽이 답이다. 재고 스윕이 아직 한 번도 돌지 않은 행은
 * stock_checked_at 이 null 이라 전체 수집 시각이 그대로 쓰인다.
 *
 * 문자열 비교로 고르지 않는다. PostgREST 가 돌려주는 시각의 오프셋이
 * 늘 같다는 보장이 없고(`+00:00` / `+09:00`), 다르면 글자 순서가 시간 순서와 어긋난다.
 */
export function pickStockCheckedAt(
  stockCheckedAt: string | null,
  lastSyncedAt: string | null,
): string {
  const candidates = [stockCheckedAt, lastSyncedAt].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  if (candidates.length === 0) {
    return '';
  }

  let best = '';
  let bestAt = -Infinity;

  for (const value of candidates) {
    const at = Date.parse(value);

    // 읽을 수 없는 값이면 건너뛴다. 없는 시각을 지어내지 않는다
    if (!Number.isFinite(at)) {
      continue;
    }

    if (at > bestAt) {
      best = value;
      bestAt = at;
    }
  }

  return best;
}

function toCollectedItem(row: ItemRow): CollectedItem {
  return {
    source: toSource(row.source),
    shopifyProductId: row.shopify_product_id,
    handle: row.handle,
    jan: null,
    nameKo: row.name_ko,
    nameJa: row.name_ja,
    descriptionKo: null,
    productTypeKo: null,
    productTypeJa: null,
    vendor: null,
    listPriceJpy: row.list_price_jpy,
    listPriceCurrency: row.list_price_jpy === null ? null : CURRENCY,
    imageUrl: row.image_url,
    sourceUrl: row.source_url,
    // 아직 확인하지 않은 굿즈도 null 이다. 품절과 섞지 않는다
    inStock: row.in_stock ?? null,
    tagsRaw: row.tags_raw ?? [],
    parsed: {
      releasedOn: row.released_on,
      restockedOn: row.restocked_on ?? [],
      preorderOn: row.preorder_on,
      characterCodes: (row.item_characters ?? []).map((entry) => entry.character_code),
      categoryCodes: (row.item_categories ?? []).map((entry) => entry.category_code),
      purchaseLimit: row.purchase_limit,
      flags: row.flags ?? [],
      // 분류되지 않은 태그는 어휘표를 보강할 때 쓰는 값이라 화면용으로는 받지 않는다
      rest: [],
    },
    updatedAt: row.source_updated_at ?? row.last_synced_at ?? '',
    // 카드의 "11/25 10시에 확인한 재고예요" 가 가리키는 시각이다
    collectedAt: pickStockCheckedAt(row.stock_checked_at, row.last_synced_at),
  };
}

/**
 * 굿즈 전량을 받아온다.
 *
 * handle 순으로 고정해 두고 나눠 받는다. 순서를 정하지 않으면 페이지 사이에서
 * 같은 행이 두 번 오거나 빠질 수 있다.
 */
export async function getItemsFromDb(client: SupabaseClient): Promise<ItemListResult> {
  const rows: ItemRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('items')
      .select(COLUMNS)
      .order('handle', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`굿즈를 불러오지 못했습니다: ${error.message}`);
    }

    const page = (data ?? []) as unknown as ItemRow[];
    rows.push(...page);

    // 받은 행이 한 페이지에 못 미치면 마지막 페이지다
    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return mergeItems([rows.map(toCollectedItem)]);
}
