-- 구매 기록 (지출·플미)
--
-- 이 프로젝트의 본체다. "정가보다 얼마나 더 썼는가"를 남기는 자리.
--
-- 정가(list_price_jpy)와 환율(fx_rate)을 여기에 복사해 두는 것이 핵심이다.
-- items 표를 참조해 그때그때 계산하면, 공식몰이 정가를 개정하거나 환율이 움직일 때
-- 과거 기록의 플미율이 전부 흔들린다. "2년 전에 30% 웃돈 주고 샀다"는 사실은
-- 오늘 환율이 어떻든 변하면 안 되는 기록이다.
--
-- 배송비·수수료를 상품값과 나눠 담는 이유도 같다.
-- 합쳐 버리면 배대지를 거쳐 정가에 산 것도 "웃돈 줬다"로 보인다.

create table if not exists acquisitions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,

  -- 굿즈. items 를 참조하지 않는 이유는 아직 수집되지 않은 굿즈도 기록할 수 있어야 해서다
  handle          text        not null,
  -- 수집본이 없을 때를 대비해 이름도 같이 남긴다
  name_snapshot   text,

  -- official / danggeun / bunjang / groupbuy / other
  source          text        not null default 'other',
  purchased_on    date        not null,
  quantity        integer     not null default 1 check (quantity > 0),

  -- 실제 지출 (원). 상품값과 부대비용을 나눠 담는다
  item_price_krw  integer     not null check (item_price_krw >= 0),
  shipping_krw    integer     not null default 0 check (shipping_krw >= 0),
  fee_krw         integer     not null default 0 check (fee_krw >= 0),

  -- 구매 시점 스냅샷. 없으면 플미를 계산하지 않는다
  list_price_jpy  integer,
  fx_rate         numeric(12, 6),
  -- 자동 조회값을 사용자가 고쳤는지. 나중에 통계의 신뢰도를 따질 때 쓴다
  fx_rate_manual  boolean     not null default false,

  memo            text,
  created_at      timestamptz not null default now()
);

-- "내 기록을 최근 구매순으로"가 가장 잦은 조회다
create index if not exists acquisitions_user_date_idx on acquisitions (user_id, purchased_on desc);
-- 굿즈 하나를 여러 번 산 경우를 모아 보기 위한 색인
create index if not exists acquisitions_user_handle_idx on acquisitions (user_id, handle);

alter table acquisitions enable row level security;

-- 남의 지출 기록은 읽을 수도 쓸 수도 없다.
-- using 은 조회·수정·삭제 대상 행을, with check 는 새로 쓰는 행을 건다.
drop policy if exists own_acquisitions on acquisitions;
create policy own_acquisitions on acquisitions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
