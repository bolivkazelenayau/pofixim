'use client';

import { useCallback, useState } from 'react';
import type { Form } from '@/components/admin-form/types';
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
    if (sessionId && sessionId === currentSessionId) {
      sessionDraftIdsRef.current.add(id);
      setForm(localDraft);
      setSelectedId(id);
      logAdminDebug('draftRecovery:autoRestoreSameSession', {
        id,
        localDraftId: localDraft.id ?? null,
        serverFormId: serverForm.id ?? null,
      });
      setDatabaseSaveState('local');
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
      setForm(localDraft);
      setSelectedId(id);
      logAdminDebug('draftRecovery:autoRestoreSessionRef', {
        id,
        localDraftId: localDraft.id ?? null,
        serverFormId: serverForm.id ?? null,
      });
      setDatabaseSaveState('local');
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
  }, [setForm, setSelectedId, setDatabaseSaveState, sessionDraftIdsRef, clearPendingDraftMarker]);

  const useRecoveredDraft = useCallback(() => {
    if (!draftRecovery) return;
    logDraftRecoveryDebug('useRecoveredDraft', {
      id: draftRecovery.id,
      draftType: draftRecovery.draftForm.type,
      serverType: draftRecovery.serverForm.type,
    });
    lastPersistedSnapshotRef.current = JSON.stringify(draftRecovery.serverForm);
    setForm(draftRecovery.draftForm);
    setSelectedId(draftRecovery.id);
    logAdminDebug('draftRecovery:useRecoveredDraft', {
      id: draftRecovery.id,
      draftFormId: draftRecovery.draftForm.id ?? null,
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
