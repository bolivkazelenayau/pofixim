'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildPayloadFromForm } from '@/components/admin-form/formMapping';
import { updateExerciseAction } from '@/app/actions/admin';
import { writeStoredDraft, getDraftKey } from '@/components/admin-form/draftStorage';
import type { Form } from '@/components/admin-form/types';
import { publishExerciseUpdated } from '@/lib/exercise-update-events';
import { getFormContentSnapshot, persistedSnapshotMatchesForm } from './formSnapshots';

type FormPersistenceConfig = {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  isEdit: boolean;
  isDraftLoaded: boolean;
  saving: boolean;
  deleting: boolean;
  switchingExerciseRef: React.MutableRefObject<boolean>;
  deletedExerciseIdsRef: React.MutableRefObject<Set<number>>;
  sessionDraftIdsRef: React.MutableRefObject<Set<number>>;
  setIsError: (value: boolean) => void;
  setMessage: (value: string) => void;
};

function clearPendingDraftCookie(id: number) {
  const pendingValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('admin_pending_draft_id='))
    ?.split('=')[1];
  if (pendingValue === String(id)) {
    document.cookie = 'admin_pending_draft_id=; Path=/admin; Max-Age=0; SameSite=Lax';
  }
}

export function useFormPersistence({
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
}: FormPersistenceConfig) {
  const [databaseSaveState, setDatabaseSaveState] = useState<'draft' | 'local' | 'saving' | 'saved'>(
    isEdit ? 'saved' : 'draft',
  );
  const [databaseSavedAt, setDatabaseSavedAt] = useState<Date | null>(null);

  const lastPersistedSnapshotRef = useRef('');
  const latestFormRef = useRef(form);
  const autosaveInFlightRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveRetryTimerRef = useRef<number | null>(null);
  const localDraftTimerRef = useRef<number | null>(null);
  const lastLocalDraftSnapshotRef = useRef('');

  useEffect(() => {
    latestFormRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!isDraftLoaded) return;
    if (lastPersistedSnapshotRef.current) return;
    lastPersistedSnapshotRef.current = JSON.stringify(form);
  }, [form, isDraftLoaded]);

  useEffect(() => {
    latestFormRef.current = form;
    if (!isDraftLoaded) return;
    const snapshot = JSON.stringify(form);
    if (persistedSnapshotMatchesForm(lastPersistedSnapshotRef.current, form)) {
      if (isEdit) {
        clearLocal(form);
        setDatabaseSaveState('saved');
      }
      return;
    }
    scheduleLocalDraftWrite(form);
    setDatabaseSaveState('local');
    if (form.id) {
      document.cookie = `admin_pending_draft_id=${form.id}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
    }
  }, [form, isDraftLoaded, sessionDraftIdsRef]);

  function writeLocalDraftNow(source: Form) {
    const snapshot = JSON.stringify(source);
    if (snapshot === lastLocalDraftSnapshotRef.current) return;
    writeStoredDraft(source.id ?? null, source);
    lastLocalDraftSnapshotRef.current = snapshot;
    if (source.id) {
      sessionDraftIdsRef.current.add(source.id);
      document.cookie = `admin_pending_draft_id=${source.id}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
    }
  }

  function scheduleLocalDraftWrite(source: Form) {
    if (localDraftTimerRef.current != null) {
      window.clearTimeout(localDraftTimerRef.current);
    }
    localDraftTimerRef.current = window.setTimeout(() => {
      localDraftTimerRef.current = null;
      writeLocalDraftNow(source);
    }, 500);
  }

  function cancelPendingLocalDraftWrite() {
    if (localDraftTimerRef.current != null) {
      window.clearTimeout(localDraftTimerRef.current);
      localDraftTimerRef.current = null;
    }
  }

  function storeLocal(source: Form) {
    cancelPendingLocalDraftWrite();
    writeLocalDraftNow(source);
  }

  function clearLocal(source: Form) {
    cancelPendingLocalDraftWrite();
    localStorage.removeItem(getDraftKey(source.id));
    lastLocalDraftSnapshotRef.current = '';
    if (source.id) {
      clearPendingDraftCookie(source.id);
      sessionDraftIdsRef.current.delete(source.id);
    }
  }

  function markSaveSucceeded(source: Form, snapshot: string) {
    const latestForm = latestFormRef.current;
    const latestSnapshot = JSON.stringify(latestForm);
    const latestMatchesSaved =
      latestSnapshot === snapshot ||
      getFormContentSnapshot(latestForm) === getFormContentSnapshot(source);

    lastPersistedSnapshotRef.current = snapshot;
    setDatabaseSavedAt(new Date());
    if (!latestMatchesSaved) {
      storeLocal(latestForm);
      setDatabaseSaveState('local');
      return;
    }
    clearLocal(source);
    setDatabaseSaveState('saved');
  }

  function syncSavedVersion(source: Form) {
    setForm((current) => {
      if (current.id !== source.id) return current;
      if (getFormContentSnapshot(current) !== getFormContentSnapshot(source)) return current;
      if (current.updatedAt === source.updatedAt) return current;
      const nextForm = { ...current, updatedAt: source.updatedAt };
      latestFormRef.current = nextForm;
      return nextForm;
    });
  }

  function saveError(error: string | undefined, switchCancelled = false) {
    if (error === 'Unauthorized') {
      return 'Сессия истекла. Изменения сохранены локально. Войдите снова, чтобы записать их в базу.';
    }
    const prefix = switchCancelled ? 'Переход отменён. ' : '';
    return `${prefix}Изменения сохранены локально, но не записаны в базу: ${error || 'ошибка сохранения'}.`;
  }

  async function performSave(targetForm: Form, snapshot: string, id: number) {
    if (deletedExerciseIdsRef.current.has(id)) return false;
    if (autosaveInFlightRef.current) return false;
    autosaveInFlightRef.current = true;
    try {
      storeLocal(targetForm);
      setDatabaseSaveState('saving');
      const payload = buildPayloadFromForm(targetForm);
      const res = await updateExerciseAction({ ...payload, id });
      if (deletedExerciseIdsRef.current.has(id)) {
        setDatabaseSaveState('local');
        return false;
      }
      if (res.success) {
        const savedUpdatedAt = 'updatedAt' in res ? res.updatedAt ?? targetForm.updatedAt ?? null : targetForm.updatedAt ?? null;
        const savedForm = { ...targetForm, updatedAt: savedUpdatedAt };
        markSaveSucceeded(savedForm, JSON.stringify(savedForm));
        syncSavedVersion(savedForm);
        publishExerciseUpdated(id);
        return true;
      }
      setDatabaseSaveState('local');
      if ('code' in res && res.code === 'STALE_EXERCISE_VERSION') {
        return false;
      }
      setIsError(true);
      setMessage(saveError(res.error));
      return false;
    } finally {
      autosaveInFlightRef.current = false;
    }
  }

  function scheduleRetry(targetForm: Form, snapshot: string, id: number) {
    if (autosaveRetryTimerRef.current != null) return;
    autosaveRetryTimerRef.current = window.setTimeout(() => {
      autosaveRetryTimerRef.current = null;
      if (switchingExerciseRef.current) return;
      void performSave(targetForm, snapshot, id);
    }, 3000);
  }

  const cancelPendingAutosaves = useCallback(() => {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (autosaveRetryTimerRef.current != null) {
      window.clearTimeout(autosaveRetryTimerRef.current);
      autosaveRetryTimerRef.current = null;
    }
    if (localDraftTimerRef.current != null) {
      window.clearTimeout(localDraftTimerRef.current);
      localDraftTimerRef.current = null;
    }
  }, []);

  const autosaveCurrentToDbIfNeeded = useCallback(
    async (nextId: number) => {
      if (!isEdit || !form.id || form.id === nextId || saving || deleting) return true;
      if (deletedExerciseIdsRef.current.has(form.id)) return true;
      const snapshot = JSON.stringify(form);
      if (persistedSnapshotMatchesForm(lastPersistedSnapshotRef.current, form)) return true;
      const saved = await performSave(form, snapshot, form.id);
      if (!saved && form.id) scheduleRetry(form, snapshot, form.id);
      return saved;
    },
    // performSave and scheduleRetry intentionally close over this autosave cycle snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, isEdit, saving, deleting],
  );

  useEffect(() => {
    if (!isDraftLoaded || !isEdit || !form.id) return;
    if (saving || deleting || switchingExerciseRef.current) return;
    if (deletedExerciseIdsRef.current.has(form.id)) return;
    const snapshot = JSON.stringify(form);
    if (persistedSnapshotMatchesForm(lastPersistedSnapshotRef.current, form)) {
      clearLocal(form);
      setDatabaseSaveState('saved');
      return;
    }

    autosaveTimerRef.current = window.setTimeout(async () => {
      const saved = await performSave(form, snapshot, form.id!);
      if (!saved && form.id) scheduleRetry(form, snapshot, form.id);
    }, 2000);

    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    // performSave and scheduleRetry intentionally close over this autosave cycle snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isDraftLoaded, isEdit, saving, deleting]);

  return {
    databaseSaveState,
    databaseSavedAt,
    setDatabaseSaveState,
    setDatabaseSavedAt,
    lastPersistedSnapshotRef,
    cancelPendingAutosaves,
    autosaveCurrentToDbIfNeeded,
    storeLocal,
    markSaveSucceeded,
  };
}
