import type { Metadata } from 'next';

import { DexScreen } from '@/components/dex/DexScreen';
import { ALL_CHARACTERS } from '@/lib/items/dex';

export const metadata: Metadata = {
  title: '굿즈 도감',
  description: '치이카와 굿즈 도감. 토벌한 굿즈를 체크하고 정가를 확인합니다.',
};

export default function DexPage() {
  return <DexScreen character={ALL_CHARACTERS} />;
}
