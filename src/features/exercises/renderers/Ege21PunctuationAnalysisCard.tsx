'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
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

function normalizeDigits(input: string, availableIndexes: number[]) {
  return [
    ...new Set(
      input
        .replace(/[^\d]/g, '')
        .split('')
        .map((v) => Number(v))
        .filter(
          (n) =>
            Number.isInteger(n) &&
            n > 0 &&
            availableIndexes.includes(n),
        ),
    ),
  ].sort((a, b) => a - b);
}

export default function Ege21PunctuationAnalysisCard({
  exercise,
  disabled,
  onSubmit,
}: Ege21PunctuationAnalysisCardProps) {
  const availableIndexes = useMemo(
    () =>
      exercise.payload.sentences
        .map((sentence) => sentence.index)
        .sort((a, b) => a - b),
    [exercise.payload.sentences],
  );

  const [selected, setSelected] = useState<number[]>([]);
  const value = useMemo(() => selected.join(''), [selected]);
  const trimmed = value.trim();

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
    <div className="mb-5 mt-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        ЕГЭ-21 · {PUNCTUATION_LABEL[exercise.payload.targetPunctuation]}
      </p>
      <p className="text-sm leading-6 text-slate-800">{inlineText}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {availableIndexes.map((index) => {
          const active = selected.includes(index);
          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => toggleIndex(index)}
              className={`rounded-lg border px-3 py-1 text-sm transition ${
                active
                  ? 'border-[#3390EC] bg-[#3390EC] text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-[#3390EC]'
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

