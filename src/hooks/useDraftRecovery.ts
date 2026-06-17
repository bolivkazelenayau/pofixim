'use client';

import { useCallback, useState } from 'react';
import type { Form } from '@/components/admin-form/types';
import { validateExerciseEditorInput } from '@/app/actions/admin-exercise-validation';
import { buildPayloadFromForm } from '@/components/admin-form/formMapping';
import { getDraftKey, getDraftSessionId, logDraftRecoveryDebug, readStoredDraft } from '@/components/admin-form/draftStorage';
import { logAdminDebug } from '@/components/admin-form/debug';
import type { DraftRecoveryState } from '@/components/admin-form/types';

type UseDraftRecoveryConfig = {
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  setSelectedId: (id: number | null) => void;
  setDatabaseSaveState: (state: 'draft' | 'local' | 'saving' | 'saved') => void;
  setDatabaseSavedAt: (date: Date | null) => void;
  setIsError: (value: boolean) => void;
  setMessage: (value: string) => void;
  lastPersistedSnapshotRef: React.MutableRefObject<string>;
  sessionDraftIdsRef: React.MutableRefObject<Set<number>>;
  clearPendingDraftMarker: (id: number) => void;
};

function getAutoRestoreBlockReason(form: Form) {
  if (!form.prompt.trim()) {
    return 'draft без формулировки';
  }
  if (!form.explanation.trim()) {
    return 'draft без объяснения';
  }
  if (form.type === 'dictation' && !form.dictationText.trim()) {
    return 'draft без эталонной расшифровки';
  }

  try {
    const validationError = validateExerciseEditorInput(buildPayloadFromForm(form));
    return validationError;
  } catch (error) {
    return error instanceof Error ? error.message : 'draft не проходит проверку';
  }
}

function withServerVersion(draftForm: Form, serverForm: Form): Form {
  return {
    ...draftForm,
    updatedAt: serverForm.updatedAt ?? draftForm.updatedAt ?? null,
  };
}

