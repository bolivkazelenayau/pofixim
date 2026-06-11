'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { EgeMultiSelectExercise, SubmittedAnswer } from '../schemas';

type EgeMultiSelectCardProps = {
  exercise: EgeMultiSelectExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

export default function EgeMultiSelectCard({
  exercise,
  disabled,
  onSubmit,
}: EgeMultiSelectCardProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const canSubmit = selected.length > 0;
  const answerLabel = useMemo(
    () => [...selected].sort((a, b) => a - b).join(''),
    [selected],
  );

  function toggleOption(optionIndex: number) {
    setSelected((prev) =>
      prev.includes(optionIndex)
        ? prev.filter((idx) => idx !== optionIndex)
        : [...prev, optionIndex].sort((a, b) => a - b),
    );
  }

  return (
    <div className="mb-5 mt-2 rounded-2xl border border-stroke bg-surface-strong p-3 shadow-sm sm:p-4">
      <div className="mb-3 grid grid-cols-1 gap-2">
        {exercise.payload.options.map((option, idx) => {
          const optionIndex = idx + 1;
          const checked = selected.includes(optionIndex);
          return (
            <label
              key={`${exercise.id}-${optionIndex}`}
              className={`flex h-full cursor-pointer items-start gap-2.5 rounded-xl border px-2.5 py-2 transition sm:gap-3 sm:px-3 ${
                checked
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-stroke bg-surface hover:bg-surface-strong'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleOption(optionIndex)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-stroke accent-primary"
              />
              <span className="text-sm leading-5 text-foreground break-words">
                <span className="mr-1 font-semibold">{optionIndex})</span>
                {option}
              </span>
            </label>
          );
        })}
      </div>
      <motion.button
        whileTap={!disabled && canSubmit ? { scale: 0.96 } : {}}
        disabled={disabled || !canSubmit}
        onClick={() =>
          onSubmit(
            { type: 'ege_multi_select', selectedOptionIndexes: selected },
            answerLabel,
          )
        }
        className="w-full rounded-xl bg-primary px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
      >
        Проверить
      </motion.button>
    </div>
  );
}
