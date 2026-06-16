import {
  MARK_META,
  STATUS_CLASS,
  glyphs,
  markGlyph,
  type ConstructorMark,
  type Placement,
  type SlotFeedback,
} from './punctuationConstructorModel';

export function MarkButton({
  disabled,
  isSelected,
  mark,
  onClick,
}: {
  disabled?: boolean;
  isSelected: boolean;
  mark: ConstructorMark;
  onClick: (mark: ConstructorMark) => void;
}) {
  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      onClick={() => onClick(mark)}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', mark);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      title={MARK_META[mark].label}
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2.5 text-lg font-black text-foreground shadow-sm transition-[background-color,border-color,box-shadow,color] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${
        isSelected
          ? 'border-amber-400 bg-amber-100 text-amber-900 ring-2 ring-amber-200 dark:border-amber-300 dark:bg-amber-300/18 dark:text-amber-100 dark:ring-amber-300/20'
          : 'border-stroke bg-surface-strong hover:border-amber-300 hover:bg-amber-50/70 dark:border-amber-300/20 dark:bg-foreground/5 dark:hover:border-amber-300/60 dark:hover:bg-amber-300/10'
      }`}
    >
      {markGlyph(mark)}
    </button>
  );
}

export function Slot({
  disabled,
  feedback,
  guidedTarget,
  placements,
  selectedMark,
  slotIndex,
  onAddMark,
  onMoveMark,
  onRemoveMark,
  onSelect,
}: {
  disabled?: boolean;
  feedback?: SlotFeedback;
  guidedTarget?: boolean;
  placements: Placement[];
  selectedMark: ConstructorMark | null;
  slotIndex: number;
  onAddMark: (slotIndex: number, mark: ConstructorMark) => void;
  onMoveMark: (slotIndex: number, fromIndex: number, direction: -1 | 1) => void;
  onRemoveMark: (slotIndex: number, placementIndex: number) => void;
  onSelect: (slotIndex: number) => void;
}) {
  const status = feedback?.status ?? 'idle';
  const placeholder = feedback?.expected.length
    ? glyphs(feedback.expected).replace(/./gu, '·')
    : '·';
  const sizeClass = 'h-10 min-w-10 px-1.5';
  const slotLabel = selectedMark
    ? `Add ${MARK_META[selectedMark].label} to slot ${slotIndex}`
    : `Select punctuation slot ${slotIndex}`;

  if (disabled && status === 'idle') return null;

  return (
    <div
      role={placements.length === 0 ? 'button' : undefined}
      tabIndex={placements.length === 0 ? (disabled ? -1 : 0) : undefined}
      aria-disabled={placements.length === 0 ? disabled : undefined}
      aria-label={slotLabel}
      onClick={() => {
        if (!disabled) onSelect(slotIndex);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(slotIndex);
        }
        if (
          (event.key === 'Backspace' || event.key === 'Delete') &&
          placements.length > 0
        ) {
          event.preventDefault();
          onRemoveMark(slotIndex, placements.length - 1);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const mark = event.dataTransfer.getData('text/plain') as ConstructorMark;
        if (mark && mark in MARK_META) {
          onAddMark(slotIndex, mark);
        }
      }}
      className={`inline-flex ${sizeClass} items-center justify-center rounded-lg border align-middle transition-[background-color,border-color,box-shadow,color,outline-color] duration-150 ease-out ${STATUS_CLASS[status]} ${
        selectedMark ? 'cursor-copy' : ''
      } ${guidedTarget ? 'outline outline-2 outline-offset-2 outline-amber-300' : ''} ${
        disabled ? 'opacity-60' : ''
      }`}
      title={`slot ${slotIndex}`}
    >
      {placements.length > 0 ? (
        <span className="flex max-w-9 flex-wrap items-center justify-center gap-px leading-none">
          {placements.map((placement, index) => (
            <span
              key={`${placement.mark}-${slotIndex}-${index}`}
              className="group/mark relative inline-flex size-4 items-center justify-center"
            >
              <button
                type="button"
                disabled={disabled}
                className="inline-flex size-3.5 items-center justify-center rounded-sm text-[11px] font-black leading-none text-amber-950 transition-[background-color,color] duration-150 ease-out hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-70 dark:text-amber-50 dark:hover:bg-amber-300/20"
                title={`${MARK_META[placement.mark].label}. Delete — удалить, ←/→ — поменять порядок`}
                aria-label={`${MARK_META[placement.mark].label} in slot ${slotIndex}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(slotIndex);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (!disabled) onRemoveMark(slotIndex, index);
                }}
                onKeyDown={(event) => {
                  if (disabled) return;
                  if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveMark(slotIndex, index);
                  }
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveMark(slotIndex, index, -1);
                  }
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveMark(slotIndex, index, 1);
                  }
                }}
              >
                {markGlyph(placement.mark)}
              </button>
              <span className="pointer-events-none absolute -top-7 left-1/2 z-20 inline-flex -translate-x-1/2 items-center rounded-md border border-amber-200 bg-amber-50/95 p-0.5 opacity-0 shadow-sm transition-opacity duration-150 ease-out group-hover/mark:pointer-events-auto group-hover/mark:opacity-100 group-focus-within/mark:pointer-events-auto group-focus-within/mark:opacity-100 dark:border-amber-300/20 dark:bg-stone-950/95">
                {placements.length > 1 ? (
                  <>
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveMark(slotIndex, index, -1);
                      }}
                      className="inline-flex size-5 items-center justify-center rounded text-[10px] text-amber-950 transition-colors duration-150 ease-out hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-30 dark:text-amber-50 dark:hover:bg-amber-300/20"
                      aria-label={`Move ${MARK_META[placement.mark].label} left`}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={disabled || index === placements.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveMark(slotIndex, index, 1);
                      }}
                      className="inline-flex size-5 items-center justify-center rounded text-[10px] text-amber-950 transition-colors duration-150 ease-out hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-30 dark:text-amber-50 dark:hover:bg-amber-300/20"
                      aria-label={`Move ${MARK_META[placement.mark].label} right`}
                    >
                      ›
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveMark(slotIndex, index);
                  }}
                  className="inline-flex size-5 items-center justify-center rounded text-[11px] leading-none text-amber-950/70 transition-colors duration-150 ease-out hover:bg-amber-100 hover:text-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-30 dark:text-amber-50/70 dark:hover:bg-amber-300/20 dark:hover:text-amber-50"
                  aria-label={`Удалить знак ${MARK_META[placement.mark].label}`}
                  title="Удалить знак"
                >
                  ×
                </button>
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="text-sm font-black text-foreground/35">{placeholder}</span>
      )}
    </div>
  );
}
