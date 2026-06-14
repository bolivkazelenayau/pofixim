'use client';

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PRESS_TAP, whenMotion } from '@/lib/motion';
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

const HANGING_WORDS = new Set([
  'а',
  'в',
  'во',
  'и',
  'к',
  'ко',
  'о',
  'об',
  'обо',
  'с',
  'со',
  'у',
  'без',
  'до',
  'для',
  'за',
  'из',
  'на',
  'не',
  'ни',
  'но',
  'от',
  'по',
  'под',
  'при',
  'про',
]);

function isWordPart(part: string) {
  return /[\p{L}\d]/u.test(part);
}

function shouldKeepWithNext(parts: string[], index: number) {
  const word = parts[index]?.toLowerCase();
  const space = parts[index + 1];
  const nextWord = parts[index + 2];
  return Boolean(
    word &&
      space &&
      nextWord &&
      HANGING_WORDS.has(word) &&
      /^\s+$/u.test(space) &&
      isWordPart(nextWord),
  );
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
  const shouldReduceMotion = useReducedMotion();

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

  function renderWrongWordButton(part: string, key: string) {
    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        onClick={() => markWrongClick(key)}
        className={`rounded px-0.5 transition-[background-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          wrongClickKey === key
            ? 'bg-rose-100 text-rose-900 ring-2 ring-rose-200 dark:bg-rose-300/12 dark:text-rose-100 dark:ring-rose-300/20'
            : 'hover:bg-stroke dark:hover:bg-stroke'
        }`}
        title="Это не отмеченный фрагмент"
      >
        {part}
      </button>
    );
  }

  return (
    <div className="mb-5 mt-2 rounded-[28px] border border-stroke bg-surface-strong p-4 shadow-sm">
      <div className="rounded-xl border border-stroke bg-surface px-3 py-3 text-pretty text-lg font-medium leading-9 text-foreground">
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
                className={`rounded-md border px-0.5 py-0.5 transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  isCorrect
                    ? 'mx-0.5 border-emerald-400 bg-emerald-50 px-1.5 font-bold text-emerald-900 dark:border-emerald-300/60 dark:bg-emerald-300/12 dark:text-emerald-100'
                    : isWrong
                      ? 'mx-0.5 border-rose-400 bg-rose-50 px-1.5 font-bold text-rose-900 dark:border-rose-300/60 dark:bg-rose-300/12 dark:text-rose-100'
                      : repair
                        ? 'mx-0.5 border-amber-300 bg-amber-50 px-1.5 font-bold text-amber-950 dark:border-amber-300/45 dark:bg-amber-300/12 dark:text-amber-100'
                        : isSelected
                          ? 'mx-0.5 border-amber-400 bg-amber-100 px-1.5 font-bold text-amber-950 ring-2 ring-amber-200 dark:border-amber-300 dark:bg-amber-300/18 dark:text-amber-100 dark:ring-amber-300/20'
                          : 'border-transparent bg-transparent text-foreground hover:bg-stroke dark:hover:bg-stroke'
                }`}
              >
                {repair ?? segment.text}
              </button>
            );
          }

          const parts = splitTextChunk(segment.text);
          const renderedParts = [];

          for (let index = 0; index < parts.length; index += 1) {
            const part = parts[index];
            const key = `${segment.key}-${index}`;
            if (isWordPart(part) && shouldKeepWithNext(parts, index)) {
              const nextWordIndex = index + 2;
              renderedParts.push(
                <span key={`${key}-nowrap`} className="whitespace-nowrap">
                  {renderWrongWordButton(part, key)}
                  <span>{parts[index + 1]}</span>
                  {renderWrongWordButton(
                    parts[nextWordIndex],
                    `${segment.key}-${nextWordIndex}`,
                  )}
                </span>,
              );
              index = nextWordIndex;
              continue;
            }

            renderedParts.push(
              isWordPart(part) ? renderWrongWordButton(part, key) : <span key={key}>{part}</span>,
            );
          }

          return renderedParts;
        })}
      </div>

      {selectedTarget ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.55)] dark:border-amber-300/20 dark:bg-amber-300/10 dark:shadow-none">
          <div className="mb-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
            Исправьте: <span className="font-bold">«{selectedTarget.surface}»</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueOptions(selectedTarget, correctByTarget.get(selectedTarget.id) ?? selectedTarget.replacement).map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => chooseRepair(option)}
                className="rounded-lg border border-amber-300/70 bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:border-amber-500 hover:bg-amber-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-amber-300/25 dark:bg-foreground/5 dark:text-amber-50 dark:hover:border-amber-300/70 dark:hover:bg-amber-300/10"
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
          className="rounded-lg rounded-bl-2xl border border-stroke bg-surface-strong px-3 py-2 text-sm font-semibold text-foreground/80 transition-[background-color,border-color,opacity,transform] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface-strong disabled:active:scale-100 dark:hover:bg-stroke dark:disabled:hover:bg-surface-strong"
        >
          Сбросить
        </button>
        <motion.button
          whileTap={whenMotion(!disabled && !shouldReduceMotion, PRESS_TAP)}
          disabled={disabled || !canSubmit}
          onClick={submit}
          className="min-w-0 flex-1 rounded-xl rounded-br-2xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:bg-[var(--stroke)] dark:disabled:bg-[var(--stroke)]"
        >
          Проверить
        </motion.button>
      </div>
    </div>
  );
}
