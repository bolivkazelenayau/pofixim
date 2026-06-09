import type { MouseEvent, RefObject } from 'react';
import { CheckSquare, RefreshCw, XSquare } from 'lucide-react';
import AdminBatchActions from './AdminBatchActions';
import AdminExerciseList from './AdminExerciseList';
import AdminSidebarFilters from './AdminSidebarFilters';
import DatabaseSaveIndicator, { type DatabaseIndicator } from './DatabaseSaveIndicator';
import RawPreviewAuditPanel from './RawPreviewAuditPanel';
import { qualityStatuses } from './constants';
import type { ListItem, RawPreviewItem } from './types';

type AdminExerciseSidebarProps = {
  sidebarRef: RefObject<HTMLElement | null>;
  hasActiveListFilter: boolean;
  matchingItems: number | null;
  totalItems: number | null;
  initialListPending: boolean;
  shownCount: number;
  databaseIndicator: DatabaseIndicator;
  selectionMode: boolean;
  shownItemsCount: number;
  selectedCount: number;
  batchSaving: boolean;
  showMoreBatchActions: boolean;
  batchStatus: (typeof qualityStatuses)[number];
  batchIsActive: 'active' | 'inactive';
  listQuery: string;
  listTypeFilter: string;
  listExamTypeFilter: string;
  listStatusFilter: string;
  listSortBy: 'id' | 'updatedAt' | 'type' | 'status';
  listSortDir: 'asc' | 'desc';
  sortPrefsReady: boolean;
  listTypes: string[];
  listExamTypes: string[];
  rawPreviewFilter: string;
  rawPreviewLimit: number;
  rawPreviewLoading: boolean;
  rawPreviewItems: RawPreviewItem[];
  groupedItems: Array<[string, ListItem[]]>;
  selectedId: number | null;
  multiSelectedSet: Set<number>;
  hasMore: boolean;
  loadingMore: boolean;
  onRefreshList: () => void;
  onEnableSelectionMode: () => void;
  onClearSelection: () => void;
  onSelectAllShownItems: () => void;
  onApplyBatchStatus: () => void;
  onApplyBatchActivity: () => void;
  onToggleBatchMore: () => void;
  onBatchStatusChange: (value: (typeof qualityStatuses)[number]) => void;
  onBatchIsActiveChange: (value: 'active' | 'inactive') => void;
  onListQueryChange: (value: string) => void;
  onListTypeFilterChange: (value: string) => void;
  onListExamTypeFilterChange: (value: string) => void;
  onListStatusFilterChange: (value: string) => void;
  onListSortByChange: (value: 'id' | 'updatedAt' | 'type' | 'status') => void;
  onListSortDirChange: (value: 'asc' | 'desc') => void;
  onRawPreviewFilterChange: (value: string) => void;
  onRawPreviewLimitChange: (value: number) => void;
  onRunRawPreviewAudit: () => void;
  onToggleSelection: (id: number, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenExercise: (id: number) => void;
  onLoadMore: () => void;
  formatUpdatedAt: (value: string) => string;
};

export default function AdminExerciseSidebar({
  sidebarRef,
  hasActiveListFilter,
  matchingItems,
  totalItems,
  initialListPending,
  shownCount,
  databaseIndicator,
  selectionMode,
  shownItemsCount,
  selectedCount,
  batchSaving,
  showMoreBatchActions,
  batchStatus,
  batchIsActive,
  listQuery,
  listTypeFilter,
  listExamTypeFilter,
  listStatusFilter,
  listSortBy,
  listSortDir,
  sortPrefsReady,
  listTypes,
  listExamTypes,
  rawPreviewFilter,
  rawPreviewLimit,
  rawPreviewLoading,
  rawPreviewItems,
  groupedItems,
  selectedId,
  multiSelectedSet,
  hasMore,
  loadingMore,
  onRefreshList,
  onEnableSelectionMode,
  onClearSelection,
  onSelectAllShownItems,
  onApplyBatchStatus,
  onApplyBatchActivity,
  onToggleBatchMore,
  onBatchStatusChange,
  onBatchIsActiveChange,
  onListQueryChange,
  onListTypeFilterChange,
  onListExamTypeFilterChange,
  onListStatusFilterChange,
  onListSortByChange,
  onListSortDirChange,
  onRawPreviewFilterChange,
  onRawPreviewLimitChange,
  onRunRawPreviewAudit,
  onToggleSelection,
  onOpenExercise,
  onLoadMore,
  formatUpdatedAt,
}: AdminExerciseSidebarProps) {
  return (
    <aside
      ref={sidebarRef}
      className="flex h-[60vh] flex-col rounded-2xl border border-stroke bg-surface-strong p-4 text-foreground shadow-sm xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold tracking-tight">Задания</h3>
            <span className="inline-flex h-5 items-center justify-center rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary">
              {hasActiveListFilter && matchingItems !== null ? `${matchingItems} / ` : ''}
              {totalItems ?? '...'}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-foreground/50">
            {initialListPending ? 'Загрузка списка...' : `Показано: ${shownCount}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="group relative flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-stroke hover:text-foreground"
            onClick={onRefreshList}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
              Обновить список
            </span>
          </button>
          {!selectionMode ? (
            <button
              className="group relative flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-stroke hover:text-primary"
              onClick={onEnableSelectionMode}
            >
              <CheckSquare className="h-4 w-4" />
              <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                Выбрать задания
              </span>
            </button>
          ) : (
            <button
              className="group relative flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 transition hover:bg-red-500/10 hover:text-red-500"
              onClick={onClearSelection}
            >
              <XSquare className="h-4 w-4" />
              <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                Отмена выбора
              </span>
            </button>
          )}
        </div>
      </div>
      <DatabaseSaveIndicator indicator={databaseIndicator} className="mb-4" />
      {selectionMode && (
        <button
          type="button"
          onClick={onSelectAllShownItems}
          disabled={shownItemsCount === 0}
          className="mb-3 w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-xs font-medium text-foreground/80 transition hover:bg-stroke disabled:cursor-not-allowed disabled:opacity-60"
        >
          Выбрать все показанные ({shownItemsCount})
        </button>
      )}
      {selectionMode && (
        <AdminBatchActions
          selectedCount={selectedCount}
          batchSaving={batchSaving}
          showMoreBatchActions={showMoreBatchActions}
          batchStatus={batchStatus}
          batchIsActive={batchIsActive}
          onApplyStatus={onApplyBatchStatus}
          onApplyActivity={onApplyBatchActivity}
          onToggleMore={onToggleBatchMore}
          onClearSelection={onClearSelection}
          onBatchStatusChange={onBatchStatusChange}
          onBatchIsActiveChange={onBatchIsActiveChange}
        />
      )}
      <AdminSidebarFilters
        listQuery={listQuery}
        listTypeFilter={listTypeFilter}
        listExamTypeFilter={listExamTypeFilter}
        listStatusFilter={listStatusFilter}
        listSortBy={listSortBy}
        listSortDir={listSortDir}
        sortPrefsReady={sortPrefsReady}
        listTypes={listTypes}
        listExamTypes={listExamTypes}
        onListQueryChange={onListQueryChange}
        onListTypeFilterChange={onListTypeFilterChange}
        onListExamTypeFilterChange={onListExamTypeFilterChange}
        onListStatusFilterChange={onListStatusFilterChange}
        onListSortByChange={onListSortByChange}
        onListSortDirChange={onListSortDirChange}
      />
      <RawPreviewAuditPanel
        filter={rawPreviewFilter}
        limit={rawPreviewLimit}
        loading={rawPreviewLoading}
        items={rawPreviewItems}
        onFilterChange={onRawPreviewFilterChange}
        onLimitChange={onRawPreviewLimitChange}
        onRun={onRunRawPreviewAudit}
      />
      <AdminExerciseList
        groupedItems={groupedItems}
        initialListPending={initialListPending}
        selectionMode={selectionMode}
        selectedId={selectedId}
        multiSelectedSet={multiSelectedSet}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onToggleSelection={onToggleSelection}
        onOpenExercise={onOpenExercise}
        onLoadMore={onLoadMore}
        formatUpdatedAt={formatUpdatedAt}
      />
    </aside>
  );
}
