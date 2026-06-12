'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BadgeCheck, Trophy, X } from 'lucide-react';
import type { Ege15QuickCard } from '@/features/exercises/ege15Quick';
import { refreshEge15QuickCardAction } from '@/app/actions/exercises';

type Ege15QuickGameProps = {
  cards: Ege15QuickCard[];
  onClose: () => void;
  onFinish: (result: Ege15QuickResult) => void;
};

export type Ege15QuickResult = {
  correctCount: number;
  wrongCount: number;
  bestCombo: number;
  scoreDelta: number;
};

function scoreForAnswer(combo: number) {
  return 8 + (combo > 0 && combo % 8 === 0 ? 20 : 0);
}

export default function Ege15QuickGame({
  cards,
  onClose,
  onFinish,
}: Ege15QuickGameProps) {
  const [status, setStatus] = useState<'offer' | 'running' | 'finished'>('offer');
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [isAnswerLocked, setIsAnswerLocked] = useState(false);
  const [localCards, setLocalCards] = useState<Ege15QuickCard[]>(cards);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const finishedRef = useRef(false);
  const answerLockedRef = useRef(false);

  const currentCard = localCards[index % Math.max(localCards.length, 1)];
  const wordLength = currentCard ? currentCard.before.length + 1 + currentCard.after.length : 0;
  const tokenFontClass = wordLength > 18
    ? 'text-[clamp(1.25rem,5.7vw,2rem)] sm:text-[2rem]'
    : wordLength > 12
      ? 'text-[clamp(1.55rem,6.8vw,2.45rem)] sm:text-[2.35rem]'
      : 'text-[clamp(2rem,9.5vw,3.05rem)] sm:text-[2.85rem]';

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setStatus('finished');
    onFinish({
      correctCount,
      wrongCount,
      bestCombo,
      scoreDelta,
    });
  }, [bestCombo, correctCount, onFinish, scoreDelta, wrongCount]);

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
    const res = await refreshEge15QuickCardAction({
      exerciseId: currentCard.sourceExerciseId,
      cardId: currentCard.id,
      positionIndex: currentCard.positionIndex,
    });
    if (res.success && res.card) {
      setLocalCards((prev) =>
        prev.map((c) => (c.id === currentCard.id ? res.card! : c)),
      );
    }
    setIsRefreshing(false);
  }, [currentCard, isRefreshing]);

  useEffect(() => {
    if (!isAnswerLocked) return;

    const onFocus = () => {
      void handleRefresh();
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isAnswerLocked, handleRefresh]);

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:px-3 sm:py-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        className="relative flex max-h-[94svh] w-full max-w-[540px] flex-col overflow-hidden rounded-t-[22px] border border-white/75 bg-[var(--surface-strong)] shadow-xl sm:max-h-[92vh] sm:rounded-[22px]"
        role="dialog"
        aria-modal="true"
        aria-label="Быстрый тип 15"
      >
        <button
          type="button"
          onClick={status === 'running' ? finish : onClose}
          className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] text-foreground/70 transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke"
          aria-label="Close quick game"
          title="Закрыть"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {status === 'offer' && (
          <div className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3 pr-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black leading-tight text-foreground">Тип 15 быстро</h2>
                <p className="mt-1 text-sm leading-5 text-foreground/65">
                  Выбери, сколько Н пишется в отмеченной позиции.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={start}
              disabled={localCards.length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform,opacity] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
            >
              <BadgeCheck className="h-5 w-5" />
              Старт
            </button>
          </div>
        )}

        {status === 'running' && currentCard && (
          <div className="flex flex-1 flex-col p-3 sm:p-5">
            <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2 pr-9 sm:mb-4 sm:pr-10">
              {combo > 0 && (
                <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black tabular-nums text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20 sm:px-3 sm:text-sm">
                  x{combo}
                </div>
              )}
              {!combo && <div />}
              <div className="justify-self-end rounded-full bg-sky-50 px-2.5 py-1 text-xs font-black tabular-nums text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/20 sm:px-3 sm:text-sm">
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
                  {currentCard.positionIndex ? `Позиция ${currentCard.positionIndex}` : 'Позиция'}
                </div>
                <div className={`${tokenFontClass} font-black leading-none text-foreground`}>
                  <span>{currentCard.before}</span>
                  <span className="mx-1 inline-flex h-[1.08em] min-w-[1.08em] translate-y-[0.08em] items-center justify-center rounded-xl border-2 border-primary bg-white px-1 text-primary shadow-[0_10px_30px_rgba(51,144,236,0.22)] ring-4 ring-primary/10 dark:bg-[var(--surface-strong)]">
                    ?
                  </span>
                  <span>{currentCard.after}</span>
                </div>
                <p className="mx-auto mt-5 max-w-[440px] text-sm font-semibold leading-6 text-foreground/72 sm:text-base sm:leading-7">
                  {renderContext(currentCard.context)}
                </p>
                {currentCard.explanationSnippet && lastAnswerCorrect !== null && (
                  <p className="mx-auto mt-5 max-w-[440px] rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-semibold leading-5 text-foreground/65">
                    {currentCard.explanationSnippet}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {isAnswerLocked ? (
              <div className="mt-3 sm:mt-4">
                <button
                  type="button"
                  onClick={nextCard}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] sm:text-lg"
                >
                  Далее
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4">
                <ChoiceButton
                  label={currentCard.choices[0]}
                  icon="left"
                  disabled={false}
                  onClick={() => answer(0)}
                />
                <ChoiceButton
                  label={currentCard.choices[1]}
                  icon="right"
                  disabled={false}
                  onClick={() => answer(1)}
                />
              </div>
            )}

            <div className="mt-2 text-[10px] text-foreground/60 sm:mt-3 sm:text-[11px]">
              <p>
                seed:{' '}
                <span className="font-mono select-all">
                  {currentCard.seedKey ?? `id:${currentCard.sourceExerciseId ?? 'n/a'}`}
                </span>
              </p>
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
                <h2 className="text-xl font-black leading-tight text-foreground">Тип 15 завершён</h2>
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
              Готово
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function renderContext(value: string) {
  const parts = value.split(/(\(\?\))/u);

  return parts.map((part, index) =>
    part === '(?)' ? (
      <span
        key={`${part}-${index}`}
        className="mx-0.5 inline-flex h-[1.2em] min-w-[1.2em] translate-y-[0.14em] items-center justify-center rounded-md border border-primary/45 bg-primary/10 px-1 text-[0.78em] font-black leading-none text-primary"
      >
        ?
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function ChoiceButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = icon === 'left' ? ArrowLeft : ArrowRight;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-14 min-w-0 items-center justify-center gap-2 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 text-base font-black text-foreground shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/60 hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-70 dark:hover:bg-stroke sm:text-lg"
    >
      {icon === 'left' && <Icon className="h-4 w-4 text-foreground/50" aria-hidden="true" />}
      <span className="truncate">{label}</span>
      {icon === 'right' && <Icon className="h-4 w-4 text-foreground/50" aria-hidden="true" />}
    </button>
  );
}

function ResultCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-foreground/45">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</div>
    </div>
  );
}
