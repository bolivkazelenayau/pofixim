import type { MouseEvent, RefObject } from 'react';
import { CheckSquare, RefreshCw, XSquare } from 'lucide-react';
import AdminBatchActions from './AdminBatchActions';
import AdminExerciseList from './AdminExerciseList';
import AdminSidebarFilters from './AdminSidebarFilters';
import DatabaseSaveIndicator, { type DatabaseIndicator } from './DatabaseSaveIndicator';
import { qualityStatuses } from './constants';
import type { ListItem, RawPreviewItem } from './types';

type AdminExerciseSidebarProps = {
  sidebarRef: RefObject<HTMLElement | null>;
  databaseIndicator: DatabaseIndicator;
  stats: {
    hasActiveListFilter: boolean;
    matchingItems: number | null;
    totalItems: number | null;
    initialListPending: boolean;
    shownCount: number;
  };
  selection: {
    enabled: boolean;
    shownItemsCount: number;
    selectedCount: number;
    selectedIds: Set<number>;
    onEnable: () => void;
    onClear: () => void;
    onSelectAllShown: () => void;
    onToggle: (id: number, event: MouseEvent<HTMLButtonElement>) => void;
  };
  batch: {
    saving: boolean;
    showMoreActions: boolean;
    status: (typeof qualityStatuses)[number];
    isActive: 'active' | 'inactive';
    onApplyStatus: () => void;
    onApplyActivity: () => void;
    onToggleMore: () => void;
    onStatusChange: (value: (typeof qualityStatuses)[number]) => void;
    onIsActiveChange: (value: 'active' | 'inactive') => void;
  };
  filters: {
    query: string;
    type: string;
    examType: string;
    status: string;
    sortBy: 'id' | 'updatedAt' | 'type' | 'status';
    sortDir: 'asc' | 'desc';
    sortPrefsReady: boolean;
    types: string[];
    examTypes: string[];
    onQueryChange: (value: string) => void;
    onTypeChange: (value: string) => void;
    onExamTypeChange: (value: string) => void;
    onStatusChange: (value: string) => void;
    onSortByChange: (value: 'id' | 'updatedAt' | 'type' | 'status') => void;
    onSortDirChange: (value: 'asc' | 'desc') => void;
  };
  rawPreview: {
    filter: string;
    limit: number;
    loading: boolean;
    items: RawPreviewItem[];
    onFilterChange: (value: string) => void;
    onLimitChange: (value: number) => void;
    onRun: () => void;
  };
  list: {
    groupedItems: Array<[string, ListItem[]]>;
    selectedId: number | null;
    hasMore: boolean;
    loadingMore: boolean;
    onRefresh: () => void;
    onPrefetchExercise: (id: number) => void;
    onOpenExercise: (id: number) => void;
    onLoadMore: () => void;
    formatUpdatedAt: (value: string) => string;
  };
};

export default function AdminExerciseSidebar({
  sidebarRef,
  databaseIndicator,
  stats,
  selection,
  batch,
  filters,
  list,
}: AdminExerciseSidebarProps) {
  return (
    <aside
      ref={sidebarRef}
      className="flex h-[60vh] flex-col rounded-2xl border border-stroke bg-surface-strong p-4 text-foreground shadow-sm lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold tracking-tight">Задания</h3>
            <span className="inline-flex h-5 items-center justify-center rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary">
              {stats.hasActiveListFilter && stats.matchingItems !== null
                ? `${stats.matchingItems} / `
                : ''}
              {stats.totalItems ?? '...'}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-medium tabular-nums text-foreground/50">
            {stats.initialListPending
              ? 'Загрузка списка...'
              : selection.enabled
                ? `Показано: ${stats.shownCount} · выбрано: ${selection.selectedCount}`
                : `Показано: ${stats.shownCount}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Refresh exercise list"
            className="group relative flex size-10 items-center justify-center rounded-full text-foreground/50 transition hover:bg-stroke hover:text-foreground"
            onClick={list.onRefresh}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span aria-hidden="true" className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
              Обновить список
            </span>
          </button>
          {!selection.enabled ? (
            <button
              type="button"
              aria-label="Enable exercise selection"
              className="group relative flex size-10 items-center justify-center rounded-full text-foreground/50 transition hover:bg-stroke hover:text-primary"
              onClick={selection.onEnable}
            >
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
              <span aria-hidden="true" className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                Выбрать задания
              </span>
            </button>
          ) : (
            <button
              type="button"
              aria-label="Clear exercise selection"
              className="group relative flex size-10 items-center justify-center rounded-full text-foreground/50 transition hover:bg-red-500/10 hover:text-red-500"
              onClick={selection.onClear}
            >
              <XSquare className="h-4 w-4" aria-hidden="true" />
              <span aria-hidden="true" className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                Отмена выбора
              </span>
            </button>
          )}
        </div>
      </div>
      <DatabaseSaveIndicator indicator={databaseIndicator} className="mb-4" />
      {selection.enabled && (
        <button
          type="button"
          onClick={selection.onSelectAllShown}
          disabled={selection.shownItemsCount === 0}
          className="mb-3 w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-xs font-medium text-foreground/80 transition hover:bg-stroke disabled:cursor-not-allowed disabled:opacity-60"
        >
          Выбрать все показанные ({selection.shownItemsCount})
        </button>
      )}
      {selection.enabled && (
        <AdminBatchActions
          selectedCount={selection.selectedCount}
          batchSaving={batch.saving}
          showMoreBatchActions={batch.showMoreActions}
          batchStatus={batch.status}
          batchIsActive={batch.isActive}
          onApplyStatus={batch.onApplyStatus}
          onApplyActivity={batch.onApplyActivity}
          onToggleMore={batch.onToggleMore}
          onClearSelection={selection.onClear}
          onBatchStatusChange={batch.onStatusChange}
          onBatchIsActiveChange={batch.onIsActiveChange}
        />
      )}
      <AdminSidebarFilters
        listQuery={filters.query}
        listTypeFilter={filters.type}
        listExamTypeFilter={filters.examType}
        listStatusFilter={filters.status}
        listSortBy={filters.sortBy}
        listSortDir={filters.sortDir}
        sortPrefsReady={filters.sortPrefsReady}
        listTypes={filters.types}
        listExamTypes={filters.examTypes}
        onListQueryChange={filters.onQueryChange}
        onListTypeFilterChange={filters.onTypeChange}
        onListExamTypeFilterChange={filters.onExamTypeChange}
        onListStatusFilterChange={filters.onStatusChange}
        onListSortByChange={filters.onSortByChange}
        onListSortDirChange={filters.onSortDirChange}
      />
      <AdminExerciseList
        groupedItems={list.groupedItems}
        initialListPending={stats.initialListPending}
        typeFilter={filters.type}
        selectionMode={selection.enabled}
        selectedId={list.selectedId}
        multiSelectedSet={selection.selectedIds}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onToggleSelection={selection.onToggle}
        onPrefetchExercise={list.onPrefetchExercise}
        onOpenExercise={list.onOpenExercise}
        onLoadMore={list.onLoadMore}
        formatUpdatedAt={list.formatUpdatedAt}
      />
    </aside>
  );
}
