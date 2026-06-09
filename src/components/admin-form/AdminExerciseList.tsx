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
  onOpenExercise: (id: number) => void;
  onLoadMore: () => void;
  formatUpdatedAt: (value: string) => string;
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
  onOpenExercise,
  onLoadMore,
  formatUpdatedAt,
}: AdminExerciseListProps) {
  return (
    <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
      {groupedItems.map(([type, typeItems]) => (
        <div key={type} className="space-y-2">
          <div className="sticky top-0 z-10 rounded-md border border-stroke bg-surface px-2 py-1 text-xs font-semibold text-foreground/80">
            {type} · {typeItems.length}
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
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onOpenExercise(item.id);
                }
              }}
              className={`w-full rounded-xl border p-3 text-left transition focus:outline-none ${
                multiSelectedSet.has(item.id)
                  ? 'border-primary/50 bg-primary/10'
                  : selectedId === item.id
                    ? 'border-foreground/30 bg-foreground/5'
                    : 'border-stroke hover:border-stroke hover:bg-foreground/5'
              }`}
            >
              {selectionMode ? (
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-foreground/60">Shift/Ctrl</span>
                  {multiSelectedSet.has(item.id) ? (
                    <span className="text-[10px] font-semibold text-primary">выбрано</span>
                  ) : null}
                </div>
              ) : null}
              <div className="text-xs text-foreground/70">
                #{item.id} • {item.qualityStatus}
              </div>
              <div className="mt-0.5 text-[11px] text-foreground/60">
                обновлено: {formatUpdatedAt(item.updatedAt)}
              </div>
              <div className="line-clamp-2 text-sm text-foreground">{item.prompt}</div>
            </button>
          ))}
        </div>
      ))}
      {initialListPending ? (
        <div className="space-y-2">
          <div className="h-6 animate-pulse rounded-md border border-stroke bg-surface" />
          <div className="h-20 animate-pulse rounded-xl border border-stroke bg-surface" />
          <div className="h-20 animate-pulse rounded-xl border border-stroke bg-surface" />
          <div className="h-20 animate-pulse rounded-xl border border-stroke bg-surface" />
          <div className="h-20 animate-pulse rounded-xl border border-stroke bg-surface" />
          <div className="h-20 animate-pulse rounded-xl border border-stroke bg-surface" />
        </div>
      ) : groupedItems.length === 0 && (
        <div className="rounded-lg border border-dashed border-stroke px-3 py-4 text-sm text-foreground/60">
          Ничего не найдено по текущим фильтрам.
        </div>
      )}
      {hasMore && (
        <div className="mt-2 text-center">
          <div className="mb-2 text-[11px] font-medium text-foreground/50">
            Можно загрузить ещё
          </div>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm font-medium text-foreground/80 transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
          </button>
        </div>
      )}
    </div>
  );
}
