import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { motion, type MotionValue } from 'motion/react';
import { Copy, Zap } from 'lucide-react';
import type { Ege9BlitzCard } from '@/features/exercises/ege9Blitz';

type BlitzGameRunningPanelProps = {
  archivedCards: Ege9BlitzCard[];
  choiceWords: string[];
  combo: number;
  currentCard: Ege9BlitzCard;
  dragLift: MotionValue<number>;
  dragOpacity: MotionValue<number>;
  dragRotate: MotionValue<number>;
  dragRotateY: MotionValue<number>;
  dragX: MotionValue<number>;
  fourthOpacity: MotionValue<number>;
  fourthRotateX: MotionValue<number>;
  fourthScale: MotionValue<number>;
  fourthY: MotionValue<number>;
  isDraggingCard: boolean;
  isInspectMode: boolean;
  lastAnswerCorrect: boolean | null;
  nextOpacity: MotionValue<number>;
  nextRotateX: MotionValue<number>;
  nextScale: MotionValue<number>;
  nextY: MotionValue<number>;
  progress: number;
  quickSeedCommand: string | null;
  quickSeedLabel: string;
  scoreDelta: number;
  thirdOpacity: MotionValue<number>;
  thirdRotateX: MotionValue<number>;
  thirdScale: MotionValue<number>;
  thirdY: MotionValue<number>;
  timeLeftSeconds: number;
  wordFontClass: string;
  wordGapClass: string;
  answer: (choiceIndex: 0 | 1) => void;
  copyQuickSeedCommand: () => Promise<void>;
  copySeedKey: () => Promise<void>;
  setIsDraggingCard: (value: boolean) => void;
};

