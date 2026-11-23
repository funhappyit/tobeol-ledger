-- 굿즈 출처 구분
--
-- 공식몰(치이카와 마켓) 외에 포켓 굿즈 스토어에서도 굿즈를 수집하게 되면서
-- 0001 의 전제가 두 군데 어긋난다.
--
--   1. shopify_product_id 가 not null 이다.
--      포켓 스토어는 상품 페이지에 Shopify 상품 id 를 노출하지 않는다.
--      식별은 handle 로 한다(그쪽은 32자 16진수, 공식몰은 JAN 코드라 형식이 겹치지 않는다).
--      unique 제약은 그대로 둔다. Postgres 에서 null 끼리는 서로 다른 값으로 보므로
--      id 가 없는 굿즈가 여러 건이어도 충돌하지 않는다.
--
--   2. 종류 코드가 공식몰 태그 기준으로만 들어 있다.
--      포켓 스토어는 태그를 제공하지 않아 상품명에서 종류를 판정하는데,
--      거기서 나오는 코드 일부가 seed 에 없다.
--
-- 이 파일은 0001 이 이미 실행된 것을 전제로 한다.

-- ---------------------------------------------------------------------------
-- 1. 상품 id 를 선택 항목으로
-- ---------------------------------------------------------------------------

alter table items alter column shopify_product_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. 출처
-- ---------------------------------------------------------------------------

alter table items add column if not exists source text not null default 'official';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'items_source_check'
  ) then
    alter table items add constraint items_source_check
      check (source in ('official', 'pocket'));
  end if;
end $$;

comment on column items.source is '수집한 스토어. official = 치이카와 마켓, pocket = 포켓 굿즈 스토어';

-- 도감은 출처로 거를 수 있어야 하고, 적재도 출처 단위로 돈다
create index if not exists items_source_idx on items (source);

-- ---------------------------------------------------------------------------
-- 3. 종류 코드 보강
--
-- 상품명에서만 나오는 품목어의 코드다. 기준은 src/lib/collect/vocab.ts 의
-- CATEGORY_NAME_KEYWORDS 이며, 공식몰 태그 기준인 CATEGORY_TAGS 와 합쳐 쓴다.
-- ---------------------------------------------------------------------------

insert into categories (code, name_ko, name_ja, sort_order) values
  ('clear_file',    '클리어파일',   'クリアファイル',   17),
  ('acrylic_stand', '아크릴 스탠드', 'アクリルスタンド', 18),
  ('can_badge',     '캔뱃지',       '缶バッジ',         19),
  ('pouch',         '파우치',       'ポーチ',           20),
  ('charm',         '참·장식',      'チャーム',         21),
  ('case',          '케이스',       'ケース',           22)
on conflict (code) do update
  set name_ko = excluded.name_ko,
      name_ja = excluded.name_ja,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 4. 적재 함수
--
-- 굿즈 한 건은 items 1행 + 분류 몇 행 + 가격 이력 0~1행으로 흩어진다.
-- 이것을 클라이언트에서 표별로 나눠 보내면 1만 건에 수만 번 요청이 되고,
-- 중간에 끊기면 굿즈는 들어갔는데 분류는 안 들어간 상태로 남는다.
-- 배치를 통째로 넘기면 한 번의 트랜잭션으로 끝나고, 요청 수도 배치 수만큼으로 줄어든다.
--
-- 분류 교체를 CTE 가 아니라 PL/pgSQL 문으로 나눠 쓴 이유:
-- 같은 문 안의 data-modifying CTE 들은 같은 스냅샷을 보기 때문에
-- delete 가 지운 행을 insert 가 보지 못하고 on conflict 로 건너뛰어 행이 사라질 수 있다.
-- 문을 나누면 앞 문의 결과를 뒤 문이 본다.
--
-- 어휘표에 없는 분류 코드는 넣지 않고 이름만 돌려준다.
-- 수집 쪽 어휘가 먼저 늘어나도 적재가 외래키 위반으로 멈추지 않게 하려는 것이다.
-- ---------------------------------------------------------------------------

