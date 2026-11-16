import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DexScreen } from '@/components/dex/DexScreen';
import { ALL_CHARACTERS, characterCodes, characterTitle, isKnownCharacter } from '@/lib/items/dex';

interface Props {
  params: Promise<{ character: string }>;
}

/**
 * 캐릭터 목록은 어휘표에 고정되어 있으므로 빌드 시점에 경로를 확정한다.
 * 이렇게 두지 않으면 cacheComponents 환경에서 params 가 요청 시점 값이 되어
 * 페이지 전체가 프리렌더 대상에서 빠진다.
 */
export function generateStaticParams(): { character: string }[] {
  return characterCodes().map((character) => ({ character }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { character } = await params;

  if (!isKnownCharacter(character)) {
    return { title: '굿즈 도감' };
  }

  const name = characterTitle(character);
  return {
    title: `${name} 도감`,
    description: `치이카와 ${name} 굿즈 도감. 토벌한 굿즈를 체크하고 정가를 확인합니다.`,
  };
}

export default async function DexCharacterPage({ params }: Props) {
  const { character } = await params;

  // 전체는 /dex 가 담당한다. 모르는 캐릭터와 함께 404 로 보낸다
  if (character === ALL_CHARACTERS || !isKnownCharacter(character)) {
    notFound();
  }

  return <DexScreen character={character} />;
}
