'use client';

import { useQuickGame } from './useQuickGame';
import { getEge15QuickPoolAction } from '@/app/actions/exercises';
import { shuffleEge15QuickCards } from '@/features/exercises/ege15Quick';
import type { Ege15QuickCard } from '@/features/exercises/ege15Quick';
import type { Ege15QuickResult } from '@/components/Ege15QuickGame';

export function useEge15QuickGame() {
  return useQuickGame<Ege15QuickCard, Ege15QuickResult>({
    poolAction: getEge15QuickPoolAction,
    shuffleCards: shuffleEge15QuickCards,
    skillTag: 'ege.15',
    limit: 100,
    emptyMessage: 'Быстрый тип 15 пока не нашёл позиции с Н/НН.',
  });
}
