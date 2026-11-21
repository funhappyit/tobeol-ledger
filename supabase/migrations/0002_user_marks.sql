-- 토벌 기록 (사용자별)
--
-- 로그인 전에는 브라우저 localStorage 에만 두고, 로그인하면 이 표로 올린다.
-- 그래서 기기를 바꿔도, 브라우저 데이터를 지워도 기록이 남는다.
--
-- 굿즈는 handle 로 가리킨다. items 표를 참조하지 않는 이유는
-- 굿즈 마스터 적재와 사용자 기록의 시점이 어긋날 수 있기 때문이다.
-- (아직 수집되지 않은 굿즈를 사용자가 먼저 체크하는 경우를 막지 않는다)

create table if not exists user_marks (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  handle     text        not null,
  -- owned: 손에 넣은 것. 나중에 지출·플미 계산의 대상이 된다
  -- wish : 노리고 있는 것. 계산 대상이 아니다
  kind       text        not null check (kind in ('owned', 'wish')),
  created_at timestamptz not null default now(),

  primary key (user_id, handle, kind)
);

-- "내 기록 전부 가져오기"가 가장 잦은 조회다
create index if not exists user_marks_user_kind_idx on user_marks (user_id, kind);

alter table user_marks enable row level security;

-- 남의 기록은 읽을 수도 쓸 수도 없다.
-- using 은 조회·수정·삭제 대상 행을, with check 는 새로 쓰는 행을 건다.
-- 둘 다 걸어야 "남의 user_id 로 행을 밀어 넣는" 것까지 막힌다.
drop policy if exists own_marks on user_marks;
create policy own_marks on user_marks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
