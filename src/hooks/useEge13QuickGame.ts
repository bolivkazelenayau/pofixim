'use client';

import { useQuickGame } from './useQuickGame';
import { getEge13QuickPoolAction } from '@/app/actions/exercises';
import { shuffleEge13QuickCards } from '@/features/exercises/ege13Quick';
import type { Ege13QuickCard } from '@/features/exercises/ege13Quick';
import type { Ege13QuickResult } from '@/components/Ege13QuickGame';

export function useEge13QuickGame() {
  return useQuickGame<Ege13QuickCard, Ege13QuickResult>({
    poolAction: getEge13QuickPoolAction,
    shuffleCards: shuffleEge13QuickCards,
    skillTag: 'ege.13',
    limit: 80,
    emptyMessage: 'Быстрый тип 13 пока не нашёл строки со слитным или раздельным написанием.',
  });
}
