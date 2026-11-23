/**
 * Supabase 테이블 타입
 *
 * `supabase gen types` 로 자동 생성할 수도 있지만, 그러려면 프로젝트에 붙어 있어야 한다.
 * 지금은 우리가 쓰는 표 하나뿐이라 손으로 적어 둔다.
 * 표가 늘면 생성 명령으로 바꾸는 편이 낫다.
 *
 * 주의: 여기서는 interface 가 아니라 type 을 써야 한다.
 * supabase-js 는 각 표가 `Record<string, unknown>` 에 대입되는지 따지는데,
 * interface 에는 암묵적 인덱스 시그니처가 없어서 대입되지 않는다.
 * interface 로 적으면 타입이 조용히 never 가 되어 `.from('user_marks')` 결과가 전부 never 로 나온다.
 */

export type UserMarkRow = {
  user_id: string;
  handle: string;
  /** 'owned' = 손에 넣은 것, 'wish' = 노리는 것 */
  kind: string;
  created_at: string;
};

/**
 * 한 번의 구매.
 * 배송비·수수료는 굿즈가 몇 개든 주문당 한 번 붙으므로 여기에 둔다.
 * 환율(fx_rate)은 구매 시점 값을 복사해 둔 것이다.
 * 지금 값으로 다시 계산하면 과거 기록의 플미율이 흔들린다.
 */
export type PurchaseRow = {
  id: string;
  user_id: string;
  source: string;
  purchased_on: string;
  shipping_krw: number;
  fee_krw: number;
  fx_rate: number | null;
  fx_rate_manual: boolean;
  memo: string | null;
  created_at: string;
};

/** 구매에 담긴 굿즈. 정가(list_price_jpy)도 구매 시점 값을 복사해 둔다 */
export type PurchaseItemRow = {
  id: string;
  purchase_id: string;
  handle: string;
  name_snapshot: string | null;
  quantity: number;
  item_price_krw: number;
  list_price_jpy: number | null;
};

export type Database = {
  public: {
    Tables: {
      user_marks: {
        Row: UserMarkRow;
        Insert: Omit<UserMarkRow, 'created_at'> & { created_at?: string };
        Update: Partial<UserMarkRow>;
        Relationships: [];
      };
      purchases: {
        Row: PurchaseRow;
        Insert: Omit<PurchaseRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<PurchaseRow>;
        Relationships: [];
      };
      purchase_items: {
        Row: PurchaseItemRow;
        Insert: Omit<PurchaseItemRow, 'id'> & { id?: string };
        Update: Partial<PurchaseItemRow>;
        Relationships: [];
      };
    };
    // supabase-js 는 이 자리들이 Record<string, ...> 이기를 기대한다
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
