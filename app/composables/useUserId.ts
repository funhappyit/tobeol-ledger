/**
 * 로그인한 사용자의 id
 *
 * useSupabaseUser() 는 User 객체가 아니라 **JWT 클레임**을 돌려준다.
 * 클레임에서 사용자 식별자는 `id` 가 아니라 `sub` 이다.
 *
 * 그런데 JwtPayload 에 `[key: string]: any` 가 있어서 `user.value.id` 라고 적어도
 * 타입 검사가 통과한다. 값은 항상 undefined 인데 컴파일은 멀쩡해서,
 * "로그인했는데 로그인이 필요하다고 나오는" 형태로만 드러난다.
 *
 * 같은 실수를 여러 곳에서 반복하지 않도록 여기 한곳에 모은다.
 */
export function useUserId() {
  const user = useSupabaseUser();

  return computed(() => {
    const sub = user.value?.sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  });
}
