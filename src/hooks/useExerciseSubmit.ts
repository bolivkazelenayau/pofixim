'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Form, ListItem } from '@/components/admin-form/types';
import { EMPTY } from '@/components/admin-form/defaults';
import { adminExerciseKeys } from '@/components/admin-form/queryKeys';
import {
  decrementAdminExerciseListTotals,
  patchAdminExerciseLists,
  restoreAdminExerciseLists,
  snapshotAdminExerciseLists,
  upsertAdminExerciseDetail,
} from '@/components/admin-form/queryCache';
import { getDraftKey, loadFormState } from '@/components/admin-form/draftStorage';
import {
  buildTypeChangeMessage,
  convertFormForTypeChange,
  seedPrefixForType,
} from '@/components/admin-form/formTypeConversion';
import { buildPayloadFromForm } from '@/components/admin-form/formMapping';
import {
  createExerciseAction,
  deleteExerciseAction,
  updateExerciseAction,
} from '@/app/actions/admin';
import { slugFromPrompt, randomShortId } from '@/components/admin-form/utils';
import { logAdminDebug } from '@/components/admin-form/debug';

interface UseExerciseSubmitOptions {
  form: Form;
  isEdit: boolean;
  selectedId: number | null;
  deleting: boolean;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setDeleting: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedId: React.Dispatch<React.SetStateAction<number | null>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsError: (value: boolean) => void;
  deletedExerciseIdsRef: React.MutableRefObject<Set<number>>;
  clearPendingDraftMarker: (id: number) => void;
  // from useExerciseList
  setItems: React.Dispatch<React.SetStateAction<ListItem[]>>;
  setTotalItems: React.Dispatch<React.SetStateAction<number | null>>;
  setMatchingItems: React.Dispatch<React.SetStateAction<number | null>>;
  hasActiveListFilter: boolean;
  refreshList: (opts?: { force?: boolean; includeTotal?: boolean }) => Promise<void>;
  cancelPendingExerciseLoad: (reason: string) => void;
  // from useFormPersistence
  setDatabaseSaveState: (state: 'draft' | 'local' | 'saving' | 'saved') => void;
  setDatabaseSavedAt: React.Dispatch<React.SetStateAction<Date | null>>;
  lastPersistedSnapshotRef: React.MutableRefObject<string>;
  cancelPendingAutosaves: () => void;
  storeLocalDraft: (f: Form) => void;
  markDatabaseSaveSucceeded: (f: Form, snapshot: string) => void;
}

