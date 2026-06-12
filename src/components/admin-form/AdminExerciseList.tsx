import type { MouseEvent, KeyboardEvent } from 'react';
import { logAdminDebug } from './debug';
import type { ListItem } from './types';

type AdminExerciseListProps = {
  groupedItems: Array<[string, ListItem[]]>;
  initialListPending: boolean;
  selectionMode: boolean;
  selectedId: number | null;
  multiSelectedSet: Set<number>;
  hasMore: boolean;
  loadingMore: boolean;
  onToggleSelection: (id: number, event: MouseEvent<HTMLButtonElement>) => void;
  onPrefetchExercise: (id: number) => void;
  onOpenExercise: (id: number) => void;
  onLoadMore: () => void;
  formatUpdatedAt: (value: string) => string;
  onClearFilters?: () => void;
};

export default function AdminExerciseList({
  groupedItems,
  initialListPending,
  selectionMode,
  selectedId,
  multiSelectedSet,
  hasMore,
  loadingMore,
  onToggleSelection,
  onPrefetchExercise,
  onOpenExercise,
  onLoadMore,
  formatUpdatedAt,
  onClearFilters,
}: AdminExerciseListProps) {
  return (
    <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
      {groupedItems.map(([type, typeItems]) => (
        <div key={type} className="space-y-1.5">
          <div className="sticky top-0 z-sticky flex items-center justify-between rounded-md border border-stroke bg-surface px-2 py-1 text-xs font-semibold text-foreground/80">
            <span className="truncate">{type}</span>
            <span className="font-mono text-[10px] text-foreground/65">{typeItems.length}</span>
          </div>
          {typeItems.map((item) => (
            <button
              key={item.id}
              onClick={(event) => {
                logAdminDebug('exercise-list:item-click', {
                  itemId: item.id,
                  selectedId,
                  selectionMode,
                  shiftKey: event.shiftKey,
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                });
                onToggleSelection(item.id, event);
              }}
              onDoubleClick={() => {
                onOpenExercise(item.id);
              }}
              onMouseEnter={() => {
                onPrefetchExercise(item.id);
              }}
              onFocus={() => {
                onPrefetchExercise(item.id);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onOpenExercise(item.id);
                }
              }}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                multiSelectedSet.has(item.id)
                  ? 'border-primary/50 bg-primary/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_18%,transparent)]'
                  : selectedId === item.id
                    ? 'border-foreground/30 bg-foreground/5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_10%,transparent)]'
                    : 'border-stroke hover:border-stroke hover:bg-foreground/5'
              }`}
            >
              {selectionMode ? (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-foreground/65">
                    multi-select
                  </span>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      multiSelectedSet.has(item.id)
                        ? 'border-primary bg-primary text-white'
                        : 'border-stroke bg-surface-strong'
                    }`}
                    aria-hidden="true"
                  >
                    {multiSelectedSet.has(item.id) ? '✓' : ''}
                  </span>
                </div>
              ) : null}
              <div className="mb-1.5 grid min-w-0 grid-cols-[1fr_auto] items-start gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-semibold text-foreground/70">
                    #{item.id}
                  </span>
                  <ListBadge tone={statusTone(item.qualityStatus)}>
                    {item.qualityStatus}
                  </ListBadge>
                  <ListBadge>{examLabel(item.skillTags)}</ListBadge>
                  <ListBadge>{item.type}</ListBadge>
                  {!item.isActive ? <ListBadge tone="muted">inactive</ListBadge> : null}
                </div>
                <span className="whitespace-nowrap pt-0.5 text-[10px] text-foreground/65">
                  {formatUpdatedAt(item.updatedAt)}
                </span>
              </div>
              <div className="line-clamp-2 text-pretty text-sm font-medium leading-5 text-foreground">
                {item.prompt}
              </div>
            </button>
          ))}
        </div>
      ))}
      {initialListPending ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-[26px] rounded-md border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-xl border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-xl border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-xl border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-xl border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-xl border border-stroke bg-surface motion-safe:animate-pulse" />
        </div>
      ) : groupedItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-stroke bg-surface px-3 py-4 text-sm text-foreground/70">
          <div className="font-semibold text-foreground">Ничего не найдено</div>
          <p className="mt-1 text-pretty text-xs leading-5 text-foreground/55">
            Попробуйте изменить запрос, тип задания или статус.
          </p>
          {onClearFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-xs font-semibold text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-stroke"
            >
              Сбросить фильтры
            </button>
          ) : null}
        </div>
      )}
      {hasMore && (
        <div className="mt-2 text-center">
          <div className="mb-2 text-[11px] font-medium text-foreground/65">
            Можно загрузить ещё
          </div>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface-strong dark:hover:bg-stroke dark:disabled:hover:bg-surface-strong"
          >
            {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
          </button>
        </div>
      )}
    </div>
  );
}

function ListBadge({
  children,
  tone = 'default',
}: {
  children: string;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'muted';
}) {
  const className = {
    default: 'border-stroke bg-surface-strong text-foreground/70',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200',
    muted: 'border-stroke bg-foreground/5 text-foreground/65',
  }[tone];

  return (
    <span className={`max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'muted' {
  if (status === 'approved') return 'green';
  if (status === 'review') return 'amber';
  if (status === 'archived') return 'muted';
  return 'red';
}

function examLabel(skillTags: string[]) {
  const tag = skillTags.find((item) => /^ege\.\d{1,2}$/u.test(item));
  return tag ? tag.replace('ege.', 'ЕГЭ ') : 'no exam';
}
