'use client';

import { useCallback, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { createMessageId } from '@/lib/message-id';

interface QuickGameResult {
  duration?: number;
  correctCount: number;
  wrongCount: number;
  bestCombo: number;
  scoreDelta: number;
}

interface PoolResponse<Card> {
  success: boolean;
  cards: Card[];
  error?: string;
}

interface QuickGameConfig<Card> {
  poolAction: (params: { limit: number; seenExerciseIds: number[] }) => Promise<PoolResponse<Card>>;
  shuffleCards: (cards: Card[], seed?: string) => Card[];
  skillTag: string;
  limit: number;
  emptyMessage: string;
}

interface UseQuickGameReturn<Card, Result> {
  cards: Card[];
  instanceKey: number;
  isOpen: boolean;
  isLoading: boolean;
  mode: 'normal' | 'inspect';
  open: () => Promise<void>;
  openWithCards: (cards: Card[], options?: { mode?: 'normal' | 'inspect' }) => void;
  close: () => void;
  onFinish: (result: Result) => void;
}

export function useQuickGame<Card, Result extends QuickGameResult>(
  config: QuickGameConfig<Card>
): UseQuickGameReturn<Card, Result> {
  const { seenExerciseIds, addMessage, recordBlitzScore } = useChatStore();
  const [cards, setCards] = useState<Card[]>([]);
  const [instanceKey, setInstanceKey] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'normal' | 'inspect'>('normal');
  const isLoadingRef = useRef(false);

  const open = useCallback(
    async () => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const res = await config.poolAction({
          limit: config.limit,
          seenExerciseIds,
        });

        if (res.success && res.cards.length > 0) {
          const shuffled = config.shuffleCards(res.cards, String(Date.now()));
          setCards(shuffled);
          setInstanceKey((key) => key + 1);
          setMode('normal');
          setIsOpen(true);
          return;
        }

        addMessage({
          id: createMessageId(`${config.skillTag}-empty`),
          isBot: true,
          content: config.emptyMessage,
          type: 'text',
        });
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [config, seenExerciseIds, addMessage]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setCards([]);
    setMode('normal');
  }, []);

  const openWithCards = useCallback((nextCards: Card[], options?: { mode?: 'normal' | 'inspect' }) => {
    setCards(nextCards);
    setInstanceKey((key) => key + 1);
    setMode(options?.mode ?? 'normal');
    setIsOpen(nextCards.length > 0);
  }, []);

  const onFinish = useCallback(
    (result: Result) => {
      if (mode === 'normal') {
        recordBlitzScore(result.scoreDelta);
        addMessage({
          id: createMessageId(`${config.skillTag}-result`),
          isBot: true,
          content: `${config.skillTag === 'ege.9' ? 'Блиц' : config.skillTag === 'ege.13' ? 'Тип 13' : 'Тип 15'}: +${result.scoreDelta} очков. Верно: ${result.correctCount}, ошибки: ${result.wrongCount}, лучшее комбо: ${result.bestCombo}.`,
          type: 'text',
        });
      }
      close();
    },
    [config.skillTag, mode, recordBlitzScore, addMessage, close]
  );

  return { cards, instanceKey, isOpen, isLoading, mode, open, openWithCards, close, onFinish };
}
