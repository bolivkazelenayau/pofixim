import type { ComponentType, ReactNode, SVGProps } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Trophy, X } from 'lucide-react';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export function QuickGameModalShell({
  ariaLabel,
  children,
  copyToast,
  isCloseOffsetForRunning,
  onClose,
  onCloseFromBackdrop,
}: {
  ariaLabel: string;
  children: ReactNode;
  copyToast: string | null;
  isCloseOffsetForRunning: boolean;
  onClose: () => void;
  onCloseFromBackdrop: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-modal flex items-end justify-center bg-black/50 p-0 sm:items-center sm:px-3 sm:py-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseFromBackdrop();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        className="relative flex max-h-[94svh] w-full max-w-[540px] flex-col overflow-hidden rounded-t-[32px] border border-white/75 bg-[var(--surface-strong)] shadow-xl sm:max-h-[92vh] sm:rounded-[40px]"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {copyToast && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-sticky -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background shadow-lg">
            {copyToast}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className={`absolute right-5 z-sticky flex size-10 items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] text-foreground/70 transition-[background-color,border-color,box-shadow,color] duration-150 ease-out hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke sm:right-6 ${
            isCloseOffsetForRunning ? 'top-3' : 'top-[22px] sm:top-[26px]'
          }`}
          aria-label="Close quick game"
          title="Закрыть"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {children}
      </motion.div>
    </div>
  );
}

export function QuickOfferPanel({
  title,
  description,
  icon: Icon,
  iconClassName,
  disabled,
  onStart,
}: {
  title: string;
  description: string;
  icon: IconComponent;
  iconClassName: string;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3 pr-10">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black leading-tight text-foreground">{title}</h2>
          <p className="mt-1 max-w-[38ch] text-pretty text-sm leading-5 text-foreground/65">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-black text-white shadow-sm transition-[background-color,box-shadow,transform,opacity] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
      >
        <Icon className="h-5 w-5" />
        Старт
      </button>
    </div>
  );
}

export function QuickFinishedPanel({
  title,
  correctCount,
  wrongCount,
  bestCombo,
  scoreDelta,
  onClose,
}: {
  title: string;
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
          <h2 className="text-xl font-black leading-tight text-foreground">{title}</h2>
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
        Готово
      </button>
    </div>
  );
}

export function QuickChoiceButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = icon === 'left' ? ArrowLeft : ArrowRight;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-14 min-w-0 items-center justify-center gap-2 rounded-[20px] border border-[var(--stroke)] bg-[var(--surface)] px-3 text-base font-black text-foreground shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/60 hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-70 dark:hover:bg-stroke sm:text-lg ${
        icon === 'left' ? 'rounded-bl-[24px]' : 'rounded-br-[24px]'
      }`}
    >
      {icon === 'left' && <Icon className="h-4 w-4 text-foreground/50" aria-hidden="true" />}
      <span className="truncate">{label}</span>
      {icon === 'right' && <Icon className="h-4 w-4 text-foreground/50" aria-hidden="true" />}
    </button>
  );
}

function ResultCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-[0.08em] text-foreground/45">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</div>
    </div>
  );
}
