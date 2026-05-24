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
    <div className="flex flex-col gap-2 w-full mt-2 mb-5">
      {exercise.payload.options.map((option, idx) => (
        <motion.button
          key={`${exercise.id}-${idx}`}
          whileHover={!disabled ? { scale: 1.01 } : {}}
          whileTap={!disabled ? { scale: 0.98 } : {}}
          onClick={() =>
            onSubmit(
              { type: 'multiple_choice', selectedOptionIndex: idx },
              option,
            )
          }
          disabled={disabled}
          className="w-full text-left px-5 py-3.5 rounded-xl border border-stroke bg-surface-strong hover:bg-surface disabled:opacity-60 disabled:hover:bg-white text-foreground/80 shadow-sm font-medium transition-all"
        >
          {option}
        </motion.button>
      ))}
    </div>
  );
}
