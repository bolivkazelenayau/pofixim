'use client';

import { useMemo, useState } from 'react';
import type { Ege21PunctuationAnalysisExercise, SubmittedAnswer } from '../schemas';

type Ege21PunctuationAnalysisCardProps = {
  exercise: Ege21PunctuationAnalysisExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

const PUNCTUATION_LABEL: Record<
  Ege21PunctuationAnalysisExercise['payload']['targetPunctuation'],
  string
> = {
  comma: 'запятая',
  dash: 'тире',
  colon: 'двоеточие',
  semicolon: 'точка с запятой',
};

export default function Ege21PunctuationAnalysisCard({
  exercise,
  disabled,
}: Ege21PunctuationAnalysisCardProps) {
  const availableIndexes = useMemo(
    () =>
      exercise.payload.sentences
        .map((sentence) => sentence.index)
        .sort((a, b) => a - b),
    [exercise.payload.sentences],
  );

  const [selected, setSelected] = useState<number[]>([]);

  const inlineText = exercise.payload.sentences
    .map((sentence) => `(${sentence.index})${sentence.text}`)
    .join(' ');

  function toggleIndex(index: number) {
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((v) => v !== index);
      return [...prev, index].sort((a, b) => a - b);
    });
  }

  return (
    <div className="mb-5 mt-2 rounded-[28px] border border-stroke bg-surface-strong p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase text-foreground/60">
        ЕГЭ-21 · {PUNCTUATION_LABEL[exercise.payload.targetPunctuation]}
      </p>
      <p className="text-sm leading-6 text-foreground">{inlineText}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {availableIndexes.map((index) => {
          const active = selected.includes(index);
          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => toggleIndex(index)}
              className={`rounded-lg border px-3 py-1 text-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-stroke bg-surface text-foreground hover:border-primary hover:bg-stroke dark:hover:bg-stroke'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {index}
            </button>
          );
        })}
      </div>
    </div>
  );
}

