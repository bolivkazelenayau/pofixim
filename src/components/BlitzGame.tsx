'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { Copy, Timer, Trophy, X, Zap } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { Ege9BlitzCard } from '@/features/exercises/ege9Blitz';
import { copyTextToClipboard } from '@/lib/clipboard';

type BlitzDuration = 30 | 60 | 120;

type BlitzGameProps = {
  cards: Ege9BlitzCard[];
  mode?: 'normal' | 'inspect';
  onClose: () => void;
  onFinish: (result: BlitzResult) => void;
};

export type BlitzResult = {
  duration: BlitzDuration;
  correctCount: number;
  wrongCount: number;
  bestCombo: number;
  scoreDelta: number;
};

const DURATIONS: BlitzDuration[] = [30, 60, 120];
const BASE_POINTS = 10;

function scoreForAnswer(combo: number) {
  // +30 bonus every 10th correct answer in a row
  const streakBonus = (combo > 0 && combo % 10 === 0) ? 30 : 0;
  return BASE_POINTS + streakBonus;
}

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
  const currentCard = cards[index % Math.max(cards.length, 1)];
  const quickSeedCommand = currentCard?.seedKey
    ? `/qseed blitz ${currentCard.seedKey} row=${currentCard.rowIndex} word=${currentCard.wordIndex}`
    : null;
  const quickSeedLabel = currentCard?.seedKey
    ? `${currentCard.seedKey} · row ${currentCard.rowIndex} · word ${currentCard.wordIndex}`
    : `id:${currentCard?.sourceExerciseId ?? 'n/a'}`;
  const archivedCards = [1, 2, 3]
    .map((offset) => cards[(index + offset) % Math.max(cards.length, 1)])
    .filter((card): card is Ege9BlitzCard => Boolean(card && card.id !== currentCard?.id));
  const progress = status === 'running' ? timeLeftMs / (duration * 1000) : 1;
  const choiceWords = currentCard
    ? currentCard.choices.map((letter) => `${currentCard.before}${letter}${currentCard.after}`)
    : ['', ''];
  const wordLength = currentCard ? currentCard.before.length + 1 + currentCard.after.length : 0;
  const wordFontClass = wordLength > 14
    ? 'text-[clamp(1.3rem,6.5vw,2rem)] sm:text-[clamp(1.3rem,2.8vw,2rem)]'
    : wordLength > 10
      ? 'text-[clamp(1.6rem,8vw,2.5rem)] sm:text-[clamp(1.5rem,3.2vw,2.4rem)]'
      : 'text-[clamp(2.05rem,10.4vw,3.2rem)] sm:text-[clamp(1.75rem,3.8vw,2.7rem)]';
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
    if (cards.length === 0) return;
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

  function stopCopyInteraction(
    event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
  }

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
        setScoreDelta((score) => score + scoreForAnswer(nextCombo));
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
          <div className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3 pr-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black leading-tight text-foreground">Блиц на орфограммы</h2>
                <p className="mt-1 max-w-[38ch] text-pretty text-sm leading-5 text-foreground/65">
                  За&nbsp;короткое время выбери пропущенную букву свайпом или стрелками.
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {DURATIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDuration(item)}
                  className={`h-12 rounded-2xl border text-sm font-bold transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                    duration === item
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-[var(--stroke)] bg-[var(--surface)] text-foreground hover:border-primary/60 hover:bg-stroke dark:hover:bg-stroke'
                  }`}
                >
                  {item === 60 ? '1 мин' : item === 120 ? '2 мин' : `${item} сек`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={start}
              disabled={cards.length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform,opacity] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
            >
              <Timer className="h-5 w-5" />
              Старт
            </button>
          </div>
        )}

        {status === 'running' && currentCard && (
          <div className="flex flex-1 flex-col p-3 sm:block sm:p-5">
            <div className="relative mb-2 flex min-h-8 items-center justify-between gap-2 sm:mb-3">
              {isInspectMode ? (
                <div className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em] text-primary shadow-sm sm:px-3 sm:text-sm">
                  qseed
                </div>
              ) : (
                <div className="rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1 text-xs font-black tabular-nums text-foreground shadow-sm sm:px-3 sm:text-sm">
                  {timeLeftSeconds} c
                </div>
              )}
              <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black tabular-nums text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20 sm:px-3 sm:text-sm">
                {scoreDelta}
              </div>
              {combo > 0 ? (
                <div className="mr-10 flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black tabular-nums text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20 sm:mr-11 sm:gap-1.5 sm:px-3 sm:text-sm">
                  <Zap className="h-3.5 w-3.5 text-amber-500 sm:h-4 sm:w-4" />
                  {combo}
                </div>
              ) : (
                <div className="mr-10 sm:mr-11" />
              )}
            </div>

            {!isInspectMode && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--stroke)] sm:mb-4 sm:h-2">
                <div
                  className="h-full origin-left rounded-full bg-primary transition-transform duration-100 ease-linear"
                  style={{ transform: `scaleX(${Math.max(0, progress)})` }}
                />
              </div>
            )}

            <div className="relative grid min-h-[360px] flex-1 grid-cols-1 items-stretch gap-3 [perspective:900px] sm:min-h-[278px]">
              {archivedCards.map((card, archiveIndex) => (
                <motion.div
                  key={`${card.id}-archive-${archiveIndex}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 flex min-h-[336px] select-none flex-col items-center overflow-hidden rounded-[20px] border border-[var(--stroke)] bg-[var(--surface)] px-4 pb-8 pt-7 text-center shadow-sm sm:min-h-[254px] sm:justify-center sm:rounded-[22px] sm:px-8 sm:py-7"
                  style={{
                    y: archiveIndex === 0 ? nextY : archiveIndex === 1 ? thirdY : fourthY,
                    scale: archiveIndex === 0 ? nextScale : archiveIndex === 1 ? thirdScale : fourthScale,
                    rotateX: archiveIndex === 0 ? nextRotateX : archiveIndex === 1 ? thirdRotateX : fourthRotateX,
                    opacity: archiveIndex === 0 ? nextOpacity : archiveIndex === 1 ? thirdOpacity : fourthOpacity,
                    zIndex: 3 - archiveIndex,
                    transformPerspective: 900,
                    transformOrigin: 'bottom center',
                  }}
                >
                  <div className="absolute left-3 top-3 rounded-full border border-[var(--stroke)] bg-[var(--surface-strong)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-foreground/35 shadow-sm sm:left-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]">
                    Ряд {card.rowIndex}
                  </div>
                  <div className="mt-auto flex max-w-full items-center justify-center gap-x-1.5 whitespace-nowrap px-1 text-[clamp(2.05rem,10.4vw,3.2rem)] font-black leading-[1.02] text-foreground/40 sm:mt-0 sm:gap-x-1 sm:text-[clamp(1.75rem,3.8vw,2.7rem)]">
                    <span className="min-w-0">{card.before}</span>
                    <span className="inline-flex h-[1.08em] min-w-[1.08em] items-center justify-center rounded-xl border-2 border-primary/35 bg-white/70 px-1 text-primary/55 ring-4 ring-primary/5 dark:bg-[var(--surface-strong)]">
                      ?
                    </span>
                    <span className="min-w-0">{card.after}</span>
                  </div>
                  {card.contextHint && (
                    <div className="mt-8 max-w-full rounded-full bg-primary/5 px-5 py-2 text-base font-black text-primary/45 sm:mt-6">
                      {card.contextHint}
                    </div>
                  )}
                  <div className="mb-auto mt-12 h-[74px] w-full max-w-[286px] rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)]/75 shadow-sm sm:mb-0 sm:mt-6 sm:h-7 sm:max-w-none sm:rounded-full" />
                </motion.div>
              ))}
              <motion.div
                  key={currentCard.id}
                  initial={{ y: 10, scale: 0.96, opacity: 0.85 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  drag="x"
                  style={{
                    x: dragX,
                    y: dragLift,
                    opacity: isDraggingCard ? dragOpacity : undefined,
                    rotateZ: dragRotate,
                    rotateY: dragRotateY,
                    transformPerspective: 900,
                  }}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.42}
                  dragMomentum={false}
                  dragTransition={{ bounceStiffness: 260, bounceDamping: 28 }}
                  whileDrag={{ scale: 1.018 }}
                  onDragStart={() => setIsDraggingCard(true)}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -64) {
                      answer(0);
                      return;
                    }
                    if (info.offset.x > 64) {
                      answer(1);
                      return;
                    }
                    setIsDraggingCard(false);
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 390,
                    damping: 27,
                    mass: 0.78,
                  }}
                  className={`relative z-sticky flex min-h-[336px] cursor-grab select-none flex-col items-center overflow-hidden rounded-[20px] border-2 px-4 pb-8 pt-7 text-center shadow-sm active:cursor-grabbing sm:min-h-[254px] sm:justify-center sm:rounded-[22px] sm:px-8 sm:py-7 ${
                    lastAnswerCorrect === true
                      ? 'border-emerald-400 bg-emerald-50 shadow-[0_0_28px_rgba(16,185,129,0.3)] dark:bg-emerald-950/40'
                      : lastAnswerCorrect === false
                        ? 'border-red-400 bg-red-50 shadow-[0_0_28px_rgba(239,68,68,0.3)] dark:bg-red-950/40'
                        : 'border-[var(--stroke)] bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_42%),linear-gradient(180deg,var(--surface-strong),var(--surface))]'
                  }`}
                >
                  <div className="absolute right-3 top-3 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-primary sm:right-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]">
                    Свайп
                  </div>
                  <div className={`mt-auto flex max-w-full items-center justify-center gap-x-1.5 whitespace-nowrap px-1 ${wordFontClass} font-black leading-[1.02] text-foreground sm:mt-0 sm:gap-x-1`}>
                    <span className="min-w-0">{currentCard.before}</span>
                    <span
                      className="inline-flex h-[1.08em] min-w-[1.08em] items-center justify-center rounded-xl border-2 border-primary bg-white px-1 text-primary shadow-[0_10px_30px_color-mix(in_srgb,var(--primary)_22%,transparent)] ring-4 ring-primary/10 dark:bg-[var(--surface-strong)]"
                    >
                      ?
                    </span>
                    <span className="min-w-0">{currentCard.after}</span>
                  </div>
                  {currentCard.contextHint && (
                    <div className="mt-8 max-w-full rounded-full bg-primary/10 px-5 py-2 text-base font-black text-primary sm:mt-6">
                      {currentCard.contextHint}
                    </div>
                  )}
                  <div className="mb-auto mt-12 flex min-h-[74px] w-full max-w-[286px] flex-col items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-4 py-3 text-xs font-bold leading-5 text-foreground/55 shadow-sm sm:mb-0 sm:mt-6 sm:min-h-0 sm:max-w-none sm:rounded-full sm:px-3 sm:py-1">
                    <span className="sm:hidden">Свайпни карточку</span>
                    <span className="sm:hidden">или выбери</span>
                    <span className="sm:hidden">букву ниже</span>
                    <span className="hidden sm:inline">Свайпни карточку или выбери букву ниже</span>
                  </div>
                </motion.div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-4">
              <button
                type="button"
                onClick={() => answer(0)}
                className="flex h-14 min-w-0 flex-col items-center justify-center rounded-[20px] rounded-bl-[24px] border border-[var(--stroke)] bg-[var(--surface)] px-3 text-foreground shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/60 hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
              >
                <span className="text-xl font-black leading-tight">{currentCard.choices[0]}</span>
                <span className="max-w-full truncate text-[11px] font-bold text-foreground/45">
                  {choiceWords[0]}
                </span>
              </button>
              <button
                type="button"
                onClick={() => answer(1)}
                className="flex h-14 min-w-0 flex-col items-center justify-center rounded-[20px] rounded-br-[24px] border border-[var(--stroke)] bg-[var(--surface)] px-3 text-foreground shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/60 hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
              >
                <span className="text-xl font-black leading-tight">{currentCard.choices[1]}</span>
                <span className="max-w-full truncate text-[11px] font-bold text-foreground/45">
                  {choiceWords[1]}
                </span>
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-foreground/60 sm:mt-3 sm:text-[11px]">
              <button
                type="button"
                onPointerDown={stopCopyInteraction}
                onClick={(event) => {
                  stopCopyInteraction(event);
                  void copySeedKey();
                }}
                disabled={!currentCard.seedKey}
                className="text-left font-mono transition-colors duration-150 ease-out hover:text-primary disabled:pointer-events-none disabled:text-foreground/45"
                title={currentCard.seedKey ? 'Скопировать seed key' : undefined}
              >
                seed: {quickSeedLabel}
              </button>
              <button
                type="button"
                onPointerDown={stopCopyInteraction}
                onClick={(event) => {
                  stopCopyInteraction(event);
                  void copyQuickSeedCommand();
                }}
                disabled={!quickSeedCommand}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-foreground/45 transition-[background-color,color] duration-150 ease-out hover:bg-[var(--stroke)] hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                aria-label="Скопировать qseed"
                title="Скопировать qseed"
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {status === 'finished' && (
          <div className="p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3 pr-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black leading-tight text-foreground">Блиц завершён</h2>
                <p className="mt-1 text-sm text-foreground/65">Очки уже добавлены к счёту.</p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2">
              <ResultCell label="Верно" value={correctCount} />
              <ResultCell label="Ошибки" value={wrongCount} />
              <ResultCell label="Комбо" value={bestCombo} />
              <ResultCell label="Очки" value={scoreDelta} />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-12 w-full rounded-xl bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98]"
            >
              Продолжить
            </button>
          </div>
        )}
      </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ResultCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3">
      <div className="text-xs font-bold uppercase text-foreground/50">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</div>
    </div>
  );
}
