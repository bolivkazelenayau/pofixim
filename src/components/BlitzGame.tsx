'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { ArrowLeft, ArrowRight, Timer, Trophy, X, Zap } from 'lucide-react';
import type { Ege9BlitzCard } from '@/features/exercises/ege9Blitz';

type BlitzDuration = 10 | 30 | 60;

type BlitzGameProps = {
  cards: Ege9BlitzCard[];
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

const DURATIONS: BlitzDuration[] = [10, 30, 60];
const BASE_POINTS = 20;

function scoreForAnswer(combo: number) {
  if (combo >= 10) return BASE_POINTS * 3;
  if (combo >= 5) return BASE_POINTS * 2;
  return BASE_POINTS;
}

export default function BlitzGame({ cards, onClose, onFinish }: BlitzGameProps) {
  const [duration, setDuration] = useState<BlitzDuration>(30);
  const [status, setStatus] = useState<'offer' | 'running' | 'finished'>('offer');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null);
  const [lastAnswerDirection, setLastAnswerDirection] = useState<-1 | 1 | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const finishedRef = useRef(false);
  const answerLockedRef = useRef(false);
  const feedbackTimeoutRef = useRef<number | null>(null);

  const timeLeftMs = useMemo(() => {
    if (status !== 'running' || !startedAt) return duration * 1000;
    return Math.max(0, duration * 1000 - (now - startedAt));
  }, [duration, now, startedAt, status]);

  const timeLeftSeconds = Math.ceil(timeLeftMs / 1000);
  const currentCard = cards[index % Math.max(cards.length, 1)];
  const archivedCards = [1, 2]
    .map((offset) => cards[(index + offset) % Math.max(cards.length, 1)])
    .filter((card): card is Ege9BlitzCard => Boolean(card && card.id !== currentCard?.id));
  const progress = status === 'running' ? timeLeftMs / (duration * 1000) : 1;
  const choiceWords = currentCard
    ? currentCard.choices.map((letter) => `${currentCard.before}${letter}${currentCard.after}`)
    : ['', ''];
  const dragX = useMotionValue(0);
  const dragLift = useTransform(dragX, [-180, 0, 180], [-24, 0, -24]);
  const dragRotate = useTransform(dragX, [-180, 0, 180], [-9, 0, 9]);
  const dragRotateY = useTransform(dragX, [-180, 0, 180], [18, 0, -18]);
  const dragOpacity = useTransform(dragX, [-170, -96, 0, 96, 170], [0.38, 0.78, 1, 0.78, 0.38]);
  const cardExit = lastAnswerDirection
    ? {
        opacity: 0,
        x: lastAnswerDirection * 190,
        y: -88,
        scale: 0.94,
        rotateZ: lastAnswerDirection * 13,
        rotateY: lastAnswerDirection * -24,
        filter: 'blur(2px)',
      }
    : { opacity: 0, y: -10, scale: 0.98 };

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setStatus('finished');
    onFinish({
      duration,
      correctCount,
      wrongCount,
      bestCombo,
      scoreDelta,
    });
  }, [bestCombo, correctCount, duration, onFinish, scoreDelta, wrongCount]);

  function start() {
    if (cards.length === 0) return;
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
    setFlash(null);
    setLastAnswerDirection(null);
    setIsDraggingCard(false);
    dragX.set(0);
    answerLockedRef.current = false;
    setStatus('running');
  }

  const answer = useCallback((choiceIndex: 0 | 1) => {
    if (status !== 'running' || !currentCard || answerLockedRef.current) return;

    const isCorrect = choiceIndex === currentCard.correctChoiceIndex;
    answerLockedRef.current = true;
    setIsDraggingCard(false);
    setLastAnswerDirection(choiceIndex === 0 ? -1 : 1);

    if (isCorrect) {
      setCorrectCount((value) => value + 1);
      setCombo((value) => {
        const nextCombo = value + 1;
        setBestCombo((best) => Math.max(best, nextCombo));
        setScoreDelta((score) => score + scoreForAnswer(nextCombo));
        return nextCombo;
      });
      setFlash('correct');
    } else {
      setWrongCount((value) => value + 1);
      setCombo(0);
      setFlash('wrong');
    }

    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = window.setTimeout(() => {
      setIndex((value) => value + 1);
      setFlash(null);
      setLastAnswerDirection(null);
      setIsDraggingCard(false);
      dragX.set(0);
      answerLockedRef.current = false;
      feedbackTimeoutRef.current = null;
    }, 420);
  }, [currentCard, dragX, status]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== 'running') return;

    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === 'running' && timeLeftMs <= 0) {
      finish();
    }
  }, [finish, status, timeLeftMs]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-md sm:items-center sm:px-3 sm:py-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        className={`relative flex max-h-[94svh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[22px] border border-white/75 bg-[var(--surface-strong)] shadow-2xl sm:max-h-[92vh] sm:rounded-[22px] ${
          status === 'running' ? 'min-h-[68svh] sm:min-h-0' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Блиц"
      >
        <button
          type="button"
          onClick={status === 'running' ? finish : onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stroke)] bg-[var(--surface)] text-foreground/70 transition hover:text-foreground sm:h-9 sm:w-9"
          title="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>

        {status === 'offer' && (
          <div className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3 pr-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black leading-tight text-foreground">Блиц на орфограммы</h2>
                <p className="mt-1 text-sm leading-5 text-foreground/65">
                  За короткое время выбери пропущенную букву свайпом или стрелками.
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {DURATIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDuration(item)}
                  className={`h-12 rounded-xl border text-sm font-bold transition ${
                    duration === item
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-[var(--stroke)] bg-[var(--surface)] text-foreground hover:border-primary/60'
                  }`}
                >
                  {item === 60 ? '1 мин' : `${item} сек`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={start}
              disabled={cards.length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-black text-white shadow-sm transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Timer className="h-5 w-5" />
              Старт
            </button>
          </div>
        )}

        {status === 'running' && currentCard && (
          <div className="flex flex-1 flex-col p-3 sm:block sm:p-5">
            <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 pr-9 sm:mb-3 sm:pr-10">
              <div className="justify-self-start rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1 text-xs font-black text-foreground shadow-sm sm:px-3 sm:text-sm">
                {timeLeftSeconds} c
              </div>
              <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20 sm:gap-1.5 sm:px-3 sm:text-sm">
                <Zap className="h-3.5 w-3.5 text-amber-500 sm:h-4 sm:w-4" />
                x{combo >= 10 ? 3 : combo >= 5 ? 2 : 1}
              </div>
              <div className="justify-self-end rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20 sm:px-3 sm:text-sm">
                {scoreDelta}
              </div>
            </div>

            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--stroke)] sm:mb-4 sm:h-2">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${Math.max(0, progress) * 100}%` }}
                transition={{ duration: 0.12 }}
              />
            </div>

            <div className="relative grid min-h-[360px] flex-1 grid-cols-1 items-stretch gap-3 [perspective:900px] sm:min-h-[278px]">
              {archivedCards.map((card, archiveIndex) => (
                <motion.div
                  key={`${card.id}-archive-${archiveIndex}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 flex min-h-[336px] select-none flex-col items-center overflow-hidden rounded-[20px] border border-[var(--stroke)] bg-[radial-gradient(circle_at_50%_0%,rgba(51,144,236,0.08),transparent_42%),linear-gradient(180deg,var(--surface-strong),var(--surface))] px-4 pb-8 pt-7 text-center shadow-sm sm:min-h-[254px] sm:justify-center sm:rounded-[22px] sm:px-8 sm:py-7"
                  initial={false}
                  animate={{
                    y: archiveIndex === 0 ? 18 : 34,
                    scale: archiveIndex === 0 ? 0.965 : 0.93,
                    rotateX: archiveIndex === 0 ? 5 : 8,
                    opacity: archiveIndex === 0 ? 0.62 : 0.34,
                    filter: archiveIndex === 0 ? 'blur(0.2px)' : 'blur(0.8px)',
                  }}
                  transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.8 }}
                  style={{
                    zIndex: archiveIndex === 0 ? 2 : 1,
                    transformPerspective: 900,
                    transformOrigin: '50% 100%',
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
                    <div className="mt-4 max-w-full rounded-full bg-primary/5 px-3 py-1 text-xs font-black text-primary/45 sm:mt-3">
                      {card.contextHint}
                    </div>
                  )}
                  <div className="mb-auto mt-12 h-[74px] w-full max-w-[286px] rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)]/75 shadow-sm sm:mb-0 sm:mt-6 sm:h-7 sm:max-w-none sm:rounded-full" />
                </motion.div>
              ))}
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={currentCard.id}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    backgroundColor:
                      flash === 'correct'
                        ? 'rgba(16, 185, 129, 0.14)'
                        : flash === 'wrong'
                          ? 'rgba(239, 68, 68, 0.13)'
                          : 'rgba(255, 255, 255, 0)',
                    borderColor:
                      flash === 'correct'
                        ? 'rgba(16, 185, 129, 0.75)'
                        : flash === 'wrong'
                          ? 'rgba(239, 68, 68, 0.78)'
                          : 'var(--stroke)',
                    boxShadow:
                      flash === 'correct'
                        ? '0 18px 46px rgba(16, 185, 129, 0.18)'
                        : flash === 'wrong'
                          ? '0 18px 46px rgba(239, 68, 68, 0.18)'
                          : '0 1px 2px rgba(15, 23, 42, 0.08)',
                  }}
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
                      animate(dragX, -240, {
                        type: 'spring',
                        stiffness: 260,
                        damping: 30,
                        mass: 0.8,
                      });
                      answer(0);
                      return;
                    }
                    if (info.offset.x > 64) {
                      animate(dragX, 240, {
                        type: 'spring',
                        stiffness: 260,
                        damping: 30,
                        mass: 0.8,
                      });
                      answer(1);
                      return;
                    }
                    setIsDraggingCard(false);
                  }}
                  exit={cardExit}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 32,
                    mass: 0.8,
                    backgroundColor: { duration: 0.12 },
                    borderColor: { duration: 0.12 },
                    boxShadow: { duration: 0.12 },
                    filter: { duration: 0.16 },
                  }}
                  className="relative z-10 flex min-h-[336px] cursor-grab select-none flex-col items-center overflow-hidden rounded-[20px] border border-[var(--stroke)] bg-[radial-gradient(circle_at_50%_0%,rgba(51,144,236,0.12),transparent_42%),linear-gradient(180deg,var(--surface-strong),var(--surface))] px-4 pb-8 pt-7 text-center shadow-sm active:cursor-grabbing sm:min-h-[254px] sm:justify-center sm:rounded-[22px] sm:px-8 sm:py-7"
                >
                  <div className="absolute left-3 top-3 rounded-full border border-[var(--stroke)] bg-[var(--surface-strong)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-foreground/45 shadow-sm sm:left-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]">
                    Ряд {currentCard.rowIndex}
                  </div>
                  <div className="absolute right-3 top-3 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-primary sm:right-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]">
                    Свайп
                  </div>
                  <div className="mt-auto flex max-w-full items-center justify-center gap-x-1.5 whitespace-nowrap px-1 text-[clamp(2.05rem,10.4vw,3.2rem)] font-black leading-[1.02] text-foreground sm:mt-0 sm:gap-x-1 sm:text-[clamp(1.75rem,3.8vw,2.7rem)]">
                    <span className="min-w-0">{currentCard.before}</span>
                    <span
                      className="inline-flex h-[1.08em] min-w-[1.08em] items-center justify-center rounded-xl border-2 border-primary bg-white px-1 text-primary shadow-[0_10px_30px_rgba(51,144,236,0.22)] ring-4 ring-primary/10 dark:bg-[var(--surface-strong)]"
                    >
                      ?
                    </span>
                    <span className="min-w-0">{currentCard.after}</span>
                  </div>
                  {currentCard.contextHint && (
                    <div className="mt-4 max-w-full rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary sm:mt-3">
                      {currentCard.contextHint}
                    </div>
                  )}
                  <div className="mb-auto mt-12 flex min-h-[74px] w-full max-w-[286px] flex-col items-center justify-center rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-4 py-3 text-xs font-bold leading-5 text-foreground/55 shadow-sm sm:mb-0 sm:mt-6 sm:min-h-0 sm:max-w-none sm:rounded-full sm:px-3 sm:py-1">
                    <span className="sm:hidden">Свайпни карточку</span>
                    <span className="sm:hidden">или выбери</span>
                    <span className="sm:hidden">букву ниже</span>
                    <span className="hidden sm:inline">Свайпни карточку или выбери букву ниже</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-4">
              <button
                type="button"
                onClick={() => answer(0)}
                className="flex h-16 min-w-0 items-center justify-center gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-2 text-foreground shadow-sm transition hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className="text-lg font-black">{currentCard.choices[0]}</span>
                  <span className="max-w-full truncate text-xs font-bold text-foreground/50">
                    {choiceWords[0]}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => answer(1)}
                className="flex h-16 min-w-0 items-center justify-center gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-2 text-foreground shadow-sm transition hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98]"
              >
                <span className="flex min-w-0 flex-col items-end leading-tight">
                  <span className="text-lg font-black">{currentCard.choices[1]}</span>
                  <span className="max-w-full truncate text-xs font-bold text-foreground/50">
                    {choiceWords[1]}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-[10px] text-foreground/60 sm:mt-3 sm:text-[11px]">
              seed:{' '}
              <span className="font-mono select-all">
                {currentCard.seedKey ?? `id:${currentCard.sourceExerciseId ?? 'n/a'}`}
              </span>
            </p>
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
              className="h-12 w-full rounded-xl bg-primary px-4 text-base font-black text-white shadow-sm transition hover:bg-primary-strong"
            >
              Продолжить
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ResultCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3">
      <div className="text-xs font-bold uppercase text-foreground/50">{label}</div>
      <div className="mt-1 text-2xl font-black text-foreground">{value}</div>
    </div>
  );
}
