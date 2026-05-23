'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type {
  Ege20ComplexSentencePunctuationExercise,
  SubmittedAnswer,
} from '../schemas';

type Props = {
  exercise: Ege20ComplexSentencePunctuationExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

function extractSlotIndexes(textWithSlots: string) {
  const matches = [...textWithSlots.matchAll(/\((\d{1,2})\)/g)];
  const set = new Set<number>();
  for (const m of matches) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

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

export default function Ege20ComplexSentenceCard({
  exercise,
  disabled,
  onSubmit,
}: Props) {
  const availableIndexes = useMemo(
    () => extractSlotIndexes(exercise.payload.textWithSlots),
    [exercise.payload.textWithSlots],
  );

  const [selected, setSelected] = useState<number[]>([]);
  const value = useMemo(() => selected.join(''), [selected]);
  const trimmed = value.trim();


  function toggleIndex(index: number) {
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((v) => v !== index);
      return [...prev, index].sort((a, b) => a - b);
    });
  }

  return (
    <div className="mb-5 mt-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        ЕГЭ-20 · знаки в сложном предложении
      </p>
      <p className="text-sm leading-6 text-slate-800">{exercise.payload.textWithSlots}</p>
      <p className="mt-2 text-xs text-slate-500">Укажите номера мест, где нужна запятая.</p>

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

