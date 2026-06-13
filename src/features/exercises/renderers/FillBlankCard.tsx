'use client';

import { useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import type { FillBlankExercise, SubmittedAnswer } from '../schemas';
import {
  Ege18TextLayout,
  parseEge18TextLayout,
  renderEge18TextWithBreaks,
} from './Ege18TextLayout';

type FillBlankCardProps = {
  exercise: FillBlankExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

export default function FillBlankCard({
  exercise,
  disabled,
  onSubmit,
}: FillBlankCardProps) {
  const [answerValue, setAnswerValue] = useState('');
  const isFullTextAnswer =
    exercise.skillTags.includes('ege.18') ||
    exercise.seedKey?.startsWith('ege18-bank-');
  const beforeLayout = parseEge18TextLayout(exercise.payload.before);
  const afterLayout = parseEge18TextLayout(exercise.payload.after);
  const trimmedAnswer = answerValue.trim();
  const canSubmit = Boolean(trimmedAnswer) && !disabled;

  function submitFullTextAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    onSubmit(
      { type: 'fill_blank', value: trimmedAnswer },
      trimmedAnswer,
    );
  }

  if (isFullTextAnswer) {
    return (
      <div
        className={cn(
          'mb-5 mt-2 rounded-[28px] border border-stroke bg-surface-strong p-4 shadow-sm',
          beforeLayout.centered && 'text-center',
        )}
      >
        <Ege18TextLayout
          text={exercise.payload.before}
          className="text-base font-medium leading-6 text-foreground sm:text-lg"
        />
        <form
          onSubmit={submitFullTextAnswer}
          className="mt-5 grid gap-2 border-t border-stroke pt-4 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input
            type="text"
            name={`fill-blank-answer-${exercise.id}`}
            value={answerValue}
            disabled={disabled}
            onChange={(event) => setAnswerValue(event.target.value)}
            placeholder="Введите цифры: 1467 или 1,4,6,7"
            className="h-11 w-full rounded-xl border border-stroke bg-surface px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-foreground/45 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          >
            Проверить
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mb-5 mt-2 rounded-[28px] border border-stroke bg-surface-strong p-4 shadow-sm">
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight text-foreground sm:text-2xl',
          (beforeLayout.centered || afterLayout.centered) && 'justify-center',
        )}
      >
        <span className="break-words">{renderEge18TextWithBreaks(beforeLayout.content)}</span>
        <span className="inline-block min-w-24 border-b-2 border-slate-300 px-2 text-center text-foreground/50">...</span>
        <span className="break-words">{renderEge18TextWithBreaks(afterLayout.content)}</span>
      </div>
    </div>
  );
}
