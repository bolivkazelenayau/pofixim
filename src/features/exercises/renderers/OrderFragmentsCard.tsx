'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PRESS_TAP, whenMotion } from '@/lib/motion';
import type { OrderFragmentsExercise, SubmittedAnswer } from '../schemas';

type Props = {
  exercise: OrderFragmentsExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffledDeterministic(ids: string[], seed: string) {
  const out = [...ids];
  let x = hashString(seed) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    x = (1664525 * x + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function OrderFragmentsCard({ exercise, disabled, onSubmit }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const initialOrder = useMemo(() => {
    const ids = exercise.payload.fragments.map((f) => f.id);
    if (ids.length <= 1) return ids;

    const seed = `${exercise.seedKey ?? exercise.id ?? 'order'}:${ids.join('|')}`;
    const shuffled = shuffledDeterministic(ids, seed);

    // If shuffle accidentally matches original order, rotate by one.
    const same = shuffled.every((id, idx) => id === ids[idx]);
    if (same) {
      return [...ids.slice(1), ids[0]];
    }
    return shuffled;
  }, [exercise.id, exercise.payload.fragments, exercise.seedKey]);
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [dragId, setDragId] = useState<string | null>(null);

  function move(fromId: string, toId: string) {
    if (fromId === toId) return;
    setOrder((prev) => {
      const from = prev.indexOf(fromId);
      const to = prev.indexOf(toId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function moveByIndex(index: number, direction: -1 | 1) {
    setOrder((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function fragmentText(id: string) {
    return exercise.payload.fragments.find((f) => f.id === id)?.text ?? id;
  }

  const displaySequence = order
    .map((id) => {
      const idx = exercise.payload.fragments.findIndex((f) => f.id === id);
      return idx >= 0 ? String(idx + 1) : id;
    })
    .join(' ');

  const answerLabel = order.map(id => fragmentText(id)).join(' ');

  return (
    <div className="mb-5 mt-2 rounded-[28px] border border-stroke bg-surface-strong p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold text-foreground/60">
        Порядок фрагментов
      </p>
      <p className="mb-3 text-pretty text-xs text-foreground/60">
        Перетаскивайте карточки или используйте кнопки вверх/вниз.
      </p>
      <div className="space-y-2">
        {order.map((id, pos) => (
          <div
            key={id}
            draggable={!disabled}
            onDragStart={() => setDragId(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (disabled || !dragId) return;
              move(dragId, id);
              setDragId(null);
            }}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-stroke bg-surface px-3 py-2 text-sm text-foreground transition-[background-color,border-color] duration-150 ease-out hover:bg-stroke dark:hover:bg-stroke"
          >
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-slate-200 font-mono text-xs font-semibold text-foreground/80">
              {pos + 1}
            </span>
            <span className="min-w-0 text-pretty leading-5">{fragmentText(id)}</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={disabled || pos === 0}
                onClick={() => moveByIndex(pos, -1)}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-stroke bg-surface-strong text-xs font-bold text-foreground/70 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`Переместить фрагмент ${pos + 1} выше`}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || pos === order.length - 1}
                onClick={() => moveByIndex(pos, 1)}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-stroke bg-surface-strong text-xs font-bold text-foreground/70 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={`Переместить фрагмент ${pos + 1} ниже`}
              >
                ↓
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs text-foreground/60">
          Текущий порядок: <span className="font-semibold text-foreground/80">{displaySequence}</span>
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOrder(initialOrder)}
          className="w-full rounded-xl border border-stroke bg-surface-strong px-4 py-2 text-sm font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface-strong dark:hover:bg-stroke dark:disabled:hover:bg-surface-strong"
        >
          Сбросить порядок
        </button>
        <motion.button
          whileTap={whenMotion(!disabled && !shouldReduceMotion, PRESS_TAP)}
          disabled={disabled}
          onClick={() =>
            onSubmit(
              { type: 'order_fragments', orderedFragmentIds: order },
              answerLabel,
            )
          }
          className="w-full rounded-xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:bg-[var(--stroke)] dark:disabled:bg-[var(--stroke)]"
        >
          Проверить
        </motion.button>
      </div>
    </div>
  );
}
