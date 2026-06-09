'use client';

import type { RefObject } from 'react';
import AdminExerciseSidebar from '@/components/admin-form/AdminExerciseSidebar';
import type { DatabaseIndicator } from '@/components/admin-form/DatabaseSaveIndicator';
import { formatUpdatedAt } from '@/components/admin-form/utils';
import { useBatchActions } from '@/hooks/useBatchActions';
import { EXERCISE_TYPES } from '@/features/exercises/types';
import type { ListItem } from './types';

const LIST_TYPES = ['all', ...EXERCISE_TYPES];
const LIST_EXAM_TYPES = ['all', ...Array.from({ length: 13 }, (_, i) => String(i + 9))];

type AdminSidebarContainerProps = {
  sidebarRef: RefObject<HTMLElement | null>;
  databaseIndicator: DatabaseIndicator;
  selectedId: number | null;
  list: {
    totalItems: number | null;
    matchingItems: number | null;
    initialListPending: boolean;
    hasActiveListFilter: boolean;
    groupedItems: Array<[string, ListItem[]]>;
    flatFilteredItems: ListItem[];
    query: string;
    typeFilter: string;
    statusFilter: string;
    examTypeFilter: string;
    sortBy: 'id' | 'updatedAt' | 'type' | 'status';
    sortDir: 'asc' | 'desc';
    sortPrefsReady: boolean;
    hasMore: boolean;
    loadingMore: boolean;
    setQuery: (value: string) => void;
    setTypeFilter: (value: string) => void;
    setStatusFilter: (value: string) => void;
    setExamTypeFilter: (value: string) => void;
    setSortBy: (value: 'id' | 'updatedAt' | 'type' | 'status') => void;
    setSortDir: (value: 'asc' | 'desc') => void;
    refresh: (opts?: { includeTotal?: boolean; force?: boolean }) => Promise<void>;
    loadMore: () => Promise<void>;
  };
  onOpenExercise: (id: number) => Promise<void>;
  setIsError: (value: boolean) => void;
  setMessage: (value: string) => void;
};

export default function AdminSidebarContainer({
  sidebarRef,
  databaseIndicator,
  selectedId,
  list,
  onOpenExercise,
  setIsError,
  setMessage,
}: AdminSidebarContainerProps) {
  const {
    multiSelectedIds,
    selectionMode,
    setSelectionMode,
    showMoreBatchActions,
    setShowMoreBatchActions,
    multiSelectedSet,
    batchStatus,
    setBatchStatus,
    batchIsActive,
    setBatchIsActive,
    batchSaving,
    rawPreviewFilter,
    setRawPreviewFilter,
    rawPreviewLimit,
    setRawPreviewLimit,
    rawPreviewLoading,
    rawPreviewItems,
    toggleMultiSelectionByClick,
    clearMultiSelection,
    selectAllShownItems,
    applyBatchStatus,
    runRawPreviewAudit,
    applyBatchActivity,
  } = useBatchActions({
    flatFilteredItems: list.flatFilteredItems,
    selectedId,
    openExerciseWithAutosave: onOpenExercise,
    refreshList: list.refresh,
    setIsError,
    setMessage,
  });

  return (
    <AdminExerciseSidebar
      sidebarRef={sidebarRef}
      databaseIndicator={databaseIndicator}
      stats={{
        hasActiveListFilter: list.hasActiveListFilter,
        matchingItems: list.matchingItems,
        totalItems: list.totalItems,
        initialListPending: list.initialListPending,
        shownCount: list.flatFilteredItems.length,
      }}
      selection={{
        enabled: selectionMode,
        shownItemsCount: list.flatFilteredItems.length,
        selectedCount: multiSelectedIds.length,
        selectedIds: multiSelectedSet,
        onEnable: () => setSelectionMode(true),
        onClear: clearMultiSelection,
        onSelectAllShown: selectAllShownItems,
        onToggle: toggleMultiSelectionByClick,
      }}
      batch={{
        saving: batchSaving,
        showMoreActions: showMoreBatchActions,
        status: batchStatus,
        isActive: batchIsActive,
        onApplyStatus: () => void applyBatchStatus(),
        onApplyActivity: () => void applyBatchActivity(),
        onToggleMore: () => setShowMoreBatchActions((value) => !value),
        onStatusChange: setBatchStatus,
        onIsActiveChange: setBatchIsActive,
      }}
      filters={{
        query: list.query,
        type: list.typeFilter,
        examType: list.examTypeFilter,
        status: list.statusFilter,
        sortBy: list.sortBy,
        sortDir: list.sortDir,
        sortPrefsReady: list.sortPrefsReady,
        types: LIST_TYPES,
        examTypes: LIST_EXAM_TYPES,
        onQueryChange: list.setQuery,
        onTypeChange: list.setTypeFilter,
        onExamTypeChange: list.setExamTypeFilter,
        onStatusChange: list.setStatusFilter,
        onSortByChange: list.setSortBy,
        onSortDirChange: list.setSortDir,
      }}
      rawPreview={{
        filter: rawPreviewFilter,
        limit: rawPreviewLimit,
        loading: rawPreviewLoading,
        items: rawPreviewItems,
        onFilterChange: setRawPreviewFilter,
        onLimitChange: setRawPreviewLimit,
        onRun: () => void runRawPreviewAudit(),
      }}
      list={{
        groupedItems: list.groupedItems,
        selectedId,
        hasMore: list.hasMore,
        loadingMore: list.loadingMore,
        onRefresh: () => void list.refresh({ includeTotal: true, force: true }),
        onOpenExercise: (id) => void onOpenExercise(id),
        onLoadMore: () => void list.loadMore(),
        formatUpdatedAt,
      }}
    />
  );
}
