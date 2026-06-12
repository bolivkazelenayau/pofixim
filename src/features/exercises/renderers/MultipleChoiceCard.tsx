'use client';

import { motion } from 'motion/react';
import type { MultipleChoiceExercise, SubmittedAnswer } from '../schemas';

type MultipleChoiceCardProps = {
  exercise: MultipleChoiceExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

export default function MultipleChoiceCard({
  exercise,
  disabled,
  onSubmit,
}: MultipleChoiceCardProps) {
  return (
    <div className="mb-5 mt-2 flex w-full flex-col gap-2">
      {exercise.payload.options.map((option, idx) => (
        <motion.button
          key={`${exercise.id}-${idx}`}
          whileTap={!disabled ? { scale: 0.96 } : {}}
          onClick={() =>
            onSubmit(
              { type: 'multiple_choice', selectedOptionIndex: idx },
              option,
            )
          }
          disabled={disabled}
          className="w-full rounded-xl border border-stroke bg-surface-strong px-4 py-3.5 text-left font-medium text-foreground/80 shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface-strong dark:hover:bg-stroke dark:disabled:hover:bg-surface-strong sm:px-5"
        >
          {option}
        </motion.button>
      ))}
    </div>
  );
}
