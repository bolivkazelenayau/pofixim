'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
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
    <div className="mb-5 mt-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Drag &amp; Drop · порядок фрагментов
      </p>
      <p className="mb-3 text-xs text-slate-500">
        Перетаскивайте карточки, чтобы собрать правильный порядок.
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
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {pos + 1}
            </span>
            {fragmentText(id)}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs text-slate-500">
          Текущий порядок: <span className="font-semibold text-slate-700">{displaySequence}</span>
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOrder(initialOrder)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Сбросить порядок
        </button>
        <motion.button
          whileTap={!disabled ? { scale: 0.98 } : {}}
          disabled={disabled}
          onClick={() =>
            onSubmit(
              { type: 'order_fragments', orderedFragmentIds: order },
              answerLabel,
            )
          }
          className="w-full rounded-xl bg-[#3390EC] px-5 py-3 font-bold text-white shadow-sm transition hover:bg-[#2A7BCA] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Проверить
        </motion.button>
      </div>
    </div>
  );
}