export function useDraftRecovery(config: UseDraftRecoveryConfig) {
  const {
    setForm,
    setSelectedId,
    setDatabaseSaveState,
    setDatabaseSavedAt,
    setIsError,
    setMessage,
    lastPersistedSnapshotRef,
    sessionDraftIdsRef,
    clearPendingDraftMarker,
  } = config;

  const [draftRecovery, setDraftRecovery] = useState<DraftRecoveryState>(null);

  const offerExistingDraftRecovery = useCallback((id: number, serverForm: Form) => {
    const storedDraft = readStoredDraft(id);
    if (!storedDraft) {
      return;
    }
    const { form: localDraft, sessionId } = storedDraft;
    if (JSON.stringify(localDraft) === JSON.stringify(serverForm)) {
      localStorage.removeItem(getDraftKey(id));
      clearPendingDraftMarker(id);
      sessionDraftIdsRef.current.delete(id);
      logDraftRecoveryDebug('offerExistingDraftRecovery:draftMatchesServer', { id, sessionId });
      return;
    }
    const currentSessionId = getDraftSessionId();
    const autoRestoreBlockReason = getAutoRestoreBlockReason(localDraft);
    if (autoRestoreBlockReason) {
      logDraftRecoveryDebug('offerExistingDraftRecovery:showModalInvalidDraft', {
        id,
        draftSessionId: sessionId,
        currentSessionId,
        reason: autoRestoreBlockReason,
        serverType: serverForm.type,
        draftType: localDraft.type,
      });
      setIsError(false);
      setMessage(
        `Локальная копия требует выбора: ${autoRestoreBlockReason}. Можно восстановить её вручную или открыть версию из БД.`,
      );
      setDraftRecovery({ id, serverForm, draftForm: localDraft });
      return;
    }

    if (sessionId && sessionId === currentSessionId) {
      const versionedDraft = withServerVersion(localDraft, serverForm);
      sessionDraftIdsRef.current.add(id);
      setForm(versionedDraft);
      setSelectedId(id);
      logAdminDebug('draftRecovery:autoRestoreSameSession', {
        id,
        localDraftId: versionedDraft.id ?? null,
        serverFormId: serverForm.id ?? null,
      });
      setDatabaseSaveState('local');
      setIsError(false);
      setMessage('Локальные изменения восстановлены. Они пока отличаются от версии в БД.');
      setDraftRecovery(null);
      logDraftRecoveryDebug('offerExistingDraftRecovery:autoRestoreSameSession', {
        id,
        draftSessionId: sessionId,
        currentSessionId,
        serverType: serverForm.type,
        draftType: localDraft.type,
      });
      return;
    }
    if (sessionDraftIdsRef.current.has(id)) {
      const versionedDraft = withServerVersion(localDraft, serverForm);
      setForm(versionedDraft);
      setSelectedId(id);
      logAdminDebug('draftRecovery:autoRestoreSessionRef', {
        id,
        localDraftId: versionedDraft.id ?? null,
        serverFormId: serverForm.id ?? null,
      });
      setDatabaseSaveState('local');
      setIsError(false);
      setMessage('Локальные изменения восстановлены. Они пока отличаются от версии в БД.');
      setDraftRecovery(null);
      logDraftRecoveryDebug('offerExistingDraftRecovery:autoRestoreSessionRef', {
        id,
        draftSessionId: sessionId,
        currentSessionId,
        serverType: serverForm.type,
        draftType: localDraft.type,
      });
      return;
    }
    logDraftRecoveryDebug('offerExistingDraftRecovery:showModal', {
      id,
      draftSessionId: sessionId,
      currentSessionId,
      serverType: serverForm.type,
      draftType: localDraft.type,
    });
    setDraftRecovery({ id, serverForm, draftForm: localDraft });
  }, [setForm, setSelectedId, setDatabaseSaveState, sessionDraftIdsRef, clearPendingDraftMarker, setIsError, setMessage]);

  const useRecoveredDraft = useCallback(() => {
    if (!draftRecovery) return;
    const versionedDraft = withServerVersion(
      draftRecovery.draftForm,
      draftRecovery.serverForm,
    );
    logDraftRecoveryDebug('useRecoveredDraft', {
      id: draftRecovery.id,
      draftType: draftRecovery.draftForm.type,
      serverType: draftRecovery.serverForm.type,
    });
    lastPersistedSnapshotRef.current = JSON.stringify(draftRecovery.serverForm);
    setForm(versionedDraft);
    setSelectedId(draftRecovery.id);
    logAdminDebug('draftRecovery:useRecoveredDraft', {
      id: draftRecovery.id,
      draftFormId: versionedDraft.id ?? null,
      serverFormId: draftRecovery.serverForm.id ?? null,
    });
    setDatabaseSaveState('local');
    setDraftRecovery(null);
    setIsError(false);
    setMessage('Локальные изменения восстановлены. Автосохранение включено.');
  }, [draftRecovery, lastPersistedSnapshotRef, setForm, setSelectedId, setDatabaseSaveState, setIsError, setMessage]);

  const useDatabaseVersion = useCallback(() => {
    if (!draftRecovery) return;
    logDraftRecoveryDebug('useDatabaseVersion', {
      id: draftRecovery.id,
      draftType: draftRecovery.draftForm.type,
      serverType: draftRecovery.serverForm.type,
    });
    localStorage.removeItem(getDraftKey(draftRecovery.id));
    clearPendingDraftMarker(draftRecovery.id);
    sessionDraftIdsRef.current.delete(draftRecovery.id);
    setForm(draftRecovery.serverForm);
    lastPersistedSnapshotRef.current = JSON.stringify(draftRecovery.serverForm);
    setSelectedId(draftRecovery.id);
    logAdminDebug('draftRecovery:useDatabaseVersion', {
      id: draftRecovery.id,
      draftFormId: draftRecovery.draftForm.id ?? null,
      serverFormId: draftRecovery.serverForm.id ?? null,
    });
    setDatabaseSaveState('saved');
    setDatabaseSavedAt(null);
    setDraftRecovery(null);
    setIsError(false);
    setMessage('Используется актуальная версия из базы.');
  }, [draftRecovery, clearPendingDraftMarker, lastPersistedSnapshotRef, setForm, setSelectedId, setDatabaseSaveState, setDatabaseSavedAt, sessionDraftIdsRef, setIsError, setMessage]);

  return {
    draftRecovery,
    setDraftRecovery,
    offerExistingDraftRecovery,
    useRecoveredDraft,
    useDatabaseVersion,
  };
}
