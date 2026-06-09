'use client';

import { useRef } from 'react';
import type { Form } from '@/components/admin-form/types';
import { fetchExerciseById } from '@/components/admin-form/api';
import { formFromExerciseItem } from '@/components/admin-form/formMapping';
import { loadFormState } from '@/components/admin-form/draftStorage';
import { logDraftRecoveryDebug } from '@/components/admin-form/draftStorage';

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
  const loadExerciseSeqRef = useRef(0);

  async function loadExercise(id: number) {
    const requestSeq = ++loadExerciseSeqRef.current;
    logDraftRecoveryDebug('loadExercise:start', {
      id,
      requestSeq,
      currentSelectedId: selectedId,
      currentFormId: form.id ?? null,
      currentFormType: form.type,
    });
    const res = await fetchExerciseById(id);
    if (requestSeq !== loadExerciseSeqRef.current) {
      logDraftRecoveryDebug('loadExercise:staleResultIgnored', { id, requestSeq });
      return;
    }
    if (!res.success || !res.item) {
      logDraftRecoveryDebug('loadExercise:error', {
        id,
        error: res.error || 'Не удалось открыть задание.',
      });
      setIsError(true);
      setMessage(res.error || 'Не удалось открыть задание.');
      return;
    }
    const item = res.item as Record<string, unknown>;
    const nextForm = formFromExerciseItem(item);
    const loaded = loadFormState(id, nextForm);
    setForm(loaded);
    lastPersistedSnapshotRef.current = JSON.stringify(loaded);
    setSelectedId(id);
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
    if (switchingExerciseRef.current) return;
    logDraftRecoveryDebug('openExerciseWithAutosave:start', {
      nextId: id,
      currentSelectedId: selectedId,
      currentFormId: form.id ?? null,
      currentFormType: form.type,
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
      if (!saved) return;
      await loadExercise(id);
    } finally {
      logDraftRecoveryDebug('openExerciseWithAutosave:done', {
        nextId: id,
        finalSelectedId: selectedId,
      });
      switchingExerciseRef.current = false;
    }
  }

  return {
    loadExercise,
    openExerciseWithAutosave,
    loadExerciseSeqRef,
  };
}
