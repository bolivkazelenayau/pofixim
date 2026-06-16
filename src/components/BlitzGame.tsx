'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { Ege9BlitzCard } from '@/features/exercises/ege9Blitz';
import { refreshEge9BlitzCardAction } from '@/app/actions/exercises';
import { copyTextToClipboard } from '@/lib/clipboard';
import { subscribeToExerciseUpdates } from '@/lib/exercise-update-events';
import {
  BlitzFinishedPanel,
  BlitzOfferPanel,
} from './BlitzGamePanels';
import { BlitzGameRunningPanel } from './BlitzGameRunningPanel';
import {
  scoreForBlitzAnswer,
  type BlitzDuration,
  type BlitzResult,
} from './blitzGameModel';

type BlitzGameProps = {
  cards: Ege9BlitzCard[];
  mode?: 'normal' | 'inspect';
  onClose: () => void;
  onFinish: (result: BlitzResult) => void;
};

export type { BlitzResult } from './blitzGameModel';

export default function BlitzGame({ cards, mode = 'normal', onClose, onFinish }: BlitzGameProps) {
  const isInspectMode = mode === 'inspect';
  const [duration, setDuration] = useState<BlitzDuration>(30);
  const [status, setStatus] = useState<'offer' | 'running' | 'finished'>(isInspectMode ? 'running' : 'offer');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [localCards, setLocalCards] = useState<Ege9BlitzCard[]>(cards);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const answerLockedRef = useRef(false);
  const feedbackTimeoutRef = useRef<number | null>(null);

  const timeLeftMs = useMemo(() => {
    if (isInspectMode) return duration * 1000;
    if (status !== 'running' || !startedAt) return duration * 1000;
    return Math.max(0, duration * 1000 - (now - startedAt));
  }, [duration, isInspectMode, now, startedAt, status]);

  const timeLeftSeconds = Math.ceil(timeLeftMs / 1000);
  const currentCard = localCards[index % Math.max(localCards.length, 1)];
  const quickSeedCommand = currentCard?.seedKey
    ? `/qseed blitz ${currentCard.seedKey} row=${currentCard.rowIndex} word=${currentCard.wordIndex}`
    : null;
  const quickSeedLabel = currentCard?.seedKey
    ? `${currentCard.seedKey} · row ${currentCard.rowIndex} · word ${currentCard.wordIndex}`
    : `id:${currentCard?.sourceExerciseId ?? 'n/a'}`;
  const archivedCards = [1, 2, 3]
    .map((offset) => localCards[(index + offset) % Math.max(localCards.length, 1)])
    .filter((card): card is Ege9BlitzCard => Boolean(card && card.id !== currentCard?.id));
  const progress = status === 'running' ? timeLeftMs / (duration * 1000) : 1;
  const choiceWords = currentCard
    ? currentCard.choices.map((letter) => `${currentCard.before}${letter}${currentCard.after}`)
    : ['', ''];
  const wordLength = currentCard ? currentCard.before.length + 1 + currentCard.after.length : 0;
  const wordFontClass = wordLength > 22
    ? 'text-[clamp(1.05rem,5.2vw,1.45rem)] sm:text-[clamp(1rem,2.15vw,1.45rem)]'
    : wordLength > 17
      ? 'text-[clamp(1.18rem,5.8vw,1.72rem)] sm:text-[clamp(1.12rem,2.45vw,1.72rem)]'
      : wordLength > 14
        ? 'text-[clamp(1.3rem,6.5vw,2rem)] sm:text-[clamp(1.3rem,2.8vw,2rem)]'
        : wordLength > 10
          ? 'text-[clamp(1.6rem,8vw,2.5rem)] sm:text-[clamp(1.5rem,3.2vw,2.4rem)]'
          : 'text-[clamp(2.05rem,10.4vw,3.2rem)] sm:text-[clamp(1.75rem,3.8vw,2.7rem)]';
  const wordGapClass = wordLength > 17 ? 'gap-x-0.5' : 'gap-x-1.5 sm:gap-x-1';
  const dragX = useMotionValue(0);
  const nextY = useTransform(dragX, [-180, 0, 180], [0, 14, 0]);
  const nextScale = useTransform(dragX, [-180, 0, 180], [1, 0.95, 1]);
  const nextRotateX = useTransform(dragX, [-180, 0, 180], [0, 5, 0]);
  const nextOpacity = useTransform(dragX, [-180, 0, 180], [1, 0.8, 1]);

  const thirdY = useTransform(dragX, [-180, 0, 180], [14, 28, 14]);
  const thirdScale = useTransform(dragX, [-180, 0, 180], [0.95, 0.9, 0.95]);
  const thirdRotateX = useTransform(dragX, [-180, 0, 180], [5, 10, 5]);
  const thirdOpacity = useTransform(dragX, [-180, 0, 180], [0.8, 0.5, 0.8]);

  const fourthY = useTransform(dragX, [-180, 0, 180], [28, 42, 28]);
  const fourthScale = useTransform(dragX, [-180, 0, 180], [0.9, 0.85, 0.9]);
  const fourthRotateX = useTransform(dragX, [-180, 0, 180], [10, 15, 10]);
  const fourthOpacity = useTransform(dragX, [-180, 0, 180], [0.5, 0, 0.5]);

  const dragLift = useTransform(dragX, [-180, 0, 180], [-24, 0, -24]);
  const dragRotate = useTransform(dragX, [-180, 0, 180], [-9, 0, 9]);
  const dragRotateY = useTransform(dragX, [-180, 0, 180], [18, 0, -18]);
  const dragOpacity = useTransform(dragX, [-170, -96, 0, 96, 170], [0.38, 0.78, 1, 0.78, 0.38]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    if (isInspectMode) {
      onClose();
      return;
    }
    finishedRef.current = true;
    setStatus('finished');
    onFinish({
      duration,
      correctCount,
      wrongCount,
      bestCombo,
      scoreDelta,
    });
  }, [bestCombo, correctCount, duration, isInspectMode, onClose, onFinish, scoreDelta, wrongCount]);

  function start() {
    if (localCards.length === 0) return;
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    const started = Date.now();
    finishedRef.current = false;
    setStartedAt(started);
    setNow(started);
    setIndex(0);
    setCorrectCount(0);
    setWrongCount(0);
    setCombo(0);
    setBestCombo(0);
    setScoreDelta(0);
    setLastAnswerCorrect(null);
    setIsDraggingCard(false);
    dragX.stop();
    dragX.set(0);
    answerLockedRef.current = false;
    setStatus('running');
  }

  useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  useEffect(() => {
    if (isInspectMode) {
      setStatus('running');
      return;
    }

    setStatus((currentStatus) => (currentStatus === 'running' ? 'offer' : currentStatus));
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

  const handleRefresh = useCallback(async () => {
    if (!currentCard?.sourceExerciseId || isRefreshing) return;
    setIsRefreshing(true);
    const res = await refreshEge9BlitzCardAction({
      exerciseId: currentCard.sourceExerciseId,
      cardId: currentCard.id,
      rowIndex: currentCard.rowIndex,
      wordIndex: currentCard.wordIndex,
    });
    if (res.success && res.card) {
      setLocalCards((prev) =>
        prev.map((card) => (card.id === currentCard.id ? res.card! : card)),
      );
    }
    setIsRefreshing(false);
  }, [currentCard, isRefreshing]);

  const answer = useCallback((choiceIndex: 0 | 1) => {
    if (status !== 'running' || !currentCard || answerLockedRef.current) return;
    answerLockedRef.current = true;

    const isCorrect = choiceIndex === currentCard.correctChoiceIndex;
    const direction = choiceIndex === 0 ? -1 : 1;
    
    if (isCorrect) {
      setCorrectCount((value) => value + 1);
      setCombo((value) => {
        const nextCombo = value + 1;
        setBestCombo((best) => Math.max(best, nextCombo));
        setScoreDelta((score) => score + scoreForBlitzAnswer(nextCombo));
        return nextCombo;
      });
    } else {
      setWrongCount((value) => value + 1);
      setScoreDelta((score) => score - 5);
      setCombo(0);
    }

    setLastAnswerCorrect(isCorrect);
    setIsDraggingCard(false);

    // Animate card off-screen
    animate(dragX, direction * 600, {
      type: 'spring',
      stiffness: 440,
      damping: 28,
      mass: 0.82,
    });

    // After card flies away, advance index so card+buttons stay in sync
    feedbackTimeoutRef.current = window.setTimeout(() => {
      dragX.stop();
      dragX.set(0);
      setIndex((value) => value + 1);
      setLastAnswerCorrect(null);
      answerLockedRef.current = false;
      feedbackTimeoutRef.current = null;
    }, 190);
  }, [currentCard, dragX, status]);

  // Cleanup timeout on unmount
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
    const refreshTimer = window.setInterval(refresh, 5000);

    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
    };
  }, [handleRefresh, status]);

  useEffect(() => {
    if (!currentCard?.sourceExerciseId) return;

    return subscribeToExerciseUpdates((exerciseId) => {
      if (exerciseId === currentCard.sourceExerciseId) {
        void handleRefresh();
      }
    });
  }, [currentCard?.sourceExerciseId, handleRefresh]);

  useEffect(() => {
    document.documentElement.classList.add('blitz-scroll-lock');

    return () => {
      document.documentElement.classList.remove('blitz-scroll-lock');
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== 'running' || isInspectMode) return;

    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => window.clearInterval(id);
  }, [isInspectMode, status]);

  useEffect(() => {
    if (!isInspectMode && status === 'running' && timeLeftMs <= 0) {
      finish();
    }
  }, [finish, isInspectMode, status, timeLeftMs]);

  useEffect(() => {
    if (status !== 'running') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') answer(0);
      if (event.key === 'ArrowRight') answer(1);
      if (event.key === 'Escape') finish();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [answer, finish, status]);

  const handleDialogOpenChange = (open: boolean) => {
    if (open) return;
    if (status === 'running' && !isInspectMode) {
      finish();
      return;
    }
    onClose();
  };

  return (
    <DialogPrimitive.Root open modal={false} onOpenChange={handleDialogOpenChange}>
      <DialogPrimitive.Portal>
        <div
          aria-hidden="true"
          className="fixed inset-0 z-modal bg-black/50"
          onMouseDown={() => handleDialogOpenChange(false)}
        />
        <DialogPrimitive.Content
          className="fixed inset-0 z-modal flex items-end justify-center p-0 outline-none sm:items-center sm:px-3 sm:py-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleDialogOpenChange(false);
            }
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Блиц</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Быстрый режим тренировки: выберите длительность, отвечайте стрелками или кнопками, Escape завершает раунд.
          </DialogPrimitive.Description>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        className={`relative flex max-h-[94svh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[32px] border border-white/75 bg-[var(--surface-strong)] shadow-xl sm:max-h-[92vh] sm:rounded-[40px] ${
          status === 'running' && !isInspectMode ? 'min-h-[68svh] sm:min-h-0' : ''
        }`}
        aria-label="Блиц"
      >
        {copyToast && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-sticky -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background shadow-lg">
            {copyToast}
          </div>
        )}

        <button
          type="button"
          onClick={status === 'running' && !isInspectMode ? finish : onClose}
          className={`absolute right-5 z-sticky flex size-10 items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] text-foreground/70 transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke sm:right-6 ${
            status === 'running' ? 'top-3' : 'top-[22px] sm:top-[26px]'
          }`}
          aria-label="Close blitz"
          title="Закрыть"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {status === 'offer' && !isInspectMode && (
          <BlitzOfferPanel
            cardCount={localCards.length}
            duration={duration}
            onDurationChange={setDuration}
            onStart={start}
          />
        )}

        {status === 'running' && currentCard && (
          <BlitzGameRunningPanel
            archivedCards={archivedCards}
            choiceWords={choiceWords}
            combo={combo}
            currentCard={currentCard}
            dragLift={dragLift}
            dragOpacity={dragOpacity}
            dragRotate={dragRotate}
            dragRotateY={dragRotateY}
            dragX={dragX}
            fourthOpacity={fourthOpacity}
            fourthRotateX={fourthRotateX}
            fourthScale={fourthScale}
            fourthY={fourthY}
            isDraggingCard={isDraggingCard}
            isInspectMode={isInspectMode}
            lastAnswerCorrect={lastAnswerCorrect}
            nextOpacity={nextOpacity}
            nextRotateX={nextRotateX}
            nextScale={nextScale}
            nextY={nextY}
            progress={progress}
            quickSeedCommand={quickSeedCommand}
            quickSeedLabel={quickSeedLabel}
            scoreDelta={scoreDelta}
            thirdOpacity={thirdOpacity}
            thirdRotateX={thirdRotateX}
            thirdScale={thirdScale}
            thirdY={thirdY}
            timeLeftSeconds={timeLeftSeconds}
            wordFontClass={wordFontClass}
            wordGapClass={wordGapClass}
            answer={answer}
            copyQuickSeedCommand={copyQuickSeedCommand}
            copySeedKey={copySeedKey}
            setIsDraggingCard={setIsDraggingCard}
          />
        )}

        {status === 'finished' && (
          <BlitzFinishedPanel
            bestCombo={bestCombo}
            correctCount={correctCount}
            scoreDelta={scoreDelta}
            wrongCount={wrongCount}
            onClose={onClose}
          />
        )}
      </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
