import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  isRefreshing: boolean;
  onToggleSelection: (id: number, event: MouseEvent<HTMLButtonElement>) => void;
  onPrefetchExercise: (id: number) => void;
  onOpenExercise: (id: number) => void;
  onLoadMore: () => void;
  formatUpdatedAt: (value: string) => string;
  onClearFilters?: () => void;
};

type ExerciseListRow =
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'item'; key: string; item: ListItem };
type ExerciseGroupRow = Extract<ExerciseListRow, { kind: 'group' }>;
type FrozenVirtualSnapshot = {
  rows: ExerciseListRow[];
  virtualItems: VirtualItem[];
  totalSize: number;
  activeGroup: ExerciseGroupRow | null;
};

export default function AdminExerciseList({
  groupedItems,
  initialListPending,
  selectionMode,
  selectedId,
  multiSelectedSet,
  hasMore,
  loadingMore,
  isRefreshing,
  onToggleSelection,
  onPrefetchExercise,
  onOpenExercise,
  onLoadMore,
  formatUpdatedAt,
  onClearFilters,
}: AdminExerciseListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo<ExerciseListRow[]>(
    () =>
      groupedItems.flatMap(([type, typeItems]) => [
        { kind: 'group' as const, key: `group:${type}`, label: type, count: typeItems.length },
        ...typeItems.map((item) => ({ kind: 'item' as const, key: `item:${item.id}`, item })),
      ]),
    [groupedItems],
  );
  const rowSignature = useMemo(() => rows.map((row) => row.key).join('|'), [rows]);
  // TanStack Virtual returns a stateful virtualizer; React Compiler cannot memoize it safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'group' ? 30 : 120),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 6,
  });
  useLayoutEffect(() => {
    rowVirtualizer.measure();
  }, [rowSignature, rowVirtualizer]);
  const virtualItems = rowVirtualizer.getVirtualItems();
  const rowsHaveItems = rows.some((row) => row.kind === 'item');
  const virtualItemsHaveItems = virtualItems.some((item) => rows[item.index]?.kind === 'item');
  const activeGroup = useMemo<ExerciseGroupRow | null>(() => {
    const scrollOffset = Math.max(0, (rowVirtualizer.scrollOffset ?? 0) - 32);
    const activeVirtualRow =
      virtualItems.find((item) => item.end > scrollOffset) ?? virtualItems[0];
    const activeIndex = activeVirtualRow?.index ?? 0;
    for (let index = activeIndex; index >= 0; index -= 1) {
      const row = rows[index];
      if (row?.kind === 'group') return row;
    }
    return null;
  }, [rowVirtualizer.scrollOffset, rows, virtualItems]);
  const frozenVirtualSnapshotRef = useRef<FrozenVirtualSnapshot | null>(null);
  const shouldFreezeVirtualLayer =
    rowsHaveItems && (isRefreshing || (virtualItems.length > 0 && !virtualItemsHaveItems));

  useEffect(() => {
    if (shouldFreezeVirtualLayer || !virtualItemsHaveItems) return;
    frozenVirtualSnapshotRef.current = {
      rows,
      virtualItems,
      totalSize: rowVirtualizer.getTotalSize(),
      activeGroup,
    };
  }, [activeGroup, rows, rowVirtualizer, shouldFreezeVirtualLayer, virtualItems, virtualItemsHaveItems]);

  const frozenSnapshot = shouldFreezeVirtualLayer ? frozenVirtualSnapshotRef.current : null;
  const renderedRows = frozenSnapshot?.rows ?? rows;
  const renderedVirtualItems = frozenSnapshot?.virtualItems ?? virtualItems;
  const renderedTotalSize = frozenSnapshot?.totalSize ?? rowVirtualizer.getTotalSize();
  const renderedActiveGroup = frozenSnapshot ? frozenSnapshot.activeGroup : activeGroup;
  const isFrozenVirtualLayer = Boolean(frozenSnapshot);

  return (
    <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-y-auto pr-1">
      {renderedActiveGroup ? (
        <div className="pointer-events-none sticky top-0 z-sticky -mb-[22px]">
          <GroupHeader label={renderedActiveGroup.label} count={renderedActiveGroup.count} />
        </div>
      ) : null}
      {renderedRows.length > 0 ? (
        <div
          className="relative w-full"
          style={{ height: `${renderedTotalSize}px` }}
        >
          {renderedVirtualItems.map((virtualRow) => {
            const row = renderedRows[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={virtualRow.key}
                ref={isFrozenVirtualLayer ? undefined : rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className={`absolute left-0 top-0 w-full pb-1.5 ${
                  row.kind === 'group' && row.key === renderedActiveGroup?.key ? 'pointer-events-none opacity-0' : ''
                }`}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {row.kind === 'group' ? (
                  <GroupHeader label={row.label} count={row.count} />
                ) : (
                  <ExerciseListButton
                    item={row.item}
                    selectionMode={selectionMode}
                    selectedId={selectedId}
                    multiSelectedSet={multiSelectedSet}
                    onToggleSelection={onToggleSelection}
                    onPrefetchExercise={onPrefetchExercise}
                    onOpenExercise={onOpenExercise}
                    formatUpdatedAt={formatUpdatedAt}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      {initialListPending ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-[26px] rounded-md border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-[18px] border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-[18px] border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-[18px] border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-[18px] border border-stroke bg-surface motion-safe:animate-pulse" />
          <div className="h-[114px] rounded-[18px] border border-stroke bg-surface motion-safe:animate-pulse" />
        </div>
      ) : groupedItems.length === 0 && (
        <div className="rounded-[20px] border border-dashed border-stroke bg-surface px-3 py-4 text-sm text-foreground/70">
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
            Можно загрузить еще
          </div>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface-strong dark:hover:bg-stroke dark:disabled:hover:bg-surface-strong"
          >
            {loadingMore ? 'Загрузка...' : 'Загрузить еще'}
          </button>
        </div>
      )}
    </div>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-stroke bg-surface px-2 py-1 text-xs font-semibold text-foreground/80">
      <span className="truncate">{label}</span>
      <span className="font-mono text-[10px] text-foreground/65">{count}</span>
    </div>
  );
}

function ExerciseListButton({
  item,
  selectionMode,
  selectedId,
  multiSelectedSet,
  onToggleSelection,
  onPrefetchExercise,
  onOpenExercise,
  formatUpdatedAt,
}: {
  item: ListItem;
  selectionMode: boolean;
  selectedId: number | null;
  multiSelectedSet: Set<number>;
  onToggleSelection: (id: number, event: MouseEvent<HTMLButtonElement>) => void;
  onPrefetchExercise: (id: number) => void;
  onOpenExercise: (id: number) => void;
  formatUpdatedAt: (value: string) => string;
}) {
  return (
    <button
      onClick={(event) => {
        if (event.detail > 1) {
          event.preventDefault();
          return;
        }
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
      className={`min-h-[114px] w-full rounded-[18px] border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
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
            className={`flex size-4 items-center justify-center rounded border ${
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
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/10 dark:bg-red-500/10 dark:text-red-200',
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
