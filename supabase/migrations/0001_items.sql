-- 굿즈 마스터 스키마
--
-- 공식몰에서 수집한 상품 정보를 담는다. 전부 공개 데이터이므로 읽기는 누구나 가능하고,
-- 쓰기는 수집 스크립트(service_role)만 한다. RLS 를 켜 두고 쓰기 정책을 만들지 않으면
-- anon/authenticated 키로는 쓸 수 없고 service_role 만 RLS 를 우회한다.
--
-- 캐릭터·종류 코드의 기준은 src/lib/collect/vocab.ts 다.
-- 아래 seed 는 초기 사용을 위한 사본이며, 어휘가 늘어나면 적재 스크립트가 upsert 한다.

-- ---------------------------------------------------------------------------
-- 분류 마스터
-- ---------------------------------------------------------------------------

create table if not exists characters (
  code        text primary key,
  name_ko     text not null,
  name_ja     text,
  sort_order  integer not null default 0
);

create table if not exists categories (
  code        text primary key,
  name_ko     text not null,
  name_ja     text,
  sort_order  integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 굿즈
-- ---------------------------------------------------------------------------

create table if not exists items (
  id                  uuid primary key default gen_random_uuid(),

  -- 공식몰 식별자. 재수집 시 이 두 값으로 같은 상품을 찾는다
  shopify_product_id  bigint not null unique,
  handle              text   not null unique,
  jan                 text,

  name_ko             text,
  name_ja             text,
  description_ko      text,

  -- 공식몰이 붙인 분류 문자열. 로케일마다 값이 다른 사례가 있어 참고용으로만 둔다.
  -- 실제 종류 판정은 태그 기반인 item_categories 를 쓴다
  product_type_ko     text,
  product_type_ja     text,

  vendor              text,
  list_price_jpy      integer check (list_price_jpy is null or list_price_jpy >= 0),
  image_url           text,
  source_url          text not null,

  -- 태그 원문 전체. 분류 규칙이 바뀌어도 재수집 없이 다시 해석하기 위해 통째로 보관한다
  tags_raw            text[] not null default '{}',
  -- 어휘표에 없어서 분류되지 않은 태그. 어휘표를 보강할 단서로 쓴다
  unmapped_tags       text[] not null default '{}',

  released_on         date,
  preorder_on         date,
  restocked_on        date[] not null default '{}',
  purchase_limit      smallint check (purchase_limit is null or purchase_limit > 0),
  flags               text[] not null default '{}',

  first_seen_at       timestamptz not null default now(),
  last_synced_at      timestamptz not null default now(),
  -- 공식몰 기준 최종 수정 시각. 증분 수집 판단에 쓴다
  source_updated_at   timestamptz,
  -- 공식몰에서 사라진 시점. 기록을 지우지 않고 표시만 한다
  discontinued_at     timestamptz
);

create index if not exists items_released_on_idx on items (released_on desc nulls last);
create index if not exists items_list_price_idx  on items (list_price_jpy);
create index if not exists items_tags_raw_idx    on items using gin (tags_raw);
create index if not exists items_flags_idx       on items using gin (flags);

-- ---------------------------------------------------------------------------
-- 굿즈 <-> 분류 (다대다)
-- ---------------------------------------------------------------------------

create table if not exists item_characters (
  item_id        uuid not null references items (id) on delete cascade,
  character_code text not null references characters (code) on update cascade,
  primary key (item_id, character_code)
);

create index if not exists item_characters_character_idx on item_characters (character_code);

create table if not exists item_categories (
  item_id       uuid not null references items (id) on delete cascade,
  category_code text not null references categories (code) on update cascade,
  primary key (item_id, category_code)
);

create index if not exists item_categories_category_idx on item_categories (category_code);

-- ---------------------------------------------------------------------------
-- 정가 변동 이력
--
-- 구매 기록은 구매 시점 정가를 따로 스냅샷으로 들고 있지만,
-- "정가가 언제 얼마였는지"를 따로 남겨 두면 가격 추이를 보여줄 수 있다.
-- ---------------------------------------------------------------------------

create table if not exists item_price_history (
  id              bigserial primary key,
  item_id         uuid not null references items (id) on delete cascade,
  list_price_jpy  integer not null check (list_price_jpy >= 0),
  observed_on     date not null default current_date,
  unique (item_id, observed_on)
);

create index if not exists item_price_history_item_idx on item_price_history (item_id, observed_on desc);

-- ---------------------------------------------------------------------------
-- RLS — 공개 읽기 전용
-- ---------------------------------------------------------------------------

alter table characters          enable row level security;
alter table categories          enable row level security;
alter table items               enable row level security;
alter table item_characters     enable row level security;
alter table item_categories     enable row level security;
alter table item_price_history  enable row level security;

drop policy if exists public_read on characters;
drop policy if exists public_read on categories;
drop policy if exists public_read on items;
drop policy if exists public_read on item_characters;
drop policy if exists public_read on item_categories;
drop policy if exists public_read on item_price_history;

create policy public_read on characters         for select using (true);
create policy public_read on categories         for select using (true);
create policy public_read on items              for select using (true);
create policy public_read on item_characters    for select using (true);
create policy public_read on item_categories    for select using (true);
create policy public_read on item_price_history for select using (true);

-- 쓰기 정책은 일부러 만들지 않는다. 적재는 service_role 로만 수행한다.

-- ---------------------------------------------------------------------------
-- 초기 분류 seed (src/lib/collect/vocab.ts 와 동일)
-- ---------------------------------------------------------------------------

insert into characters (code, name_ko, name_ja, sort_order) values
  ('chiikawa',  '치이카와',   'ちいかわ',       1),
  ('hachiware', '하치와레',   'ハチワレ',       2),
  ('usagi',     '우사기',     'うさぎ',         3),
  ('momonga',   '모몽가',     'モモンガ',       4),
  ('rakko',     '랏코',       'ラッコ',         5),
  ('kurimanju', '쿠리만쥬',   'くりまんじゅう', 6),
  ('shisa',     '시사',       'シーサー',       7),
  ('furuhonya', '후루혼야',   '古本屋',         8),
  ('anoko',     '아노코',     'あのこ',         9),
  ('yoroisan',  '요로이상',   '鎧さん',        10),
  ('dekatsuyo', '데카츠요',   'でかつよ',      11)
on conflict (code) do update
  set name_ko = excluded.name_ko,
      name_ja = excluded.name_ja,
      sort_order = excluded.sort_order;

insert into categories (code, name_ko, name_ja, sort_order) values
  ('plush',         '인형',        'ぬいぐるみ',        1),
  ('mascot',        '마스코트',    'マスコット',        2),
  ('stationery',    '문구',        '文房具',            3),
  ('memo',          '메모·떡메',   'メモ・ふせん',      4),
  ('sticker',       '스티커',      'ステッカー',        5),
  ('keyholder',     '키홀더',      'キーホルダー',      6),
  ('bag',           '가방',        'バッグ',            7),
  ('towel',         '타월',        'タオル',            8),
  ('hand_towel',    '손수건',      'ハンドタオル',      9),
  ('apparel',       '의류',        'アパレル',         10),
  ('tshirt_hoodie', '티셔츠·후드', 'Tシャツ・パーカー', 11),
  ('socks',         '양말',        '靴下',             12),
  ('kitchen',       '주방',        'キッチン',         13),
  ('goods',         '잡화',        '雑貨',             14),
  ('pc_phone',      'PC·스마트폰', 'PC・スマホグッズ', 15),
  ('amenity',       '어메니티',    'アメニティ',       16)
on conflict (code) do update
  set name_ko = excluded.name_ko,
      name_ja = excluded.name_ja,
      sort_order = excluded.sort_order;
