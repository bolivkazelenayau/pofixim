'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { useExerciseLoader } from '@/hooks/useExerciseLoader';
import { useExerciseSubmit } from '@/hooks/useExerciseSubmit';
import { useFormEffects } from '@/hooks/useFormEffects';
import { useFormPersistence } from '@/hooks/useFormPersistence';
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
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(
    initialSelectedExercise ? (initialSelectedId ?? null) : null,
  );
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
    isEdit,
    isDraftLoaded,
    saving,
    deleting,
    switchingExerciseRef,
    deletedExerciseIdsRef,
    sessionDraftIdsRef,
    onRefreshList: refreshList,
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
    deleting,
    router,
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

  const { loadExercise, openExerciseWithAutosave } = useExerciseLoader({
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
    router,
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
    openExerciseWithAutosave,
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
      onSubmit,
      onTypeChange: handleTypeChange,
      onGenerateSeedClick: handleGenerateSeedClick,
      onSeedManualChange: () => setIsSeedRegenerateArmed(false),
      onDeleteClick: () => setShowDeleteConfirmModal(true),
      onFloatingSaveClick: () => formRef.current?.requestSubmit(),
    },
  };
}
