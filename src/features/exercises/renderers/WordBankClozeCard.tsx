'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { SubmittedAnswer, WordBankClozeExercise } from '../schemas';

type WordBankClozeCardProps = {
  exercise: WordBankClozeExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

export default function WordBankClozeCard({
  exercise,
  disabled,
  onSubmit,
}: WordBankClozeCardProps) {
  const slotCount = exercise.payload.slotCount;
  const [activeSlot, setActiveSlot] = useState<number | null>(0);
  const [values, setValues] = useState<string[]>(() => Array(slotCount).fill(''));

  const parts = useMemo(() => {
    const slotRe = /\[\[(\d+)\]\]/g;
    const result: Array<{ kind: 'text'; value: string } | { kind: 'slot'; index: number }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = slotRe.exec(exercise.payload.textWithSlots)) !== null) {
      const start = match.index;
      const end = slotRe.lastIndex;
      if (start > lastIndex) {
        result.push({ kind: 'text', value: exercise.payload.textWithSlots.slice(lastIndex, start) });
      }
      const slotIndex = Number(match[1]) - 1;
      result.push({ kind: 'slot', index: slotIndex });
      lastIndex = end;
    }
    if (lastIndex < exercise.payload.textWithSlots.length) {
      result.push({ kind: 'text', value: exercise.payload.textWithSlots.slice(lastIndex) });
    }
    return result;
  }, [exercise.payload.textWithSlots]);

  const canSubmit = values.every((value) => value.trim().length > 0);

  const placeWord = (word: string) => {
    if (disabled) return;
    const slotToFill =
      activeSlot ?? values.findIndex((value) => value.trim().length === 0) ?? 0;
    if (slotToFill < 0) return;

    setValues((prev) => {
      const next = [...prev];
      next[slotToFill] = word;
      return next;
    });
    if (slotToFill < slotCount - 1) setActiveSlot(slotToFill + 1);
    else setActiveSlot(null);
  };

  const clearSlot = (index: number) => {
    if (disabled) return;
    setValues((prev) => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
    setActiveSlot(index);
  };

  const submit = () => {
    const normalized = values.map((v) => v.trim());
    onSubmit(
      { type: 'word_bank_cloze', values: normalized },
      normalized.join(' | '),
    );
  };

  return (
    <div
      className="mb-5 mt-2 rounded-2xl border border-stroke bg-surface-strong p-4 shadow-sm"
      onClick={() => setActiveSlot(null)}
    >
      <div className="text-[19px] leading-[2.35] text-foreground sm:text-[20px]">
        {parts.map((part, idx) => {
          if (part.kind === 'text') {
            return <span key={`t-${idx}`}>{part.value}</span>;
          }

          const value = values[part.index] ?? '';
          const isActive = activeSlot === part.index;
          return (
            <button
              key={`s-${idx}`}
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                setActiveSlot(part.index);
              }}
              className={`mx-1 inline-flex min-h-[28px] min-w-[78px] items-center justify-center rounded-lg border px-2 py-0.5 align-middle text-[14px] font-semibold transition ${
                value
                  ? 'border-blue-300 bg-blue-50 text-blue-900'
                  : 'border-stroke bg-surface text-foreground/60'
              } ${isActive ? 'ring-2 ring-blue-200' : ''}`}
            >
              {value || '_____'}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {exercise.payload.wordBank.map((word) => {
          return (
            <button
              key={word}
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                placeWord(word);
              }}
              className="rounded-full border border-cyan-400 bg-white px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-cyan-50 disabled:opacity-50"
            >
              {word}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={disabled || activeSlot === null}
          onClick={(event) => {
            event.stopPropagation();
            if (activeSlot !== null) clearSlot(activeSlot);
          }}
          className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 disabled:opacity-60"
        >
          Очистить слот
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            setValues(Array(slotCount).fill(''));
            setActiveSlot(0);
          }}
          className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 disabled:opacity-60"
        >
          Сбросить всё
        </button>
      </div>

      <motion.button
        whileTap={!disabled && canSubmit ? { scale: 0.98 } : {}}
        disabled={disabled || !canSubmit}
        onClick={(event) => {
          event.stopPropagation();
          submit();
        }}
        className="mt-4 w-full rounded-xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-[var(--stroke)] dark:disabled:bg-[var(--stroke)]"
      >
        Проверить
      </motion.button>
    </div>
  );
}
