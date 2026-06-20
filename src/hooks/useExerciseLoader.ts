'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import type { Form } from '@/components/admin-form/types';
import { fetchExerciseById } from '@/components/admin-form/api';
import { adminExerciseKeys } from '@/components/admin-form/queryKeys';
import { formFromExerciseItem } from '@/components/admin-form/formMapping';
import { loadFormState } from '@/components/admin-form/draftStorage';
import { logDraftRecoveryDebug } from '@/components/admin-form/draftStorage';
import { logAdminDebug } from '@/components/admin-form/debug';

type UseExerciseLoaderConfig = {
  form: Form;
  selectedId: number | null;
  switchingExerciseRef: React.MutableRefObject<boolean>;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  setSelectedId: (id: number | null) => void;
  setDatabaseSaveState: (state: 'draft' | 'local' | 'saving' | 'saved') => void;
  setDatabaseSavedAt: (date: Date | null) => void;
  setIsError: (value: boolean) => void;
  setMessage: (value: string) => void;
  setIsSeedRegenerateArmed: (value: boolean) => void;
  setShowSeedRegenerateModal: (value: boolean) => void;
  lastPersistedSnapshotRef: React.MutableRefObject<string>;
  offerExistingDraftRecovery: (id: number, serverForm: Form) => void;
  autosaveCurrentToDbIfNeeded: (targetId: number) => Promise<boolean>;
};

export function useExerciseLoader({
  form,
  selectedId,
  switchingExerciseRef,
  setForm,
  setSelectedId,
  setDatabaseSaveState,
  setDatabaseSavedAt,
  setIsError,
  setMessage,
  setIsSeedRegenerateArmed,
  setShowSeedRegenerateModal,
  lastPersistedSnapshotRef,
  offerExistingDraftRecovery,
  autosaveCurrentToDbIfNeeded,
}: UseExerciseLoaderConfig) {
  const queryClient = useQueryClient();
  const loadExerciseSeqRef = useRef(0);

  function cancelPendingExerciseLoad(reason: string) {
    loadExerciseSeqRef.current += 1;
    logAdminDebug('loadExercise:cancelPending', {
      reason,
      nextRequestSeq: loadExerciseSeqRef.current,
      currentSelectedId: selectedId,
      currentFormId: form.id ?? null,
    });
  }

  async function loadExercise(id: number) {
    const requestSeq = ++loadExerciseSeqRef.current;
    logDraftRecoveryDebug('loadExercise:start', {
      id,
      requestSeq,
      currentSelectedId: selectedId,
      currentFormId: form.id ?? null,
      currentFormType: form.type,
    });
    logAdminDebug('loadExercise:start', {
      id,
      requestSeq,
      currentSelectedId: selectedId,
      currentFormId: form.id ?? null,
      url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    });
    const res = await queryClient.fetchQuery({
      queryKey: adminExerciseKeys.detail(id),
      queryFn: () => fetchExerciseById(id),
      staleTime: 0,
    });
    if (requestSeq !== loadExerciseSeqRef.current) {
      logDraftRecoveryDebug('loadExercise:staleResultIgnored', { id, requestSeq });
      logAdminDebug('loadExercise:staleResultIgnored', { id, requestSeq });
      return;
    }
    if (!res.success || !res.item) {
      logDraftRecoveryDebug('loadExercise:error', {
        id,
        error: res.error || 'Не удалось открыть задание.',
      });
      setIsError(true);
      setMessage(res.error || 'Не удалось открыть задание.');
      logAdminDebug('loadExercise:error', { id, requestSeq, error: res.error ?? null });
      return;
    }
    const item = res.item as Record<string, unknown>;
    const nextForm = formFromExerciseItem(item);
    const loaded = loadFormState(id, nextForm);
    lastPersistedSnapshotRef.current = JSON.stringify(loaded);
    setSelectedId(id);
    setForm(loaded);
    logAdminDebug('loadExercise:applied', {
      id,
      requestSeq,
      loadedFormId: loaded.id ?? null,
      url: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    });
    setDatabaseSaveState('saved');
    setDatabaseSavedAt(null);
    logDraftRecoveryDebug('loadExercise:loaded', {
      id,
      requestSeq,
      loadedType: loaded.type,
    });
    offerExistingDraftRecovery(id, loaded);
    setMessage('');
    setIsSeedRegenerateArmed(false);
    setShowSeedRegenerateModal(false);
  }

  async function openExerciseWithAutosave(id: number) {
    if (switchingExerciseRef.current) {
      logAdminDebug('openExerciseWithAutosave:skipped-switching', {
        nextId: id,
        currentSelectedId: selectedId,
        currentFormId: form.id ?? null,
      });
      return;
    }
    logDraftRecoveryDebug('openExerciseWithAutosave:start', {
      nextId: id,
      currentSelectedId: selectedId,
      currentFormId: form.id ?? null,
      currentFormType: form.type,
    });
    logAdminDebug('openExerciseWithAutosave:start', {
      nextId: id,
      currentSelectedId: selectedId,
      currentFormId: form.id ?? null,
    });
    switchingExerciseRef.current = true;
    try {
      const saved = await autosaveCurrentToDbIfNeeded(id);
      logDraftRecoveryDebug('openExerciseWithAutosave:autosaveResult', {
        nextId: id,
        saved,
        currentSelectedId: selectedId,
        currentFormId: form.id ?? null,
        currentFormType: form.type,
      });
      logAdminDebug('openExerciseWithAutosave:autosaveResult', {
        nextId: id,
        saved,
        currentSelectedId: selectedId,
        currentFormId: form.id ?? null,
      });
      if (!saved) return;
      await loadExercise(id);
    } finally {
      logDraftRecoveryDebug('openExerciseWithAutosave:done', {
        nextId: id,
        selectedIdSnapshot: selectedId,
      });
      logAdminDebug('openExerciseWithAutosave:done', {
        nextId: id,
        selectedIdSnapshot: selectedId,
      });
      switchingExerciseRef.current = false;
    }
  }

  return {
    loadExercise,
    openExerciseWithAutosave,
    loadExerciseSeqRef,
    cancelPendingExerciseLoad,
  };
}
