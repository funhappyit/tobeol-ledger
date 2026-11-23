/**
 * Supabase 스키마 점검
 *
 * 마이그레이션은 사람이 SQL Editor 에서 직접 돌린다. 어디까지 돌렸는지 코드가 알 수 없어서,
 * 적재를 시작하기 전에 필요한 표가 실제로 있는지 확인한다.
 *
 * 읽기 전용이고 키 값은 출력하지 않는다.
 *
 * 사용:
 *   node --import tsx --env-file=.env.local scripts/check-schema.ts
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NUXT_PUBLIC_SUPABASE_URL;
const key = process.env.NUXT_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  console.error('NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_KEY 가 없습니다.');
  console.error('`.env.local` 을 읽도록 --env-file=.env.local 을 붙여 실행했는지 확인해 주세요.');
  process.exit(1);
}

const supabase = createClient(url, key);

/** 마이그레이션 파일별로 만들어지는 표 */
const TABLES: { migration: string; names: string[] }[] = [
  {
    migration: '0001_items.sql',
    names: [
      'characters',
      'categories',
      'items',
      'item_characters',
      'item_categories',
      'item_price_history',
    ],
  },
  { migration: '0002_user_marks.sql', names: ['user_marks'] },
  { migration: '0004_purchases.sql', names: ['purchases', 'purchase_items'] },
];

console.log(`대상: ${new URL(url).host}`);
console.log('');

let missing = 0;

for (const group of TABLES) {
  console.log(`[${group.migration}]`);

  for (const name of group.names) {
    // head 로 보내면 행을 받지 않고 개수만 센다
    const { count, error } = await supabase
      .from(name)
      .select('*', { count: 'exact', head: true });

    if (error) {
      // 표가 없을 때 PostgREST 는 42P01(undefined_table)을 돌려준다
      const reason = error.code === '42P01' ? '표 없음' : `${error.code ?? ''} ${error.message}`;
      console.log(`  ✗ ${name.padEnd(20)} ${reason}`);
      missing += 1;
      continue;
    }

    console.log(`  ✓ ${name.padEnd(20)} ${(count ?? 0).toLocaleString()}행`);
  }

  console.log('');
}

if (missing > 0) {
  console.log(`확인 필요: ${missing}개 표가 없습니다. 해당 마이그레이션을 SQL Editor 에서 실행해 주세요.`);
} else {
  console.log('필요한 표가 모두 있습니다.');
}
