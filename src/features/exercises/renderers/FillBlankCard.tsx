'use client';

import type { FillBlankExercise, SubmittedAnswer } from '../schemas';

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
  return (
    <div className="mb-5 mt-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight text-slate-800 sm:text-2xl">
        <span className="break-words">{exercise.payload.before}</span>
        <span className="inline-block min-w-24 border-b-2 border-slate-300 px-2 text-center text-slate-400">...</span>
        <span className="break-words">{exercise.payload.after}</span>
      </div>
    </div>
  );
}
