-- 재고 전용 스윕
--
-- 재고만 다시 보는 가벼운 수집을 30분마다 돌린다(.github/workflows/collect.yml).
-- 전체 수집은 하루 1회 그대로다. 둘은 서로를 건드리지 않는다.
--
-- ── 왜 적재 함수를 따로 두나
--
-- load_items() 는 굿즈 한 건을 items·item_characters·item_categories·
-- item_price_history 네 표에 흩어 넣는다. 재고만 바뀐 것에 그 무게를 쓸 이유가 없다.
-- 30분마다 1만 건의 캐릭터·종류 분류를 지우고 다시 넣는 것은 낭비이고,
-- 정가 이력에도 매번 손이 간다.
--
-- load_stock() 은 열 둘만 만진다. update 한 번이다.
--
-- ── 왜 시각을 담는 열을 새로 두나
--
-- last_synced_at 은 "이 행 전체를 다시 받은 시각"이다. 재고 스윕은 이름도 가격도
-- 다시 받지 않으므로 그 말이 참이 되지 않는다. 거기에 now() 를 찍으면
-- 하루 묵은 상품명을 30분 전에 확인한 것처럼 말하게 된다.
--
-- 그래서 재고를 본 시각만 따로 담는다. 읽는 쪽(src/lib/items/db.ts)은 두 값 중
-- 늦은 쪽을 쓴다. 전체 수집도 재고를 함께 보기 때문에, 어느 쪽이든 마지막으로
-- 재고를 확인한 시각이 맞다.
--
-- 이 파일은 0007 이 이미 실행된 것을 전제로 한다.

-- ---------------------------------------------------------------------------
-- 1. 재고 확인 시각
--
-- 기본값을 두지 않는다. 아직 스윕이 한 번도 돌지 않은 행은 null 로 남고,
-- 읽는 쪽은 그때 last_synced_at 을 쓴다.
-- ---------------------------------------------------------------------------
alter table items add column if not exists stock_checked_at timestamptz;

comment on column items.stock_checked_at is
  '재고를 마지막으로 확인한 시각. 재고 전용 스윕이 갱신한다. null 이면 전체 수집 시각(last_synced_at)이 기준';

-- 인덱스는 두지 않는다. 이 열로 행을 고르는 질의가 없고,
-- 도감은 전량을 받아 스토어별 최댓값만 계산한다(server/api/dex.get.ts)

-- ---------------------------------------------------------------------------
-- 2. 재고 적재 함수
--
-- payload 는 [{ "source": "official", "handle": "...", "in_stock": true }, ...] 꼴이다.
--
-- handle 은 items 에서 전역 유일하지만 source 도 함께 맞춘다.
-- 두 스토어가 같은 handle 을 쓰는 일이 생기면, 모구모구 스윕이 공식몰 굿즈의
-- 재고를 덮어쓰는 사고가 난다. 조건 하나로 막을 수 있는 일이다.
--
-- 재고를 읽지 못한 상품은 수집 쪽에서 아예 빼고 보낸다. 그래서 여기엔
-- in_stock 이 null 인 행이 오지 않는다. 혹시 와도 알고 있던 값을 "모름"으로
-- 덮지 않도록 걸러 낸다.
-- ---------------------------------------------------------------------------
create or replace function load_stock(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  touched  integer;
  changed  integer;
  received integer;
begin
  drop table if exists _stock_in;

  create temp table _stock_in on commit drop as
  select * from jsonb_to_recordset(payload) as p(
    source    text,
    handle    text,
    in_stock  boolean
  );

  select count(*) into received from _stock_in;

  -- null 은 "확인하지 못했다"는 뜻이다. 그것으로 알고 있던 값을 덮지 않는다
  delete from _stock_in where in_stock is null or handle is null or source is null;

  -- 값이 실제로 달라진 건수를 미리 센다. 갱신한 뒤에는 알 수 없다.
  -- 어느 날 이 수가 0 으로 굳으면 스윕이 헛돌고 있다는 신호다
  select count(*) into changed
  from _stock_in s
  join items i on i.handle = s.handle and i.source = s.source
  where i.in_stock is distinct from s.in_stock;

  with up as (
    update items i set
      in_stock         = s.in_stock,
      stock_checked_at = now()
    from _stock_in s
    where i.handle = s.handle
      and i.source = s.source
    returning i.id
  )
  select count(*) into touched from up;

  return jsonb_build_object(
    'received', received,
    'touched', touched,
    'changed', changed
  );
end;
$$;

-- service_role 로만 부른다. 0005·0007 과 같은 권한을 건다
revoke execute on function load_stock(jsonb) from public;
revoke execute on function load_stock(jsonb) from anon;
