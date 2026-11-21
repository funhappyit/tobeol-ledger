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

export type Database = {
  public: {
    Tables: {
      user_marks: {
        Row: UserMarkRow;
        Insert: Omit<UserMarkRow, 'created_at'> & { created_at?: string };
        Update: Partial<UserMarkRow>;
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
