-- 재고 여부 보관
--
-- Shopify 상품 JSON 의 variants[].available 을 모아 둔다. 이미 받아 오는 응답 안의
-- 값이라 스토어에 가는 요청은 늘지 않는다.
--
-- null 은 품절이 아니라 "알 수 없음"이다. 포켓 스토어가 그렇다.
-- 그쪽은 상품 페이지의 구조화 데이터에 재고 표시가 없고, 재고를 그리는 /api/ 는
-- robots.txt 가 막고 있다. 모르는 것을 품절로 적으면 거짓이 된다.
--
-- 언제 본 값인지는 기존 last_synced_at 이 말해 준다. 수집 주기가 스토어마다 달라
-- (공식몰 하루, 포켓 한 주, 모구모구 한 달) 이 열만으로 "지금"을 말할 수는 없다.
--
-- 이 파일은 0005·0006 이 이미 실행된 것을 전제로 한다.

-- ---------------------------------------------------------------------------
-- 1. 열 추가
--
-- 기본값을 두지 않는다. 아직 확인하지 않은 굿즈와 품절인 굿즈는 다른 상태다.
-- 재수집 전까지는 전부 null 로 남는다.
-- ---------------------------------------------------------------------------
alter table items add column if not exists in_stock boolean;

comment on column items.in_stock is
  '수집 시점에 살 수 있었는지. null 은 품절이 아니라 확인하지 못했다는 뜻. 확인 시각은 last_synced_at';

-- 도감의 "지금 토벌 가능" 필터가 읽는 열이다.
-- 전체의 7% 뿐이라 부분 인덱스로 둔다
create index if not exists items_in_stock_idx on items (in_stock) where in_stock;

-- ---------------------------------------------------------------------------
-- 2. 적재 함수에 in_stock 반영
--
-- 0005 의 load_items 에 열 하나를 더한 것이다. 나머지는 그대로다.
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
    in_stock            boolean,
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
      list_price_jpy, image_url, source_url, in_stock,
      tags_raw, unmapped_tags,
      released_on, preorder_on, restocked_on,
      purchase_limit, flags,
      source_updated_at, last_synced_at, discontinued_at
    )
    select
      i.source, i.shopify_product_id, i.handle, i.jan,
      i.name_ko, i.name_ja, i.description_ko,
      i.product_type_ko, i.product_type_ja, i.vendor,
      i.list_price_jpy, i.image_url, i.source_url, i.in_stock,
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
      in_stock           = excluded.in_stock,
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
-- 0005 와 같은 권한을 다시 건다. create or replace 로도 권한은 유지되지만,
-- 이 파일만 따로 돌리는 경우를 생각해 명시해 둔다
revoke execute on function load_items(jsonb) from public;
revoke execute on function load_items(jsonb) from anon;
