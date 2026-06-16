import { Timer, Trophy, Zap } from 'lucide-react';

import {
  BLITZ_DURATIONS,
  type BlitzDuration,
} from './blitzGameModel';

export function BlitzOfferPanel({
  duration,
  cardCount,
  onDurationChange,
  onStart,
}: {
  duration: BlitzDuration;
  cardCount: number;
  onDurationChange: (duration: BlitzDuration) => void;
  onStart: () => void;
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3 pr-10">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
          <Zap className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black leading-tight text-foreground">Блиц на орфограммы</h2>
          <p className="mt-1 max-w-[38ch] text-pretty text-sm leading-5 text-foreground/65">
            За&nbsp;короткое время выбери пропущенную букву свайпом или стрелками.
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {BLITZ_DURATIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onDurationChange(item)}
            className={`h-12 rounded-2xl border text-sm font-bold transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              duration === item
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-[var(--stroke)] bg-[var(--surface)] text-foreground hover:border-primary/60 hover:bg-stroke dark:hover:bg-stroke'
            }`}
          >
            {item === 60 ? '1 мин' : item === 120 ? '2 мин' : `${item} сек`}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={cardCount === 0}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform,opacity] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
      >
        <Timer className="h-5 w-5" />
        Старт
      </button>
    </div>
  );
}

export function BlitzFinishedPanel({
  correctCount,
  wrongCount,
  bestCombo,
  scoreDelta,
  onClose,
}: {
  correctCount: number;
  wrongCount: number;
  bestCombo: number;
  scoreDelta: number;
  onClose: () => void;
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3 pr-10">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black leading-tight text-foreground">Блиц завершён</h2>
          <p className="mt-1 text-sm text-foreground/65">Очки уже добавлены к счёту.</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <ResultCell label="Верно" value={correctCount} />
        <ResultCell label="Ошибки" value={wrongCount} />
        <ResultCell label="Комбо" value={bestCombo} />
        <ResultCell label="Очки" value={scoreDelta} />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="h-12 w-full rounded-xl bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98]"
      >
        Продолжить
      </button>
    </div>
  );
}

function ResultCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3">
      <div className="text-xs font-bold uppercase text-foreground/50">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</div>
    </div>
  );
}