function updateSavedListItem(item: ListItem, form: Form): ListItem {
  const updatedAt = new Date().toISOString();
  return {
    ...item,
    type: form.type,
    seedKey: form.seedKey || null,
    prompt: form.prompt,
    qualityStatus: form.qualityStatus,
    isActive: form.isActive,
    updatedAt,
    updatedAtCursor: updatedAt,
    skillTags: form.skillTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function setExerciseUrlSelection(id: number, reason: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('exercise', String(id));
  url.searchParams.delete('id');
  url.searchParams.delete('exerciseId');
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  hashParams.delete('exercise');
  url.hash = hashParams.toString();
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;
  logAdminDebug('url-sync:setExerciseSelection', {
    reason,
    id,
    from: currentUrl,
    to: nextUrl,
  });
  window.history.replaceState(null, '', nextUrl);
}

export function useExerciseSubmit({
  form,
  isEdit,
  selectedId,
  deleting,
  setForm,
  setSaving,
  setDeleting,
  setSelectedId,
  setMessage,
  setIsError,
  deletedExerciseIdsRef,
  clearPendingDraftMarker,
  setItems,
  setTotalItems,
  setMatchingItems,
  hasActiveListFilter,
  refreshList,
  cancelPendingExerciseLoad,
  setDatabaseSaveState,
  setDatabaseSavedAt,
  lastPersistedSnapshotRef,
  cancelPendingAutosaves,
  storeLocalDraft,
  markDatabaseSaveSucceeded,
}: UseExerciseSubmitOptions) {
  const queryClient = useQueryClient();
  const [isSeedRegenerateArmed, setIsSeedRegenerateArmed] = useState(false);
  const [showSeedRegenerateModal, setShowSeedRegenerateModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const saveExerciseMutation = useMutation({
    mutationFn: async (input: { payload: ReturnType<typeof buildPayloadFromForm>; wasEdit: boolean; id?: number }) =>
      input.wasEdit
        ? updateExerciseAction({ ...input.payload, id: input.id! })
        : createExerciseAction(input.payload),
  });
  const deleteExerciseMutation = useMutation({
    mutationFn: deleteExerciseAction,
  });

  function clearExerciseUrlSelection() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    hashParams.delete('exercise');
    url.searchParams.delete('exercise');
    url.searchParams.delete('id');
    url.searchParams.delete('exerciseId');
    url.hash = hashParams.toString();
    logAdminDebug('url-sync:clearExerciseSelection', {
      formId: form.id ?? null,
      selectedId,
      to: `${url.pathname}${url.search}${url.hash}`,
    });
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    cancelPendingExerciseLoad('manual-submit');
    setSaving(true);
    setDatabaseSaveState('saving');
    setMessage('');
    setIsError(false);
    const payload = buildPayloadFromForm(form);

    const wasEdit = isEdit;
    const optimisticListSnapshot =
      wasEdit && form.id ? snapshotAdminExerciseLists(queryClient) : null;
    const optimisticDetailSnapshot =
      wasEdit && form.id
        ? queryClient.getQueryData(adminExerciseKeys.detail(form.id))
        : undefined;
    logAdminDebug('submit:start', {
      wasEdit,
      formId: form.id ?? null,
      selectedId,
      url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      payloadId: payload.id ?? null,
      seedKey: payload.seedKey ?? null,
    });
    if (wasEdit && form.id !== selectedId) {
      logAdminDebug('submit:blocked-id-mismatch', {
        formId: form.id ?? null,
        selectedId,
      });
      setSaving(false);
      setDatabaseSaveState('local');
      setIsError(true);
      setMessage(
        `Сохранение остановлено: открыта форма #${form.id ?? 'n/a'}, а выбранное задание #${selectedId ?? 'n/a'}. Обновите задание из списка и повторите сохранение.`,
      );
      storeLocalDraft(form);
      return;
    }

    if (wasEdit && form.id) {
      await queryClient.cancelQueries({ queryKey: adminExerciseKeys.lists() });
      await queryClient.cancelQueries({ queryKey: adminExerciseKeys.detail(form.id) });
      patchAdminExerciseLists(queryClient, (item) =>
        item.id === form.id ? updateSavedListItem(item, form) : item,
      );
      upsertAdminExerciseDetail(queryClient, form.id, payload as Record<string, unknown>);
    }

    const rollbackOptimisticSave = () => {
      if (!wasEdit || !form.id || !optimisticListSnapshot) return;
      restoreAdminExerciseLists(queryClient, optimisticListSnapshot);
      queryClient.setQueryData(adminExerciseKeys.detail(form.id), optimisticDetailSnapshot);
    };

    let res: Awaited<ReturnType<typeof updateExerciseAction | typeof createExerciseAction>>;
    try {
      res = await saveExerciseMutation.mutateAsync({ payload, wasEdit, id: form.id });
    } catch (error) {
      rollbackOptimisticSave();
      setSaving(false);
      setDatabaseSaveState('local');
      storeLocalDraft(form);
      setIsError(true);
      setMessage(
        `Ð˜Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ñ‹ Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾, Ð½Ð¾ Ð½Ðµ Ð·Ð°Ð¿Ð¸ÑÐ°Ð½Ñ‹ Ð² Ð±Ð°Ð·Ñƒ: ${
          error instanceof Error ? error.message : 'Ð¾ÑˆÐ¸Ð±ÐºÐ° ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ñ'
        }.`,
      );
      return;
    }

    if (res.success) {
      logAdminDebug('submit:success', {
        wasEdit,
        formId: form.id ?? null,
        selectedId,
        resultId: 'id' in res ? res.id ?? null : null,
        url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      });
      setMessage(wasEdit ? 'Изменения сохранены.' : 'Задание создано.');
      localStorage.removeItem(getDraftKey(form.id));
      if (form.id) clearPendingDraftMarker(form.id);
      const nextForm = wasEdit ? form : loadFormState(null, EMPTY);
      setForm(nextForm);
      if (wasEdit) {
        markDatabaseSaveSucceeded(form, JSON.stringify(form));
        if (form.id) {
          await queryClient.invalidateQueries({ queryKey: adminExerciseKeys.detail(form.id) });
        }
      } else {
        lastPersistedSnapshotRef.current = JSON.stringify(nextForm);
        setDatabaseSaveState('draft');
        setDatabaseSavedAt(null);
      }
      if (!wasEdit) {
        setTotalItems((current) => (current === null ? current : current + 1));
      }
      if (wasEdit && form.id) {
        setExerciseUrlSelection(form.id, 'submit-success-edit');
        window.setTimeout(() => setExerciseUrlSelection(form.id!, 'submit-success-edit-posttick'), 0);
        window.setTimeout(() => setExerciseUrlSelection(form.id!, 'submit-success-edit-settle'), 250);
        setItems((current) =>
          current.map((item) => (item.id === form.id ? updateSavedListItem(item, form) : item)),
        );
        logAdminDebug('submit:preserve-list-order', {
          formId: form.id,
          selectedId,
          url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        });
      } else {
        await refreshList({ force: true });
        logAdminDebug('submit:after-refresh', {
          wasEdit,
          formId: form.id ?? null,
          selectedId,
          url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        });
      }
    } else {
      rollbackOptimisticSave();
      logAdminDebug('submit:error', {
        wasEdit,
        formId: form.id ?? null,
        selectedId,
        error: res.error ?? null,
      });
      storeLocalDraft(form);
      setDatabaseSaveState('local');
      setIsError(true);
      if (res.error === 'Unauthorized') {
        setMessage('Сессия истекла. Изменения сохранены локально. Войдите снова, чтобы записать их в базу.');
      } else {
        setMessage(`Изменения сохранены локально, но не записаны в базу: ${res.error || 'ошибка сохранения'}.`);
      }
    }

    setSaving(false);
  }

  async function handleDeleteExercise() {
    if (!isEdit || deleting) return;
    setShowDeleteConfirmModal(false);
    cancelPendingAutosaves();
    setDeleting(true);
    setMessage('');
    setIsError(false);

    const deletedId = form.id!;
    deletedExerciseIdsRef.current.add(deletedId);
    await queryClient.cancelQueries({ queryKey: adminExerciseKeys.lists() });
    await queryClient.cancelQueries({ queryKey: adminExerciseKeys.detail(deletedId) });
    const optimisticListSnapshot = snapshotAdminExerciseLists(queryClient);
    const optimisticDetailSnapshot = queryClient.getQueryData(adminExerciseKeys.detail(deletedId));
    patchAdminExerciseLists(queryClient, (item) => (item.id === deletedId ? null : item));
    decrementAdminExerciseListTotals(queryClient);

    const rollbackOptimisticDelete = () => {
      restoreAdminExerciseLists(queryClient, optimisticListSnapshot);
      queryClient.setQueryData(adminExerciseKeys.detail(deletedId), optimisticDetailSnapshot);
      deletedExerciseIdsRef.current.delete(deletedId);
    };

    let res: Awaited<ReturnType<typeof deleteExerciseAction>>;
    try {
      res = await deleteExerciseMutation.mutateAsync(deletedId);
    } catch (error) {
      rollbackOptimisticDelete();
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'ÐžÑˆÐ¸Ð±ÐºÐ° ÑƒÐ´Ð°Ð»ÐµÐ½Ð¸Ñ.');
      setDeleting(false);
      return;
    }
    if (res.success) {
      setMessage('Задание удалено.');
      localStorage.removeItem(getDraftKey(form.id));
      clearPendingDraftMarker(deletedId);
      setForm(loadFormState(null, EMPTY));
      setSelectedId(null);
      setDatabaseSaveState('draft');
      setDatabaseSavedAt(null);
      clearExerciseUrlSelection();
      setIsSeedRegenerateArmed(false);
      setShowSeedRegenerateModal(false);
      setShowDeleteConfirmModal(false);
      setItems((current) => current.filter((item) => item.id !== deletedId));
      setTotalItems((current) => (current === null ? current : Math.max(0, current - 1)));
      setMatchingItems((current) =>
        hasActiveListFilter && current !== null ? Math.max(0, current - 1) : current,
      );
      queryClient.removeQueries({ queryKey: adminExerciseKeys.detail(deletedId) });
      await refreshList({ force: true });
    } else {
      rollbackOptimisticDelete();
      setIsError(true);
      setMessage(res.error || 'Ошибка удаления.');
    }

    setDeleting(false);
  }

  function handleTypeChange(nextType: Form['type']) {
    setForm((current) => {
      const nextForm = convertFormForTypeChange(current, nextType);
      const transferMessage = buildTypeChangeMessage(current, nextForm);
      if (transferMessage) {
        setIsError(false);
        setMessage(transferMessage);
      }
      return nextForm;
    });
  }

  function generateSeedKey() {
    const prefix = seedPrefixForType(form.type);
    const slug = slugFromPrompt(form.prompt);
    const suffix = randomShortId();
    setForm((f) => ({ ...f, seedKey: `${prefix}-${slug}-${suffix}` }));
    setIsSeedRegenerateArmed(false);
  }

  function handleGenerateSeedClick() {
    const hasSeed = form.seedKey.trim().length > 0;
    if (!hasSeed) {
      generateSeedKey();
      return;
    }

    if (!isSeedRegenerateArmed) {
      setIsSeedRegenerateArmed(true);
      setIsError(false);
      setMessage(
        'Seed уже задан. Нажмите «Сгенерировать» еще раз, чтобы подтвердить перегенерацию.',
      );
      return;
    }

    setIsSeedRegenerateArmed(false);
    setShowSeedRegenerateModal(true);
  }

  function startNewDraft() {
    setForm(loadFormState(null, EMPTY));
    setSelectedId(null);
    setDatabaseSaveState('draft');
    setDatabaseSavedAt(null);
    clearExerciseUrlSelection();
    setMessage('');
    setIsSeedRegenerateArmed(false);
    setShowSeedRegenerateModal(false);
  }

  useEffect(() => {
    if (!isSeedRegenerateArmed) return;
    const timer = setTimeout(() => setIsSeedRegenerateArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [isSeedRegenerateArmed]);

  return {
    isSeedRegenerateArmed,
    showSeedRegenerateModal,
    showDeleteConfirmModal,
    setIsSeedRegenerateArmed,
    setShowSeedRegenerateModal,
    setShowDeleteConfirmModal,
    onSubmit,
    handleDeleteExercise,
    handleTypeChange,
    handleGenerateSeedClick,
    generateSeedKey,
    startNewDraft,
    cancelPendingExerciseLoad,
  };
}
