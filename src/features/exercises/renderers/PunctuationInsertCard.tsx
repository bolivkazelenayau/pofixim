'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import type { PunctuationInsertExercise, SubmittedAnswer } from '../schemas';
import type { PunctuationMark } from '../types';

type PunctuationInsertCardProps = {
  exercise: PunctuationInsertExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

type PlacedMark = {
  afterTokenIndex: number;
  mark: PunctuationMark;
};

export default function PunctuationInsertCard({
  exercise,
  disabled,
  onSubmit,
}: PunctuationInsertCardProps) {
  const [marks, setMarks] = useState<PlacedMark[]>([]);
  const primaryMark = exercise.payload.allowedMarks[0] ?? ',';

  const toggleMark = (afterTokenIndex: number) => {
    if (disabled) return;

    setMarks((current) => {
      const alreadyPlaced = current.some(
        (mark) =>
          mark.afterTokenIndex === afterTokenIndex && mark.mark === primaryMark,
      );

      if (alreadyPlaced) {
        return current.filter(
          (mark) =>
            !(
              mark.afterTokenIndex === afterTokenIndex &&
              mark.mark === primaryMark
            ),
        );
      }

      return [...current, { afterTokenIndex, mark: primaryMark }];
    });
  };

  const sortedMarks = [...marks].sort(
    (a, b) => a.afterTokenIndex - b.afterTokenIndex,
  );

  return (
    <div className="mt-2 mb-5 rounded-xl border border-stroke bg-surface-strong p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/50">
        Выбери место для знака препинания
      </p>

      <div className="flex flex-wrap items-center gap-y-1.5 text-[17px] font-semibold leading-7 text-foreground">
        {exercise.payload.tokens.map((token, idx) => {
          const hasMark = marks.some(
            (mark) =>
              mark.afterTokenIndex === idx && mark.mark === primaryMark,
          );
          const isLast = idx === exercise.payload.tokens.length - 1;

          return (
            <span key={`${token}-${idx}`} className="inline-flex items-center">
              <span>{token}</span>
              {!isLast && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleMark(idx)}
                  className={`mx-1 inline-flex h-8 min-w-8 items-center justify-center rounded-lg border text-sm font-black transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                    hasMark
                      ? 'border-amber-400 bg-amber-100 text-amber-800 shadow-inner'
                      : 'border-dashed border-stroke bg-surface text-foreground/50 hover:border-amber-300 hover:bg-stroke hover:text-amber-500 dark:hover:bg-stroke'
                  } disabled:opacity-60`}
                  aria-label={`Поставить знак после слова ${token}`}
                >
                  {hasMark ? primaryMark : '·'}
                </button>
              )}
            </span>
          );
        })}
      </div>

      <motion.button
        whileTap={!disabled ? { scale: 0.96 } : {}}
        disabled={disabled}
        onClick={() => {
          let label = '';
          exercise.payload.tokens.forEach((token, idx) => {
            label += token;
            const mark = sortedMarks.find((m) => m.afterTokenIndex === idx);
            if (mark) {
              label += mark.mark;
            }
            if (idx < exercise.payload.tokens.length - 1) {
              label += ' ';
            }
          });
          onSubmit({ type: 'punctuation_insert', marks: sortedMarks }, label);
        }}
        className="mt-5 w-full rounded-xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:bg-[var(--stroke)] dark:disabled:bg-[var(--stroke)]"
      >
        Проверить пунктуацию
      </motion.button>
    </div>
  );
}