create or replace function load_items(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  touched          uuid[];
  unknown_chars    text[];
  unknown_cats     text[];
  price_rows       integer;
begin
  drop table if exists _load_in;

  create temp table _load_in on commit drop as
  select * from jsonb_to_recordset(payload) as p(
    source              text,
    shopify_product_id  bigint,
    handle              text,
    jan                 text,
    name_ko             text,
    name_ja             text,
    description_ko      text,
    product_type_ko     text,
    product_type_ja     text,
    vendor              text,
    list_price_jpy      integer,
    image_url           text,
    source_url          text,
    released_on         date,
    preorder_on         date,
    purchase_limit      smallint,
    source_updated_at   timestamptz,
    -- 배열은 jsonb 로 받는다. jsonb_to_recordset 은 JSON 배열을 text[] 로 바로 넣지 못한다
    tags_raw            jsonb,
    unmapped_tags       jsonb,
    restocked_on        jsonb,
    flags               jsonb,
    character_codes     jsonb,
    category_codes      jsonb
  );

  -- 굿즈 본체
  with up as (
    insert into items (
      source, shopify_product_id, handle, jan,
      name_ko, name_ja, description_ko,
      product_type_ko, product_type_ja, vendor,
      list_price_jpy, image_url, source_url,
      tags_raw, unmapped_tags,
      released_on, preorder_on, restocked_on,
      purchase_limit, flags,
      source_updated_at, last_synced_at, discontinued_at
    )
    select
      i.source, i.shopify_product_id, i.handle, i.jan,
      i.name_ko, i.name_ja, i.description_ko,
      i.product_type_ko, i.product_type_ja, i.vendor,
      i.list_price_jpy, i.image_url, i.source_url,
      coalesce(array(select jsonb_array_elements_text(i.tags_raw)), '{}'),
      coalesce(array(select jsonb_array_elements_text(i.unmapped_tags)), '{}'),
      i.released_on, i.preorder_on,
      coalesce(array(select jsonb_array_elements_text(i.restocked_on)::date), '{}'),
      i.purchase_limit,
      coalesce(array(select jsonb_array_elements_text(i.flags)), '{}'),
      i.source_updated_at, now(), null
    from _load_in i
    on conflict (handle) do update set
      source             = excluded.source,
      shopify_product_id = excluded.shopify_product_id,
      jan                = excluded.jan,
      name_ko            = excluded.name_ko,
      name_ja            = excluded.name_ja,
      description_ko     = excluded.description_ko,
      product_type_ko    = excluded.product_type_ko,
      product_type_ja    = excluded.product_type_ja,
      vendor             = excluded.vendor,
      list_price_jpy     = excluded.list_price_jpy,
      image_url          = excluded.image_url,
      source_url         = excluded.source_url,
      tags_raw           = excluded.tags_raw,
      unmapped_tags      = excluded.unmapped_tags,
      released_on        = excluded.released_on,
      preorder_on        = excluded.preorder_on,
      restocked_on       = excluded.restocked_on,
      purchase_limit     = excluded.purchase_limit,
      flags              = excluded.flags,
      source_updated_at  = excluded.source_updated_at,
      last_synced_at     = now(),
      -- 다시 보였으므로 사라짐 표시를 거둔다
      discontinued_at    = null
    returning id
  )
  select coalesce(array_agg(id), '{}') into touched from up;

  -- 캐릭터
  delete from item_characters where item_id = any(touched);

  insert into item_characters (item_id, character_code)
  select it.id, c.code
  from _load_in i
  join items it on it.handle = i.handle
  cross join lateral jsonb_array_elements_text(i.character_codes) as c(code)
  where exists (select 1 from characters ch where ch.code = c.code)
  on conflict do nothing;

  select coalesce(array_agg(distinct c.code), '{}') into unknown_chars
  from _load_in i
  cross join lateral jsonb_array_elements_text(i.character_codes) as c(code)
  where not exists (select 1 from characters ch where ch.code = c.code);

  -- 종류
  delete from item_categories where item_id = any(touched);

  insert into item_categories (item_id, category_code)
  select it.id, c.code
  from _load_in i
  join items it on it.handle = i.handle
  cross join lateral jsonb_array_elements_text(i.category_codes) as c(code)
  where exists (select 1 from categories ca where ca.code = c.code)
  on conflict do nothing;

  select coalesce(array_agg(distinct c.code), '{}') into unknown_cats
  from _load_in i
  cross join lateral jsonb_array_elements_text(i.category_codes) as c(code)
  where not exists (select 1 from categories ca where ca.code = c.code);

  -- 정가 이력. 직전 기록과 값이 다를 때만 남긴다.
  -- 매번 남기면 하루 1만 행씩 쌓여 1년에 400만 행이 된다
  with latest as (
    select distinct on (item_id) item_id, list_price_jpy
    from item_price_history
    where item_id = any(touched)
    order by item_id, observed_on desc
  )
  insert into item_price_history (item_id, list_price_jpy)
  select it.id, it.list_price_jpy
  from items it
  left join latest l on l.item_id = it.id
  where it.id = any(touched)
    and it.list_price_jpy is not null
    and (l.item_id is null or l.list_price_jpy <> it.list_price_jpy)
  on conflict (item_id, observed_on) do nothing;

  get diagnostics price_rows = row_count;

  return jsonb_build_object(
    'touched', coalesce(array_length(touched, 1), 0),
    'price_rows', price_rows,
    'unknown_characters', to_jsonb(unknown_chars),
    'unknown_categories', to_jsonb(unknown_cats)
  );
end;
$$;

-- 적재는 service_role 로만 한다. 공개 키로는 부를 수 없게 막는다
revoke execute on function load_items(jsonb) from public;
revoke execute on function load_items(jsonb) from anon;
revoke execute on function load_items(jsonb) from authenticated;

comment on function load_items(jsonb) is
  '수집 배치를 굿즈·분류·정가 이력에 한 트랜잭션으로 적재한다. service_role 전용.';
