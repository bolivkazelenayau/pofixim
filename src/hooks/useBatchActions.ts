'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { batchUpdateExercisesMetaAction } from '@/app/actions/admin';
import { previewRawNormalizationAction } from '@/app/actions/admin-preview';
import { qualityStatuses } from '@/components/admin-form/constants';
import { adminExerciseKeys } from '@/components/admin-form/queryKeys';
import {
  patchAdminExerciseLists,
  restoreAdminExerciseLists,
  snapshotAdminExerciseLists,
  upsertAdminExerciseDetail,
} from '@/components/admin-form/queryCache';
import type { ListItem, RawPreviewItem } from '@/components/admin-form/types';

type UseBatchActionsConfig = {
  flatFilteredItems: ListItem[];
  selectedId: number | null;
  openExerciseWithAutosave: (id: number) => Promise<void>;
  refreshList: (opts?: { includeTotal?: boolean; force?: boolean }) => Promise<void>;
  setIsError: (value: boolean) => void;
  setMessage: (value: string) => void;
};

export function useBatchActions({
  flatFilteredItems,
  selectedId,
  openExerciseWithAutosave,
  refreshList,
  setIsError,
  setMessage,
}: UseBatchActionsConfig) {
  const queryClient = useQueryClient();
  const [multiSelectedIds, setMultiSelectedIds] = useState<number[]>([]);
  const [lastMultiSelectedId, setLastMultiSelectedId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [showMoreBatchActions, setShowMoreBatchActions] = useState(false);
  const [batchStatus, setBatchStatus] = useState<(typeof qualityStatuses)[number]>('review');
  const [batchIsActive, setBatchIsActive] = useState<'active' | 'inactive'>('active');
  const [rawPreviewFilter, setRawPreviewFilter] = useState('');
  const [rawPreviewLimit, setRawPreviewLimit] = useState(3);
  const [rawPreviewLoading, setRawPreviewLoading] = useState(false);
  const [rawPreviewItems, setRawPreviewItems] = useState<RawPreviewItem[]>([]);
  const batchUpdateMutation = useMutation({
    mutationFn: batchUpdateExercisesMetaAction,
  });

  const multiSelectedSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);
  const batchSaving = batchUpdateMutation.isPending;

  function toggleMultiSelectionByClick(itemId: number, event: React.MouseEvent<HTMLButtonElement>) {
    const isShift = event.shiftKey;
    const isToggle = event.ctrlKey || event.metaKey;
    if (!selectionMode && !isShift && !isToggle) {
      void openExerciseWithAutosave(itemId);
      setLastMultiSelectedId(itemId);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const anchorId = lastMultiSelectedId ?? selectedId;
    if (isShift && anchorId != null) {
      const ids = flatFilteredItems.map((i) => i.id);
      const from = ids.indexOf(anchorId);
      const to = ids.indexOf(itemId);
      if (from >= 0 && to >= 0) {
        const [start, end] = from <= to ? [from, to] : [to, from];
        const range = ids.slice(start, end + 1);
        setMultiSelectedIds((prev) => {
          const prevSet = new Set(prev);
          const allSelected = range.every((id) => prevSet.has(id));
          if (allSelected) {
            return prev.filter((id) => !range.includes(id));
          }
          return Array.from(new Set([...prev, ...range]));
        });
        setLastMultiSelectedId(anchorId);
        setSelectionMode(true);
        return;
      }
    }

    setMultiSelectedIds((prev) => {
      const next = prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId];
      if (next.length === 0) {
        setSelectionMode(false);
        setShowMoreBatchActions(false);
      }
      return next;
    });
    setLastMultiSelectedId(itemId);
    setSelectionMode(true);
  }

  function clearMultiSelection() {
    setMultiSelectedIds([]);
    setLastMultiSelectedId(null);
    setSelectionMode(false);
    setShowMoreBatchActions(false);
  }

  function selectAllShownItems() {
    const visibleIds = flatFilteredItems.map((item) => item.id);
    setMultiSelectedIds(visibleIds);
    setLastMultiSelectedId(visibleIds[visibleIds.length - 1] ?? null);
    setSelectionMode(true);
  }

  async function applyBatchStatus() {
    if (multiSelectedIds.length === 0 || batchSaving) return;
    const ids = [...multiSelectedIds];
    const idSet = new Set(ids);
    await queryClient.cancelQueries({ queryKey: adminExerciseKeys.lists() });
    const optimisticListSnapshot = snapshotAdminExerciseLists(queryClient);
    const optimisticDetailSnapshots = ids.map((id) => [
      id,
      queryClient.getQueryData(adminExerciseKeys.detail(id)),
    ] as const);
    patchAdminExerciseLists(queryClient, (item) =>
      idSet.has(item.id) ? { ...item, qualityStatus: batchStatus } : item,
    );
    for (const id of ids) {
      upsertAdminExerciseDetail(queryClient, id, { qualityStatus: batchStatus });
    }

    const rollbackOptimisticBatch = () => {
      restoreAdminExerciseLists(queryClient, optimisticListSnapshot);
      for (const [id, data] of optimisticDetailSnapshots) {
        queryClient.setQueryData(adminExerciseKeys.detail(id), data);
      }
    };

    let res: Awaited<ReturnType<typeof batchUpdateExercisesMetaAction>>;
    try {
      res = await batchUpdateMutation.mutateAsync({
        ids,
        qualityStatus: batchStatus,
      });
    } catch (error) {
      rollbackOptimisticBatch();
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Batch update failed.');
      return;
    }
    if (res.success) {
      setMessage(`Обновлено заданий: ${multiSelectedIds.length}.`);
      setIsError(false);
      clearMultiSelection();
      await refreshList({ includeTotal: true, force: true });
    } else {
      rollbackOptimisticBatch();
      setIsError(true);
      setMessage(res.error || 'Ошибка массового обновления.');
    }
  }

  async function runRawPreviewAudit() {
    if (rawPreviewLoading) return;
    setRawPreviewLoading(true);
    setIsError(false);
    setMessage('');
    const res = await previewRawNormalizationAction({
      fileFilter: rawPreviewFilter,
      limit: rawPreviewLimit,
    });
    if (res.success) {
      setRawPreviewItems((res.items as RawPreviewItem[]) ?? []);
    } else {
      setIsError(true);
      setMessage(res.error || 'Не удалось просканировать raw HTML.');
    }
    setRawPreviewLoading(false);
  }

  async function applyBatchActivity() {
    if (multiSelectedIds.length === 0 || batchSaving) return;
    const ids = [...multiSelectedIds];
    const idSet = new Set(ids);
    const isActive = batchIsActive === 'active';
    await queryClient.cancelQueries({ queryKey: adminExerciseKeys.lists() });
    const optimisticListSnapshot = snapshotAdminExerciseLists(queryClient);
    const optimisticDetailSnapshots = ids.map((id) => [
      id,
      queryClient.getQueryData(adminExerciseKeys.detail(id)),
    ] as const);
    patchAdminExerciseLists(queryClient, (item) =>
      idSet.has(item.id) ? { ...item, isActive } : item,
    );
    for (const id of ids) {
      upsertAdminExerciseDetail(queryClient, id, { isActive });
    }

    const rollbackOptimisticBatch = () => {
      restoreAdminExerciseLists(queryClient, optimisticListSnapshot);
      for (const [id, data] of optimisticDetailSnapshots) {
        queryClient.setQueryData(adminExerciseKeys.detail(id), data);
      }
    };

    let res: Awaited<ReturnType<typeof batchUpdateExercisesMetaAction>>;
    try {
      res = await batchUpdateMutation.mutateAsync({
        ids,
        isActive,
      });
    } catch (error) {
      rollbackOptimisticBatch();
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Batch update failed.');
      return;
    }
    if (res.success) {
      setMessage(`Обновлено заданий: ${multiSelectedIds.length}.`);
      setIsError(false);
      clearMultiSelection();
      await refreshList({ force: true });
    } else {
      rollbackOptimisticBatch();
      setIsError(true);
      setMessage(res.error || 'Ошибка массового обновления.');
    }
  }

  useEffect(() => {
    if (!selectionMode) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearMultiSelection();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [selectionMode]);

  return {
    multiSelectedIds,
    setMultiSelectedIds,
    lastMultiSelectedId,
    setLastMultiSelectedId,
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
    setRawPreviewLoading,
    rawPreviewItems,
    setRawPreviewItems,
    toggleMultiSelectionByClick,
    clearMultiSelection,
    selectAllShownItems,
    applyBatchStatus,
    runRawPreviewAudit,
    applyBatchActivity,
  };
}
