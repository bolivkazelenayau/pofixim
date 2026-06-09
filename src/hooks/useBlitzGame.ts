'use client';

import { useQuickGame } from './useQuickGame';
import { getBlitzPoolAction } from '@/app/actions/exercises';
import { shuffleBlitzCards } from '@/features/exercises/ege9Blitz';
import type { Ege9BlitzCard } from '@/features/exercises/ege9Blitz';
import type { BlitzResult } from '@/components/BlitzGame';

export function useBlitzGame() {
  return useQuickGame<Ege9BlitzCard, BlitzResult>({
    poolAction: getBlitzPoolAction,
    shuffleCards: shuffleBlitzCards,
    skillTag: 'ege.9',
    limit: 80,
    emptyMessage: 'Блиц пока не нашёл слова из задания 9.',
  });
}
