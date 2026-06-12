'use client';

import { useMemo, useState } from 'react';
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

export default function Ege20ComplexSentenceCard({
  exercise,
  disabled,
}: Props) {
  const availableIndexes = useMemo(
    () => extractSlotIndexes(exercise.payload.textWithSlots),
    [exercise.payload.textWithSlots],
  );

  const [selected, setSelected] = useState<number[]>([]);

  function toggleIndex(index: number) {
    setSelected((prev) => {
      if (prev.includes(index)) return prev.filter((v) => v !== index);
      return [...prev, index].sort((a, b) => a - b);
    });
  }

  return (
    <div className="mb-5 mt-2 rounded-xl border border-stroke bg-surface-strong p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/60">
        ЕГЭ-20 · знаки в сложном предложении
      </p>
      <p className="text-sm leading-6 text-foreground">{exercise.payload.textWithSlots}</p>
      <p className="mt-2 text-xs text-foreground/60">Укажите номера мест, где нужна запятая.</p>

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

