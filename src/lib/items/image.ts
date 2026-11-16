/**
 * 굿즈 이미지 주소 다루기
 *
 * 카드(클라이언트 컴포넌트)에서도 쓰기 때문에 조회 모듈(source.ts)과 분리해 둔다.
 * source.ts 는 파일을 읽느라 node:fs 를 import 하는데, 그게 클라이언트 번들에 섞이면
 * 빌드가 깨진다. 순수 계산만 하는 이 함수는 양쪽에서 안전하게 쓸 수 있다.
 */

/**
 * Shopify CDN 이미지에 크기 파라미터를 붙인다.
 * 이미지는 우리가 저장하지 않고 원본 CDN 을 그대로 참조하며,
 * 리사이즈도 Shopify 가 해 주는 것을 쓴다.
 */
export function withImageWidth(url: string | null, width: number): string | null {
  if (!url) {
    return null;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}width=${width}`;
}