export function BlitzGameRunningPanel({
  archivedCards,
  choiceWords,
  combo,
  currentCard,
  dragLift,
  dragOpacity,
  dragRotate,
  dragRotateY,
  dragX,
  fourthOpacity,
  fourthRotateX,
  fourthScale,
  fourthY,
  isDraggingCard,
  isInspectMode,
  lastAnswerCorrect,
  nextOpacity,
  nextRotateX,
  nextScale,
  nextY,
  progress,
  quickSeedCommand,
  quickSeedLabel,
  scoreDelta,
  thirdOpacity,
  thirdRotateX,
  thirdScale,
  thirdY,
  timeLeftSeconds,
  wordFontClass,
  wordGapClass,
  answer,
  copyQuickSeedCommand,
  copySeedKey,
  setIsDraggingCard,
}: BlitzGameRunningPanelProps) {
  function stopCopyInteraction(
    event: ReactMouseEvent<HTMLButtonElement> | ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
  }

  return (
    <div className="flex flex-1 flex-col p-3 sm:block sm:p-5">
      <div className="relative mb-2 flex min-h-8 items-center justify-between gap-2 sm:mb-3">
        {isInspectMode ? (
          <div className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em] text-primary shadow-sm sm:px-3 sm:text-sm">
            qseed
          </div>
        ) : (
          <div className="rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1 text-xs font-black tabular-nums text-foreground shadow-sm sm:px-3 sm:text-sm">
            {timeLeftSeconds} c
          </div>
        )}
        <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black tabular-nums text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20 sm:px-3 sm:text-sm">
          {scoreDelta}
        </div>
        {combo > 0 ? (
          <div className="mr-10 flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black tabular-nums text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20 sm:mr-11 sm:gap-1.5 sm:px-3 sm:text-sm">
            <Zap className="h-3.5 w-3.5 text-amber-500 sm:h-4 sm:w-4" />
            {combo}
          </div>
        ) : (
          <div className="mr-10 sm:mr-11" />
        )}
      </div>

      {!isInspectMode && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--stroke)] sm:mb-4 sm:h-2">
          <div
            className="h-full origin-left rounded-full bg-primary transition-transform duration-100 ease-linear"
            style={{ transform: `scaleX(${Math.max(0, progress)})` }}
          />
        </div>
      )}

      <div className="relative grid min-h-[360px] flex-1 grid-cols-1 items-stretch gap-3 [perspective:900px] sm:min-h-[278px]">
        {archivedCards.map((card, archiveIndex) => (
          <motion.div
            key={`${card.id}-archive-${archiveIndex}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 flex min-h-[336px] select-none flex-col items-center overflow-hidden rounded-[20px] border border-[var(--stroke)] bg-[var(--surface)] px-4 pb-8 pt-7 text-center shadow-sm sm:min-h-[254px] sm:justify-center sm:rounded-[22px] sm:px-8 sm:py-7"
            style={{
              y: archiveIndex === 0 ? nextY : archiveIndex === 1 ? thirdY : fourthY,
              scale: archiveIndex === 0 ? nextScale : archiveIndex === 1 ? thirdScale : fourthScale,
              rotateX: archiveIndex === 0 ? nextRotateX : archiveIndex === 1 ? thirdRotateX : fourthRotateX,
              opacity: archiveIndex === 0 ? nextOpacity : archiveIndex === 1 ? thirdOpacity : fourthOpacity,
              zIndex: 3 - archiveIndex,
              transformPerspective: 900,
              transformOrigin: 'bottom center',
            }}
          >
            <div className="absolute left-3 top-3 rounded-full border border-[var(--stroke)] bg-[var(--surface-strong)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-foreground/35 shadow-sm sm:left-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]">
              Ряд {card.rowIndex}
            </div>
            <div className="mt-auto flex w-full min-w-0 max-w-full items-center justify-center gap-x-1 whitespace-nowrap px-1 text-[clamp(2.05rem,10.4vw,3.2rem)] font-black leading-[1.02] text-foreground/40 sm:mt-0 sm:text-[clamp(1.75rem,3.8vw,2.7rem)]">
              <span className="min-w-0">{card.before}</span>
              <span className="inline-flex h-[1.08em] min-w-[1.08em] items-center justify-center rounded-xl border-2 border-primary/35 bg-white/70 px-1 text-primary/55 ring-4 ring-primary/5 dark:bg-[var(--surface-strong)]">
                ?
              </span>
              <span className="min-w-0">{card.after}</span>
            </div>
            {card.contextHint && (
              <div className="mt-8 max-w-full rounded-full bg-primary/5 px-5 py-2 text-base font-black text-primary/45 sm:mt-6">
                {card.contextHint}
              </div>
            )}
            <div className="mb-auto mt-12 h-[74px] w-full max-w-[286px] rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)]/75 shadow-sm sm:mb-0 sm:mt-6 sm:h-7 sm:max-w-none sm:rounded-full" />
          </motion.div>
        ))}
        <motion.div
          key={currentCard.id}
          initial={{ y: 10, scale: 0.96, opacity: 0.85 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          drag="x"
          style={{
            x: dragX,
            y: dragLift,
            opacity: isDraggingCard ? dragOpacity : undefined,
            rotateZ: dragRotate,
            rotateY: dragRotateY,
            transformPerspective: 900,
          }}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.42}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 260, bounceDamping: 28 }}
          whileDrag={{ scale: 1.018 }}
          onDragStart={() => setIsDraggingCard(true)}
          onDragEnd={(_, info) => {
            if (info.offset.x < -64) {
              answer(0);
              return;
            }
            if (info.offset.x > 64) {
              answer(1);
              return;
            }
            setIsDraggingCard(false);
          }}
          transition={{
            type: 'spring',
            stiffness: 390,
            damping: 27,
            mass: 0.78,
          }}
          className={`relative z-sticky flex min-h-[336px] cursor-grab select-none flex-col items-center overflow-hidden rounded-[20px] border-2 px-4 pb-8 pt-7 text-center shadow-sm active:cursor-grabbing sm:min-h-[254px] sm:justify-center sm:rounded-[22px] sm:px-8 sm:py-7 ${
            lastAnswerCorrect === true
              ? 'border-emerald-400 bg-emerald-50 shadow-[0_0_28px_rgba(16,185,129,0.3)] dark:bg-emerald-950/40'
              : lastAnswerCorrect === false
                ? 'border-red-400 bg-red-50 shadow-[0_0_28px_rgba(239,68,68,0.3)] dark:bg-red-950/40'
                : 'border-[var(--stroke)] bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_42%),linear-gradient(180deg,var(--surface-strong),var(--surface))]'
          }`}
        >
          <div className="absolute right-3 top-3 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-primary sm:right-4 sm:top-4 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]">
            Свайп
          </div>
          <div className={`mt-auto flex w-full min-w-0 max-w-full items-center justify-center ${wordGapClass} whitespace-nowrap px-1 ${wordFontClass} font-black leading-[1.02] text-foreground sm:mt-0`}>
            <span className="min-w-0">{currentCard.before}</span>
            <span className="inline-flex h-[1.08em] min-w-[1.08em] items-center justify-center rounded-xl border-2 border-primary bg-white px-1 text-primary shadow-[0_10px_30px_color-mix(in_srgb,var(--primary)_22%,transparent)] ring-4 ring-primary/10 dark:bg-[var(--surface-strong)]">
              ?
            </span>
            <span className="min-w-0">{currentCard.after}</span>
          </div>
          {currentCard.contextHint && (
            <div className="mt-8 max-w-full rounded-full bg-primary/10 px-5 py-2 text-base font-black text-primary sm:mt-6">
              {currentCard.contextHint}
            </div>
          )}
          <div className="mb-auto mt-12 flex min-h-[74px] w-full max-w-[286px] flex-col items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-4 py-3 text-xs font-bold leading-5 text-foreground/55 shadow-sm sm:mb-0 sm:mt-6 sm:min-h-0 sm:max-w-none sm:rounded-full sm:px-3 sm:py-1">
            <span className="sm:hidden">Свайпни карточку</span>
            <span className="sm:hidden">или выбери</span>
            <span className="sm:hidden">букву ниже</span>
            <span className="hidden sm:inline">Свайпни карточку или выбери букву ниже</span>
          </div>
        </motion.div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-4">
        <button
          type="button"
          onClick={() => answer(0)}
          className="flex h-14 min-w-0 flex-col items-center justify-center rounded-[20px] rounded-bl-[24px] border border-[var(--stroke)] bg-[var(--surface)] px-3 text-foreground shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/60 hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
        >
          <span className="text-xl font-black leading-tight">{currentCard.choices[0]}</span>
          <span className="max-w-full truncate text-[11px] font-bold text-foreground/45">
            {choiceWords[0]}
          </span>
        </button>
        <button
          type="button"
          onClick={() => answer(1)}
          className="flex h-14 min-w-0 flex-col items-center justify-center rounded-[20px] rounded-br-[24px] border border-[var(--stroke)] bg-[var(--surface)] px-3 text-foreground shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/60 hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
        >
          <span className="text-xl font-black leading-tight">{currentCard.choices[1]}</span>
          <span className="max-w-full truncate text-[11px] font-bold text-foreground/45">
            {choiceWords[1]}
          </span>
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-foreground/60 sm:mt-3 sm:text-[11px]">
        <button
          type="button"
          onPointerDown={stopCopyInteraction}
          onClick={(event) => {
            stopCopyInteraction(event);
            void copySeedKey();
          }}
          disabled={!currentCard.seedKey}
          className="text-left font-mono transition-colors duration-150 ease-out hover:text-primary disabled:pointer-events-none disabled:text-foreground/45"
          title={currentCard.seedKey ? 'Скопировать seed key' : undefined}
        >
          seed: {quickSeedLabel}
        </button>
        <button
          type="button"
          onPointerDown={stopCopyInteraction}
          onClick={(event) => {
            stopCopyInteraction(event);
            void copyQuickSeedCommand();
          }}
          disabled={!quickSeedCommand}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-foreground/45 transition-[background-color,color] duration-150 ease-out hover:bg-[var(--stroke)] hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          aria-label="Скопировать qseed"
          title="Скопировать qseed"
        >
          <Copy className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
