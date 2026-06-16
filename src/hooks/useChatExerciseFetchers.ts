import { useCallback, useRef } from 'react';
import {
  getExerciseBySeedKeyAction,
  getQuickCardsBySeedAction,
  getNextExerciseAction,
} from '@/app/actions/exercises';
import type { ExerciseType } from '@/features/exercises/types';
import type { Ege9BlitzCard } from '@/features/exercises/ege9Blitz';
import type { Ege13QuickCard } from '@/features/exercises/ege13Quick';
import type { Ege15QuickCard } from '@/features/exercises/ege15Quick';
import { normalizeSeedKeyInput, type QuickSeedCommand } from '@/lib/chatCommands';
import { createMessageId } from '@/lib/message-id';
import type { Message } from '@/store/chatStore';

type QuickGameHandle<Card> = {
  openWithCards: (cards: Card[], options: { mode: 'inspect' }) => void;
};

type UseChatExerciseFetchersOptions = {
  sessionId: string | undefined;
  cooldownExerciseIds: number[];
  addMessage: (message: Message) => void;
  markExercisePresented: (exerciseId: number) => void;
  setSessionId: (sessionId: string) => void;
  setTyping: (isTyping: boolean) => void;
  highlightLatestExerciseIfSameSeed: (seedKey: string) => boolean;
  blitz: QuickGameHandle<Ege9BlitzCard>;
  ege13Quick: QuickGameHandle<Ege13QuickCard>;
  ege15Quick: QuickGameHandle<Ege15QuickCard>;
};

export function useChatExerciseFetchers({
  sessionId,
  cooldownExerciseIds,
  addMessage,
  markExercisePresented,
  setSessionId,
  setTyping,
  highlightLatestExerciseIfSameSeed,
  blitz,
  ege13Quick,
  ege15Quick,
}: UseChatExerciseFetchersOptions) {
  const isFetchingExercise = useRef(false);

  const fetchNextExercise = useCallback(
    async (currentSeenIds: number[], forceType?: ExerciseType) => {
      if (isFetchingExercise.current) return;

      isFetchingExercise.current = true;
      let res: Awaited<ReturnType<typeof getNextExerciseAction>>;
      try {
        const blockedIds = [...new Set([...cooldownExerciseIds, ...currentSeenIds])];
        let dynamicBlocked = [...blockedIds];
        let attempt = 0;
        do {
          res = await getNextExerciseAction({
            sessionId,
            seenExerciseIds: dynamicBlocked,
            forceType,
          });
          const returnedId = res.success && 'exercise' in res ? res.exercise?.id : undefined;
          const isBlocked = typeof returnedId === 'number' && dynamicBlocked.includes(returnedId);
          if (!isBlocked) break;
          dynamicBlocked = [...new Set([...dynamicBlocked, returnedId])];
          attempt += 1;
        } while (attempt < 4);
      } finally {
        isFetchingExercise.current = false;
      }

      if (!res.success || !('sessionId' in res)) {
        addMessage({
          id: createMessageId('error'),
          isBot: true,
          content:
            'Не удалось загрузить следующее упражнение. Проверьте базу данных и миграции.',
          type: 'text',
        });
        return;
      }

      if (res.sessionId) {
        setSessionId(res.sessionId);
      }

      if ('exercise' in res && res.exercise?.id) {
        markExercisePresented(res.exercise.id);
        addMessage({
          id: createMessageId('exercise'),
          isBot: true,
          content: res.exercise.prompt,
          type: 'exercise',
          exercise: res.exercise,
        });
        return;
      }

      if ('noMoreExercises' in res && res.noMoreExercises) {
        addMessage({
          id: createMessageId('end'),
          isBot: true,
          content:
            'Доступные упражнения закончились. Добавьте новые в админке или сбросьте прогресс.',
          type: 'text',
        });
      }
    },
    [addMessage, cooldownExerciseIds, markExercisePresented, sessionId, setSessionId],
  );

  const fetchExerciseBySeedKey = useCallback(
    async (rawSeedKey: string) => {
      const seedKey = normalizeSeedKeyInput(rawSeedKey);
      if (highlightLatestExerciseIfSameSeed(seedKey)) return;
      if (isFetchingExercise.current) return;

      isFetchingExercise.current = true;
      setTyping(true);
      let res: Awaited<ReturnType<typeof getExerciseBySeedKeyAction>>;
      try {
        res = await getExerciseBySeedKeyAction({ sessionId, seedKey });
      } finally {
        isFetchingExercise.current = false;
        setTyping(false);
      }

      if (!res.success || !('exercise' in res) || !res.exercise?.id) {
        addMessage({
          id: createMessageId('seed-error'),
          isBot: true,
          content: `Не нашёл задание с seed key: \`${seedKey}\`. Проверьте написание или статус записи в админке.`,
          type: 'text',
        });
        return;
      }

      if (res.sessionId) {
        setSessionId(res.sessionId);
      }

      markExercisePresented(res.exercise.id);
      addMessage({
        id: createMessageId('exercise'),
        isBot: true,
        content: res.exercise.prompt,
        type: 'exercise',
        exercise: res.exercise,
        allowDuplicateExerciseInstance: true,
      });
    },
    [
      addMessage,
      highlightLatestExerciseIfSameSeed,
      markExercisePresented,
      sessionId,
      setSessionId,
      setTyping,
    ],
  );

  const fetchQuickCardsBySeed = useCallback(
    async (quickSeed: QuickSeedCommand) => {
      if (isFetchingExercise.current) return;

      isFetchingExercise.current = true;
      setTyping(true);
      let res: Awaited<ReturnType<typeof getQuickCardsBySeedAction>>;
      try {
        res = await getQuickCardsBySeedAction(quickSeed);
      } finally {
        isFetchingExercise.current = false;
        setTyping(false);
      }

      if (!res.success || !res.cards?.length) {
        addMessage({
          id: createMessageId('qseed-error'),
          isBot: true,
          content:
            `Не нашёл quick-карточку для команды. Проверь seed и селектор: ` +
            '`/qseed ege13 <seed> row=5`, `/qseed ege15 <seed> pos=1`, `/qseed blitz <seed> row=2 word=1`.',
          type: 'text',
        });
        return;
      }

      if (quickSeed.mode === 'ege13') {
        ege13Quick.openWithCards(res.cards as Ege13QuickCard[], { mode: 'inspect' });
        return;
      }

      if (quickSeed.mode === 'ege15') {
        ege15Quick.openWithCards(res.cards as Ege15QuickCard[], { mode: 'inspect' });
        return;
      }

      blitz.openWithCards(res.cards as Ege9BlitzCard[], { mode: 'inspect' });
    },
    [addMessage, blitz, ege13Quick, ege15Quick, setTyping],
  );

  return {
    fetchNextExercise,
    fetchExerciseBySeedKey,
    fetchQuickCardsBySeed,
  };
}
