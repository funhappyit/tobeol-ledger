-- 세 번째 스토어: 치이카와 모구모구 본포
--
-- 후시미이나리·카와고에·오타루 세 점포의 지역 한정 굿즈를 파는 스토어다(680건).
-- 공식몰과 같은 Shopify 라 적재 경로는 그대로 쓰고, 두 군데만 넓힌다.
--
--   1. source 체크 제약에 'mogumogu' 를 더한다.
--   2. 이 스토어에만 나오는 종류 코드를 seed 에 더한다.
--      기준은 src/lib/collect/vocab.ts 의 MOGUMOGU_CATEGORY_TAGS·MOGUMOGU_PRODUCT_TYPES 다.
--
-- 기존 데이터에는 영향이 없다. items 의 열도, load_items 함수도 바꾸지 않는다.
-- 이 파일은 0005 가 이미 실행된 것을 전제로 한다.

-- ---------------------------------------------------------------------------
-- 1. 출처 제약 넓히기
--
-- 제약은 이름으로만 찾을 수 있고 정의를 덧붙이는 문법이 없다.
-- 지우고 다시 만드는 것이 유일한 방법이라 그렇게 한다.
-- ---------------------------------------------------------------------------

alter table items drop constraint if exists items_source_check;

alter table items add constraint items_source_check
  check (source in ('official', 'pocket', 'mogumogu'));

comment on column items.source is
  '수집한 스토어. official = 치이카와 마켓, pocket = 포켓 굿즈 스토어, mogumogu = 모구모구 본포';

-- ---------------------------------------------------------------------------
-- 2. 종류 코드 보강
--
-- 지역 한정몰이라 공식몰에 없는 품목이 나온다.
-- 부채·노렌·보자기·네츠케·부적·고슈인장은 하나하나가 5~19건이라 따로 세우면
-- 필터가 산만해진다. 일본소품(japanese_goods) 하나로 묶었다.
-- ---------------------------------------------------------------------------

insert into categories (code, name_ko, name_ja, sort_order) values
  ('magnet',            '마그네트',     'マグネット',     23),
  ('chopsticks',        '젓가락',       '箸・箸置き',     24),
  ('badge',             '뱃지',         'バッジ',         25),
  ('masking_tape',      '마스킹테이프', 'マスキングテープ', 26),
  ('japanese_goods',    '일본소품',     '和雑貨',         27),
  ('fashion_accessory', '패션소품',     'ファッション小物', 28)
on conflict (code) do update
  set name_ko = excluded.name_ko,
      name_ja = excluded.name_ja,
      sort_order = excluded.sort_order;
