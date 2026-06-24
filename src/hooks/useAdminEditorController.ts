'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { useExerciseLoader } from '@/hooks/useExerciseLoader';
import { useExerciseSubmit } from '@/hooks/useExerciseSubmit';
import { useFormEffects } from '@/hooks/useFormEffects';
import { useFormPersistence } from '@/hooks/useFormPersistence';
import { logAdminDebug } from '@/components/admin-form/debug';
import { buildDatabaseIndicator, clearPendingDraftMarker } from '@/components/admin-form/utils';
import type { Form, ListItem } from '@/components/admin-form/types';

type UseAdminEditorControllerConfig = {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  initialSelectedId: number | null;
  initialSelectedExercise: Record<string, unknown> | null;
  isDraftLoaded: boolean;
  setItems: React.Dispatch<React.SetStateAction<ListItem[]>>;
  setTotalItems: React.Dispatch<React.SetStateAction<number | null>>;
  setMatchingItems: React.Dispatch<React.SetStateAction<number | null>>;
  hasActiveListFilter: boolean;
  refreshList: (opts?: { force?: boolean; includeTotal?: boolean }) => Promise<void>;
  setIsError: (value: boolean) => void;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  message: string;
  isError: boolean;
};

export function useAdminEditorController({
  form,
  setForm,
  initialSelectedId,
  initialSelectedExercise,
  isDraftLoaded,
  setItems,
  setTotalItems,
  setMatchingItems,
  hasActiveListFilter,
  refreshList,
  setIsError,
  setMessage,
  message,
  isError,
}: UseAdminEditorControllerConfig) {
  const initialSelectedState = initialSelectedExercise ? (initialSelectedId ?? null) : null;
  const [selectedId, setSelectedIdState] = useState<number | null>(initialSelectedState);
  const selectedIdRef = useRef<number | null>(initialSelectedState);
  const setSelectedId = useCallback<React.Dispatch<React.SetStateAction<number | null>>>((value) => {
    const next =
      typeof value === 'function'
        ? (value as (current: number | null) => number | null)(selectedIdRef.current)
        : value;
    selectedIdRef.current = next;
    setSelectedIdState(next);
  }, []);
  const [showFloatingSave, setShowFloatingSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialSelectionPending, setInitialSelectionPending] = useState(
    Boolean(initialSelectedId && !initialSelectedExercise),
  );

  const switchingExerciseRef = useRef(false);
  const deletedExerciseIdsRef = useRef<Set<number>>(new Set());
  const initializedFromUrlRef = useRef(Boolean(initialSelectedId));
  const initialTargetIdRef = useRef<number | null>(initialSelectedId);
  const initialSelectionResolvedRef = useRef(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const mainSaveAnchorRef = useRef<HTMLDivElement | null>(null);
  const sessionDraftIdsRef = useRef<Set<number>>(new Set());
  const cancelPendingExerciseLoadRef = useRef<(reason: string) => void>(() => {});
  const savingRef = useRef(saving);
  const deletingRef = useRef(deleting);

  useEffect(() => {
    savingRef.current = saving;
    deletingRef.current = deleting;
  }, [saving, deleting]);

  const isEdit = typeof form.id === 'number';

  const {
    databaseSaveState,
    databaseSavedAt,
    setDatabaseSaveState,
    setDatabaseSavedAt,
    lastPersistedSnapshotRef,
    cancelPendingAutosaves,
    autosaveCurrentToDbIfNeeded,
    storeLocal: storeLocalDraft,
    markSaveSucceeded: markDatabaseSaveSucceeded,
  } = useFormPersistence({
    form,
    setForm,
    isEdit,
    isDraftLoaded,
    saving,
    deleting,
    switchingExerciseRef,
    deletedExerciseIdsRef,
    sessionDraftIdsRef,
    setIsError,
    setMessage,
  });

  const {
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
  } = useExerciseSubmit({
    form,
    isEdit,
    selectedId,
    selectedIdRef,
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
    cancelPendingExerciseLoad: (reason) => cancelPendingExerciseLoadRef.current(reason),
    setDatabaseSaveState,
    setDatabaseSavedAt,
    lastPersistedSnapshotRef,
    cancelPendingAutosaves,
    storeLocalDraft,
    markDatabaseSaveSucceeded,
  });

  const {
    draftRecovery,
    offerExistingDraftRecovery,
    useRecoveredDraft,
    useDatabaseVersion,
  } = useDraftRecovery({
    setForm,
    setSelectedId,
    setDatabaseSaveState,
    setDatabaseSavedAt,
    setIsError,
    setMessage,
    lastPersistedSnapshotRef,
    sessionDraftIdsRef,
    clearPendingDraftMarker,
  });

  const { loadExercise, openExerciseWithAutosave, cancelPendingExerciseLoad } = useExerciseLoader({
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
  });
  useEffect(() => {
    cancelPendingExerciseLoadRef.current = cancelPendingExerciseLoad;
  }, [cancelPendingExerciseLoad]);

  function cancelExerciseOpening(reason: string) {
    cancelPendingExerciseLoad(reason);
    logAdminDebug('openExercise:cancel-pending', {
      reason,
      selectedId,
      formId: form.id ?? null,
    });
  }

  async function guardedOpenExerciseWithAutosave(id: number) {
    if (savingRef.current || deletingRef.current) {
      logAdminDebug('openExercise:blocked', {
        nextId: id,
        selectedId,
        formId: form.id ?? null,
        saving: savingRef.current,
        deleting: deletingRef.current,
      });
      return;
    }

    await openExerciseWithAutosave(id);
  }

  useFormEffects({
    form,
    isDraftLoaded,
    selectedId,
    initialSelectedId,
    initialSelectedExercise,
    initialSelectionPending,
    initialSelectionResolvedRef,
    initialTargetIdRef,
    initializedFromUrlRef,
    lastPersistedSnapshotRef,
    sidebarRef,
    mainSaveAnchorRef,
    setForm,
    setInitialSelectionPending,
    setHasUnsavedChanges,
    setShowFloatingSave,
    offerExistingDraftRecovery,
    loadExercise,
  });

  return {
    selectedId,
    sidebarRef,
    formRef,
    mainSaveAnchorRef,
    databaseIndicator: buildDatabaseIndicator(databaseSaveState, databaseSavedAt),
    openExerciseWithAutosave: guardedOpenExerciseWithAutosave,
    status: {
      isEdit,
      hasUnsavedChanges,
      message,
      isError,
      saving,
      deleting,
      showFloatingSave,
    },
    recovery: {
      draft: draftRecovery,
      initialSelectionPending,
      initialSelectedExercise,
      onUseDatabaseVersion: useDatabaseVersion,
      onUseRecoveredDraft: useRecoveredDraft,
    },
    modals: {
      showSeedRegenerate: showSeedRegenerateModal,
      showDeleteConfirm: showDeleteConfirmModal,
      onSeedRegenerateCancel: () => setShowSeedRegenerateModal(false),
      onSeedRegenerateConfirm: () => {
        generateSeedKey();
        setShowSeedRegenerateModal(false);
      },
      onDeleteCancel: () => setShowDeleteConfirmModal(false),
      onDeleteConfirm: () => void handleDeleteExercise(),
    },
    actions: {
      onNewDraft: startNewDraft,
      onRevisionRestored: loadExercise,
      onSubmit,
      onTypeChange: handleTypeChange,
      onGenerateSeedClick: handleGenerateSeedClick,
      onSeedManualChange: () => setIsSeedRegenerateArmed(false),
      onDeleteClick: () => setShowDeleteConfirmModal(true),
      onFloatingSaveClick: () => formRef.current?.requestSubmit(),
      onSaveIntent: () => cancelExerciseOpening('save-button-pointerdown'),
    },
  };
}
