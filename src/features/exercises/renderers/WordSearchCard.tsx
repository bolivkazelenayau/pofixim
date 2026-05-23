'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { SubmittedAnswer, WordSearchExercise } from '../schemas';

type WordSearchCardProps = {
  exercise: WordSearchExercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
};

type Cell = { r: number; c: number };
type FoundPath = { word: string; cells: Cell[] };

export default function WordSearchCard({
  exercise,
  disabled,
  onSubmit,
}: WordSearchCardProps) {
  const expectedMap = useMemo(() => {
    const normalize = (value: string) => {
      const trimmed = value.trim().replace(/\s+/g, ' ');
      return exercise.answer.caseSensitive ? trimmed : trimmed.toLowerCase();
    };

    const unique = [...new Set(exercise.answer.words.map((w) => w.trim()))].filter(Boolean);
    const map = new Map<string, string>();
    for (const word of unique) map.set(normalize(word), word);
    return map;
  }, [exercise.answer.words, exercise.answer.caseSensitive]);

  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundPaths, setFoundPaths] = useState<FoundPath[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPath, setDragPath] = useState<Cell[]>([]);

  const cols = exercise.payload.grid[0]?.length ?? 1;
  const foundSet = useMemo(() => new Set(foundWords), [foundWords]);

  const sameDirection = (path: Cell[], next: Cell) => {
    if (path.length < 2) return true;
    const a = path[0];
    const b = path[1];
    const dirR = Math.sign(b.r - a.r);
    const dirC = Math.sign(b.c - a.c);
    const prev = path[path.length - 1];
    return Math.sign(next.r - prev.r) === dirR && Math.sign(next.c - prev.c) === dirC;
  };

  const canStep = (from: Cell, to: Cell) => {
    const dR = Math.abs(to.r - from.r);
    const dC = Math.abs(to.c - from.c);
    if (dR === 0 && dC === 0) return false;
    if (dR > 1 || dC > 1) return false;

    const allowDiagonal = exercise.payload.allowDiagonal ?? true;
    if (!allowDiagonal && dR === 1 && dC === 1) return false;
    return true;
  };

  const commitPath = useCallback(
    (cells: Cell[]) => {
      if (disabled || cells.length < 2) return;

      const normalize = (value: string) => {
        const trimmed = value.trim().replace(/\s+/g, ' ');
        return exercise.answer.caseSensitive ? trimmed : trimmed.toLowerCase();
      };

      const direct = cells.map(({ r, c }) => exercise.payload.grid[r]?.[c] ?? '').join('');
      const reverse = [...direct].reverse().join('');
      const allowReverse = exercise.payload.allowReverse ?? true;
      const candidates = allowReverse ? [direct, reverse] : [direct];

      let matchedDisplay: string | null = null;
      for (const candidate of candidates) {
        const match = expectedMap.get(normalize(candidate));
        if (match) {
          matchedDisplay = match;
          break;
        }
      }
      if (!matchedDisplay) return;

      // Toggle selection on every repeated drag over the same word/path.
      setFoundWords((prev) =>
        prev.includes(matchedDisplay)
          ? prev.filter((w) => w !== matchedDisplay)
          : [...prev, matchedDisplay],
      );
      setFoundPaths((prev) => {
        if (prev.some((p) => p.word === matchedDisplay)) {
          return prev.filter((p) => p.word !== matchedDisplay);
        }
        return [...prev, { word: matchedDisplay, cells }];
      });
    },
    [
      disabled,
      exercise.answer.caseSensitive,
      exercise.payload.allowReverse,
      exercise.payload.grid,
      expectedMap,
    ],
  );

  const finishDrag = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    commitPath(dragPath);
    setDragPath([]);
  }, [commitPath, isDragging, dragPath]);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('mouseup', finishDrag);
    window.addEventListener('touchend', finishDrag);
    return () => {
      window.removeEventListener('mouseup', finishDrag);
      window.removeEventListener('touchend', finishDrag);
    };
  }, [finishDrag, isDragging]);

  const beginDrag = (cell: Cell) => {
    if (disabled) return;
    setIsDragging(true);
    setDragPath([cell]);
  };

  const extendDrag = (cell: Cell) => {
    if (!isDragging || disabled) return;
    setDragPath((prev) => {
      if (prev.length === 0) return [cell];
      const last = prev[prev.length - 1];
      if (last.r === cell.r && last.c === cell.c) return prev;
      if (prev.some((p) => p.r === cell.r && p.c === cell.c)) return prev;
      if (!canStep(last, cell)) return prev;
      if (!sameDirection(prev, cell)) return prev;
      return [...prev, cell];
    });
  };

  const submit = () => {
    onSubmit({ type: 'word_search', foundWords }, foundWords.join(', '));
  };

  return (
    <div className="mb-5 mt-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 touch-none select-none">
        <div className="grid w-max gap-1 touch-none select-none" style={{ gridTemplateColumns: `repeat(${cols}, minmax(32px, 1fr))` }}>
          {exercise.payload.grid.flatMap((row, r) =>
            row.map((cell, c) => {
              const inDrag = dragPath.some((p) => p.r === r && p.c === c);
              const inFound = foundPaths.some((p) => p.cells.some((x) => x.r === r && x.c === c));

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  data-r={r}
                  data-c={c}
                  onMouseDown={() => beginDrag({ r, c })}
                  onMouseEnter={() => extendDrag({ r, c })}
                  onTouchStart={() => beginDrag({ r, c })}
                  onTouchMove={(e) => {
                    const touch = e.touches[0];
                    if (!touch) return;
                    const el = document.elementFromPoint(touch.clientX, touch.clientY);
                    const rAttr = el?.getAttribute('data-r');
                    const cAttr = el?.getAttribute('data-c');
                    if (rAttr != null && cAttr != null) {
                      extendDrag({ r: Number(rAttr), c: Number(cAttr) });
                    }
                  }}
                  disabled={disabled}
                  className={`flex h-9 w-9 select-none items-center justify-center rounded border text-sm font-semibold transition ${
                    inDrag
                      ? 'border-blue-500 bg-blue-100 text-blue-900'
                      : inFound
                        ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                        : 'border-slate-300 bg-white text-slate-800'
                  }`}
                >
                  {cell}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="mb-3 text-sm font-semibold text-slate-700">Найдите и выделите слова в сетке:</div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[...expectedMap.values()].map((word) => {
          const active = foundSet.has(word);
          return (
            <span
              key={word}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                active
                  ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                  : 'border-cyan-400 bg-white text-slate-800'
              }`}
            >
              {word}
            </span>
          );
        })}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || foundWords.length === 0}
          onClick={() => {
            setFoundWords([]);
            setFoundPaths([]);
          }}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Сбросить найденное
        </button>
      </div>

      <motion.button
        whileTap={!disabled && foundWords.length > 0 ? { scale: 0.98 } : {}}
        disabled={disabled || foundWords.length === 0}
        onClick={submit}
        className="w-full rounded-xl bg-slate-900 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Проверить
      </motion.button>
    </div>
  );
}
