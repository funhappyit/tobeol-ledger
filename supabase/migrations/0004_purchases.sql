-- 구매를 "주문" 단위로 바꾼다
--
-- 0003 은 굿즈 한 건마다 배송비 칸을 두었는데, 실제로는 여러 개를 한 번에 사고
-- 배송비는 주문당 한 번 붙는다. 굿즈마다 배송비를 두면 3개를 한 번에 샀을 때
-- 3등분하거나 한 곳에 몰아넣어야 하고, 어느 쪽이든 틀린 숫자가 된다.
--
--   purchases      — 한 번의 구매. 구매처·구매일·배송비·수수료·환율
--   purchase_items — 그 구매에 담긴 굿즈. 굿즈·수량·상품값·정가
--
-- 정가(엔)와 환율을 복사해 두는 원칙은 그대로다.
-- 참조로 두면 공식몰이 정가를 고치거나 환율이 움직일 때 과거 기록이 흔들린다.

create table if not exists purchases (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,

  -- official / danggeun / bunjang / groupbuy / other
  source         text        not null default 'other',
  purchased_on   date        not null,

  -- 주문 단위 비용. 담긴 굿즈가 몇 개든 한 번만 붙는다
  shipping_krw   integer     not null default 0 check (shipping_krw >= 0),
  fee_krw        integer     not null default 0 check (fee_krw >= 0),

  -- 구매 시점 환율 (1엔당 원). 주문 안의 굿즈는 모두 같은 환율을 쓴다
  fx_rate        numeric(12, 6),
  fx_rate_manual boolean     not null default false,

  memo           text,
  created_at     timestamptz not null default now()
);

create table if not exists purchase_items (
  id             uuid        primary key default gen_random_uuid(),
  purchase_id    uuid        not null references purchases (id) on delete cascade,

  -- items 를 참조하지 않는다. 아직 수집되지 않은 굿즈도 기록할 수 있어야 한다
  handle         text        not null,
  -- 수집본이 없을 때를 대비해 이름도 남긴다
  name_snapshot  text,

  quantity       integer     not null default 1 check (quantity > 0),
  -- 이 굿즈에 쓴 돈. 배송비·수수료는 주문 쪽에 있다
  item_price_krw integer     not null check (item_price_krw >= 0),
  -- 구매 시점 정가(엔). 없으면 이 굿즈의 플미는 계산하지 않는다
  list_price_jpy integer
);

create index if not exists purchases_user_date_idx    on purchases (user_id, purchased_on desc);
create index if not exists purchase_items_purchase_idx on purchase_items (purchase_id);
create index if not exists purchase_items_handle_idx   on purchase_items (handle);

alter table purchases      enable row level security;
alter table purchase_items enable row level security;

-- 주문은 본인 것만
drop policy if exists own_purchases on purchases;
create policy own_purchases on purchases
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 담긴 굿즈에는 user_id 가 없다. 속한 주문의 주인을 따라간다.
-- exists 로 매번 확인하므로 남의 주문에 굿즈를 밀어 넣을 수 없다.
drop policy if exists own_purchase_items on purchase_items;
create policy own_purchase_items on purchase_items
  for all
  using (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id and p.user_id = auth.uid()
    )
  );

-- 0003 을 이미 실행했다면 기록을 옮긴다.
-- 한 건이 곧 한 주문이었으므로 1:1 로 풀어 넣는다.
-- 0003 을 실행하지 않았다면 이 블록은 조용히 지나간다.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'acquisitions') then

    with moved as (
      insert into purchases (
        id, user_id, source, purchased_on, shipping_krw, fee_krw,
        fx_rate, fx_rate_manual, memo, created_at
      )
      select
        a.id, a.user_id, a.source, a.purchased_on, a.shipping_krw, a.fee_krw,
        a.fx_rate, a.fx_rate_manual, a.memo, a.created_at
      from acquisitions a
      returning id
    )
    insert into purchase_items (
      purchase_id, handle, name_snapshot, quantity, item_price_krw, list_price_jpy
    )
    select
      a.id, a.handle, a.name_snapshot, a.quantity, a.item_price_krw, a.list_price_jpy
    from acquisitions a
    where a.id in (select id from moved);

    drop table acquisitions;
  end if;
end $$;
