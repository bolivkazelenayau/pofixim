'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BookOpenCheck, Copy } from 'lucide-react';
import type { Ege13QuickCard } from '@/features/exercises/ege13Quick';
import { refreshEge13QuickCardAction } from '@/app/actions/exercises';
import { copyTextToClipboard } from '@/lib/clipboard';
import { subscribeToExerciseUpdates } from '@/lib/exercise-update-events';
import {
  QuickChoiceButton,
  QuickFinishedPanel,
  QuickGameModalShell,
  QuickOfferPanel,
} from './QuickGamePanels';

type Ege13QuickGameProps = {
  cards: Ege13QuickCard[];
  mode?: 'normal' | 'inspect';
  onClose: () => void;
  onFinish: (result: Ege13QuickResult) => void;
};

export type Ege13QuickResult = {
  correctCount: number;
  wrongCount: number;
  bestCombo: number;
  scoreDelta: number;
};

function scoreForAnswer(combo: number) {
  return 8 + (combo > 0 && combo % 8 === 0 ? 20 : 0);
}

const RUSSIAN_SHORT_WORD_PATTERN =
  /(^|[\s([{«„"'])((?:в|во|к|ко|с|со|о|об|от|до|по|за|из|у|и|а|но|не|ни|без|для|над|под|при|про|или))\s+/giu;

function keepRussianShortWords(text: string) {
  return text.replace(
    RUSSIAN_SHORT_WORD_PATTERN,
    (_match, prefix: string, word: string) => `${prefix}${word}\u00A0`,
  );
}

export default function Ege13QuickGame({
  cards,
  mode = 'normal',
  onClose,
  onFinish,
}: Ege13QuickGameProps) {
  const isInspectMode = mode === 'inspect';
  const [status, setStatus] = useState<'offer' | 'running' | 'finished'>(isInspectMode ? 'running' : 'offer');
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [isAnswerLocked, setIsAnswerLocked] = useState(false);
  const [localCards, setLocalCards] = useState<Ege13QuickCard[]>(cards);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const answerLockedRef = useRef(false);

  const currentCard = localCards[index % Math.max(localCards.length, 1)];
  const quickSeedCommand = currentCard?.seedKey
    ? `/qseed ege13 ${currentCard.seedKey} row=${currentCard.rowIndex}`
    : null;
  const quickSeedLabel = currentCard?.seedKey
    ? `${currentCard.seedKey} · row ${currentCard.rowIndex}`
    : `id:${currentCard?.sourceExerciseId ?? 'n/a'}`;
  const resolutionLabel = currentCard
    ? `${currentCard.resolution.kind} · ${currentCard.resolution.confidence}`
    : '';

  const tokenLength = currentCard ? currentCard.token.replace(/\s+/g, '').length : 0;
  const tokenFontClass = tokenLength > 18
    ? 'text-[clamp(1.25rem,5.7vw,2rem)] sm:text-[2rem]'
    : tokenLength > 12
      ? 'text-[clamp(1.45rem,6.2vw,2.25rem)] sm:text-[2.15rem]'
      : 'text-[clamp(2rem,9.5vw,3.05rem)] sm:text-[2.85rem]';

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    if (isInspectMode) {
      onClose();
      return;
    }
    finishedRef.current = true;
    setStatus('finished');
    onFinish({
      correctCount,
      wrongCount,
      bestCombo,
      scoreDelta,
    });
  }, [bestCombo, correctCount, isInspectMode, onClose, onFinish, scoreDelta, wrongCount]);

  const closeFromBackdrop = useCallback(() => {
    if (status === 'running' && !isInspectMode) {
      finish();
      return;
    }

    onClose();
  }, [finish, isInspectMode, onClose, status]);

  function start() {
    if (localCards.length === 0) return;
    finishedRef.current = false;
    answerLockedRef.current = false;
    setIsAnswerLocked(false);
    setIndex(0);
    setCorrectCount(0);
    setWrongCount(0);
    setCombo(0);
    setBestCombo(0);
    setScoreDelta(0);
    setLastAnswerCorrect(null);
    setStatus('running');
  }

  useEffect(() => {
    queueMicrotask(() => {
      if (isInspectMode) {
        setStatus('running');
        return;
      }

      setStatus((currentStatus) => (currentStatus === 'running' ? 'offer' : currentStatus));
    });
  }, [isInspectMode]);

  async function copySeedKey() {
    if (!currentCard?.seedKey) return;
    const didCopy = await copyTextToClipboard(currentCard.seedKey);
    setCopyToast(didCopy ? 'Seed скопирован' : 'Не удалось скопировать');
  }

  async function copyQuickSeedCommand() {
    if (!quickSeedCommand) return;
    const didCopy = await copyTextToClipboard(quickSeedCommand);
    setCopyToast(didCopy ? 'qseed скопирован' : 'Не удалось скопировать');
  }

  const answer = useCallback((choiceIndex: 0 | 1) => {
    if (status !== 'running' || !currentCard || answerLockedRef.current) return;
    answerLockedRef.current = true;
    setIsAnswerLocked(true);

    const isCorrect = choiceIndex === currentCard.correctChoiceIndex;
    if (isCorrect) {
      setCorrectCount((value) => value + 1);
      setCombo((value) => {
        const nextCombo = value + 1;
        setBestCombo((best) => Math.max(best, nextCombo));
        setScoreDelta((score) => score + scoreForAnswer(nextCombo));
        return nextCombo;
      });
    } else {
      setWrongCount((value) => value + 1);
      setScoreDelta((score) => score - 4);
      setCombo(0);
    }

    setLastAnswerCorrect(isCorrect);
  }, [currentCard, status]);

  const nextCard = useCallback(() => {
    setIndex((value) => value + 1);
    setLastAnswerCorrect(null);
    answerLockedRef.current = false;
    setIsAnswerLocked(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!currentCard?.sourceExerciseId || isRefreshing) return;
    setIsRefreshing(true);
    const res = await refreshEge13QuickCardAction({
      exerciseId: currentCard.sourceExerciseId,
      cardId: currentCard.id,
      rowIndex: currentCard.rowIndex,
    });
    if (res.success && res.card) {
      setLocalCards((prev) =>
        prev.map((c) => (c.id === currentCard.id ? res.card! : c)),
      );
    }
    setIsRefreshing(false);
  }, [currentCard, isRefreshing]);

  const refreshCardsForExercise = useCallback(async (exerciseId: number) => {
    if (isRefreshing) return;
    const cardsToRefresh = localCards.filter((card) => card.sourceExerciseId === exerciseId);
    if (cardsToRefresh.length === 0) return;

    setIsRefreshing(true);
    try {
      const results = await Promise.all(
        cardsToRefresh.map((card) =>
          refreshEge13QuickCardAction({
            exerciseId,
            cardId: card.id,
            rowIndex: card.rowIndex,
          }),
        ),
      );
      const refreshedById = new Map(
        results
          .filter((result) => result.success && result.card)
          .map((result) => [result.card!.id, result.card!]),
      );

      if (refreshedById.size > 0) {
        setLocalCards((prev) => prev.map((card) => refreshedById.get(card.id) ?? card));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, localCards]);

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  useEffect(() => {
    if (status !== 'running') return;

    const refresh = () => {
      void handleRefresh();
    };
    const refreshTimer = window.setInterval(refresh, 90_000);

    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
    };
  }, [handleRefresh, status]);

  useEffect(() => {
    if (!currentCard?.sourceExerciseId) return;

    return subscribeToExerciseUpdates((event) => {
      if (event.exerciseId === currentCard.sourceExerciseId) {
        void refreshCardsForExercise(event.exerciseId);
      }
    });
  }, [currentCard?.sourceExerciseId, refreshCardsForExercise]);

  useEffect(() => {
    if (status !== 'running') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (answerLockedRef.current) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
          event.preventDefault();
          nextCard();
        }
      } else {
        if (event.key === 'ArrowLeft') answer(0);
        if (event.key === 'ArrowRight') answer(1);
      }
      if (event.key === 'Escape') finish();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [answer, finish, nextCard, status]);

  return (
    <QuickGameModalShell
      ariaLabel="Быстрый тип 13"
      copyToast={copyToast}
      isCloseOffsetForRunning={status === 'running'}
      onClose={status === 'running' && !isInspectMode ? finish : onClose}
      onCloseFromBackdrop={closeFromBackdrop}
    >

        {status === 'offer' && !isInspectMode && (
          <QuickOfferPanel
            description="Выбери, как раскрывается НЕ или НИ в коротком контексте."
            disabled={localCards.length === 0}
            icon={BookOpenCheck}
            iconClassName="bg-primary"
            title="Тип 13 быстро"
            onStart={start}
          />
        )}

        {status === 'running' && currentCard && (
          <div className="flex flex-1 flex-col p-3 sm:p-5">
            <div className="relative mb-3 flex min-h-8 items-center sm:mb-4">
              {isInspectMode ? (
                <div className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em] text-primary shadow-sm sm:px-3 sm:text-sm">
                  qseed
                </div>
              ) : combo > 0 ? (
                <div className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-black tabular-nums text-sky-700 ring-1 ring-sky-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20 sm:px-3 sm:text-sm">
                  x{combo}
                </div>
              ) : null}
              <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black tabular-nums text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20 sm:px-3 sm:text-sm">
                {scoreDelta}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentCard.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                className={`min-h-[330px] rounded-[20px] border-2 px-4 pb-5 pt-7 text-center shadow-sm sm:min-h-[300px] sm:px-7 ${
                  lastAnswerCorrect === true
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                    : lastAnswerCorrect === false
                      ? 'border-red-400 bg-red-50 dark:bg-red-950/40'
                      : 'border-[var(--stroke)] bg-[linear-gradient(180deg,var(--surface-strong),var(--surface))]'
                }`}
              >
                <div className="mx-auto mb-4 w-fit rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
                  Ряд {currentCard.rowIndex}
                </div>
                <div className="flex justify-center">
                  <div className={`${tokenFontClass} max-w-full text-center font-black leading-none text-foreground [overflow-wrap:anywhere]`}>
                    {currentCard.token}
                  </div>
                </div>
                <p className="mx-auto mt-5 max-w-[440px] text-sm font-semibold leading-6 text-foreground/72 sm:text-base sm:leading-7">
                  {currentCard.context}
                </p>
                {currentCard.explanationSnippet && lastAnswerCorrect !== null && (
                  <p className="mx-auto mt-5 max-w-[440px] rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-semibold leading-5 text-foreground/65">
                    {keepRussianShortWords(currentCard.explanationSnippet)}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {isAnswerLocked ? (
              <div className="mt-3 sm:mt-4">
                <button
                  type="button"
                  onClick={nextCard}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] rounded-b-[24px] bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] sm:text-lg"
                >
                  Далее
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4">
                <QuickChoiceButton
                  label={currentCard.choices[0]}
                  icon="left"
                  disabled={false}
                  onClick={() => answer(0)}
                />
                <QuickChoiceButton
                  label={currentCard.choices[1]}
                  icon="right"
                  disabled={false}
                  onClick={() => answer(1)}
                />
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-foreground/60 sm:mt-3 sm:text-[11px]">
              <button
                type="button"
                onClick={copySeedKey}
                disabled={!currentCard.seedKey}
                className="text-left font-mono transition-colors duration-150 ease-out hover:text-primary disabled:pointer-events-none disabled:text-foreground/45"
                title={currentCard.seedKey ? 'Скопировать seed key' : undefined}
              >
                seed: {quickSeedLabel}
              </button>
              <button
                type="button"
                onClick={copyQuickSeedCommand}
                disabled={!quickSeedCommand}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-foreground/45 transition-[background-color,color] duration-150 ease-out hover:bg-[var(--stroke)] hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                aria-label="Скопировать qseed"
                title="Скопировать qseed"
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            {isInspectMode && (
              <div className="mt-1 min-w-0 truncate font-mono text-[10px] text-foreground/45 sm:text-[11px]">
                {resolutionLabel}
              </div>
            )}
          </div>
        )}

        {status === 'finished' && (
          <QuickFinishedPanel
            bestCombo={bestCombo}
            correctCount={correctCount}
            scoreDelta={scoreDelta}
            title="Тип 13 завершён"
            wrongCount={wrongCount}
            onClose={onClose}
          />
        )}
    </QuickGameModalShell>
  );
}
