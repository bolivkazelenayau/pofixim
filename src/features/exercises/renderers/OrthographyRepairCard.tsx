'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { OrthographyRepairExercise, SubmittedAnswer } from '../schemas';

type Props = {
  exercise: OrthographyRepairExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

type Target = OrthographyRepairExercise['payload']['targets'][number];
type Segment =
  | { kind: 'text'; text: string; key: string }
  | { kind: 'target'; text: string; key: string; target: Target };

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueOptions(target: Target, correct: string) {
  const seen = new Set<string>();
  return [target.replacement, correct, ...(target.options ?? [])]
    .map((option) => option.trim())
    .filter((option) => {
      const key = normalize(option);
      if (!option || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findOccurrence(text: string, surface: string, occurrence = 1) {
  let cursor = 0;
  let foundCount = 0;
  while (cursor <= text.length) {
    const foundAt = text.indexOf(surface, cursor);
    if (foundAt === -1) return -1;
    foundCount += 1;
    if (foundCount === occurrence) return foundAt;
    cursor = foundAt + surface.length;
  }
  return -1;
}

function buildSegments(text: string, targets: Target[]): Segment[] {
  const ranges = targets
    .map((target, order) => {
      const start = findOccurrence(text, target.surface, target.occurrence);
      return {
        target,
        order,
        start,
        end: start + target.surface.length,
      };
    })
    .filter((range) => range.start >= 0)
    .sort((left, right) =>
      left.start === right.start ? left.order - right.order : left.start - right.start,
    );

  const segments: Segment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) {
      segments.push({
        kind: 'text',
        text: text.slice(cursor, range.start),
        key: `text-${cursor}-${range.start}`,
      });
    }
    segments.push({
      kind: 'target',
      text: text.slice(range.start, range.end),
      key: `target-${range.target.id}`,
      target: range.target,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({
      kind: 'text',
      text: text.slice(cursor),
      key: `text-${cursor}-${text.length}`,
    });
  }
  return segments;
}

function splitTextChunk(text: string) {
  return text.split(/(\s+|[,.!?;:()[\]«»"“”]+)/u).filter((part) => part.length > 0);
}

export default function OrthographyRepairCard({
  exercise,
  disabled,
  onSubmit,
}: Props) {
  const segments = useMemo(
    () => buildSegments(exercise.payload.text, exercise.payload.targets),
    [exercise.payload.text, exercise.payload.targets],
  );
  const correctByTarget = useMemo(
    () =>
      new Map(
        exercise.answer.repairs.map((repair) => [repair.targetId, repair.correct]),
      ),
    [exercise.answer.repairs],
  );
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [repairs, setRepairs] = useState<Record<string, string>>({});
  const [wrongClickKey, setWrongClickKey] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSelectedTargetId(null);
    setRepairs({});
    setWrongClickKey(null);
    setChecked(false);
  }, [exercise.id, exercise.seedKey]);

  const selectedTarget = exercise.payload.targets.find(
    (target) => target.id === selectedTargetId,
  );
  const repairedCount = Object.keys(repairs).length;
  const expectedCount = exercise.answer.repairs.length;
  const canSubmit = repairedCount === expectedCount;

  function markWrongClick(key: string) {
    setWrongClickKey(key);
    window.setTimeout(() => setWrongClickKey((current) => (current === key ? null : current)), 650);
  }

  function chooseTarget(target: Target) {
    if (disabled) return;
    setSelectedTargetId(target.id);
    setChecked(false);
  }

  function chooseRepair(value: string) {
    if (!selectedTarget || disabled) return;
    setRepairs((current) => ({
      ...current,
      [selectedTarget.id]: value,
    }));
    setSelectedTargetId(null);
    setChecked(false);
  }

  function reset() {
    setRepairs({});
    setSelectedTargetId(null);
    setChecked(false);
  }

  function renderAnswerText() {
    return segments
      .map((segment) => {
        if (segment.kind === 'text') return segment.text;
        return repairs[segment.target.id] ?? segment.text;
      })
      .join('');
  }

  function submit() {
    const submittedRepairs = Object.entries(repairs).map(([targetId, value]) => ({
      targetId,
      value,
    }));
    setChecked(true);
    onSubmit(
      { type: 'orthography_repair', repairs: submittedRepairs },
      renderAnswerText(),
    );
  }

  return (
    <div className="mb-5 mt-2 rounded-2xl border border-stroke bg-surface-strong p-4 shadow-sm">
      <div className="rounded-xl border border-stroke bg-surface px-3 py-3 text-lg font-medium leading-9 text-foreground">
        {segments.map((segment) => {
          if (segment.kind === 'target') {
            const repair = repairs[segment.target.id];
            const correct = correctByTarget.get(segment.target.id);
            const isSelected = selectedTargetId === segment.target.id;
            const isCorrect = checked && repair && normalize(repair) === normalize(correct ?? '');
            const isWrong = checked && repair && !isCorrect;
            return (
              <button
                key={segment.key}
                type="button"
                disabled={disabled}
                onClick={() => chooseTarget(segment.target)}
                className={`rounded-md border px-0.5 py-0.5 transition ${
                  isCorrect
                    ? 'mx-0.5 border-emerald-400 bg-emerald-50 px-1.5 font-bold text-emerald-900'
                    : isWrong
                      ? 'mx-0.5 border-rose-400 bg-rose-50 px-1.5 font-bold text-rose-900'
                      : repair
                        ? 'mx-0.5 border-cyan-300 bg-cyan-50 px-1.5 font-bold text-cyan-950'
                        : isSelected
                          ? 'mx-0.5 border-amber-400 bg-amber-100 px-1.5 font-bold text-amber-950 ring-2 ring-amber-200'
                          : 'border-transparent bg-transparent text-foreground hover:bg-surface-strong'
                }`}
              >
                {repair ?? segment.text}
              </button>
            );
          }

          return splitTextChunk(segment.text).map((part, index) => {
            const key = `${segment.key}-${index}`;
            const isWord = /[\p{L}\d]/u.test(part);
            if (!isWord) return <span key={key}>{part}</span>;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => markWrongClick(key)}
                className={`rounded px-0.5 transition ${
                  wrongClickKey === key
                    ? 'bg-rose-100 text-rose-900 ring-2 ring-rose-200'
                    : 'hover:bg-surface-strong'
                }`}
                title="Это не отмеченный фрагмент"
              >
                {part}
              </button>
            );
          });
        })}
      </div>

      {selectedTarget ? (
        <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-3">
          <div className="mb-2 text-sm font-semibold text-cyan-950">
            Исправьте: <span className="font-bold">«{selectedTarget.surface}»</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueOptions(selectedTarget, correctByTarget.get(selectedTarget.id) ?? selectedTarget.replacement).map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => chooseRepair(option)}
                className="rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-cyan-500 hover:bg-cyan-100"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={disabled || repairedCount === 0}
          onClick={reset}
          className="rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 disabled:opacity-60"
        >
          Сбросить
        </button>
        <motion.button
          whileTap={!disabled ? { scale: 0.98 } : {}}
          disabled={disabled || !canSubmit}
          onClick={submit}
          className="min-w-0 flex-1 rounded-xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-[var(--stroke)] dark:disabled:bg-[var(--stroke)]"
        >
          Проверить
        </motion.button>
      </div>
    </div>
  );
}
