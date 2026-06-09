'use client';

import { useEffect, useState } from 'react';
import type { Form, ListItem } from '@/components/admin-form/types';
import { EMPTY } from '@/components/admin-form/defaults';
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

interface UseExerciseSubmitOptions {
  form: Form;
  isEdit: boolean;
  deleting: boolean;
  router: ReturnType<typeof import('next/navigation').useRouter>;
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
  // from useFormPersistence
  setDatabaseSaveState: (state: 'draft' | 'local' | 'saving' | 'saved') => void;
  setDatabaseSavedAt: React.Dispatch<React.SetStateAction<Date | null>>;
  lastPersistedSnapshotRef: React.MutableRefObject<string>;
  cancelPendingAutosaves: () => void;
  storeLocalDraft: (f: Form) => void;
  markDatabaseSaveSucceeded: (f: Form, snapshot: string) => void;
}

export function useExerciseSubmit({
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
}: UseExerciseSubmitOptions) {
  const [isSeedRegenerateArmed, setIsSeedRegenerateArmed] = useState(false);
  const [showSeedRegenerateModal, setShowSeedRegenerateModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  function clearExerciseUrlSelection() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    hashParams.delete('exercise');
    url.searchParams.delete('exercise');
    url.searchParams.delete('id');
    url.searchParams.delete('exerciseId');
    url.hash = hashParams.toString();
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setDatabaseSaveState('saving');
    setMessage('');
    setIsError(false);
    const payload = buildPayloadFromForm(form);

    const wasEdit = isEdit;
    const res = wasEdit
      ? await updateExerciseAction({ ...payload, id: form.id! })
      : await createExerciseAction(payload);

    if (res.success) {
      setMessage(wasEdit ? 'Изменения сохранены.' : 'Задание создано.');
      localStorage.removeItem(getDraftKey(form.id));
      if (form.id) clearPendingDraftMarker(form.id);
      const nextForm = wasEdit ? form : loadFormState(null, EMPTY);
      setForm(nextForm);
      if (wasEdit) {
        markDatabaseSaveSucceeded(form, JSON.stringify(form));
      } else {
        lastPersistedSnapshotRef.current = JSON.stringify(nextForm);
        setDatabaseSaveState('draft');
        setDatabaseSavedAt(null);
      }
      if (!wasEdit) {
        setTotalItems((current) => (current === null ? current : current + 1));
      }
      await refreshList({ force: true });
    } else {
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
    const res = await deleteExerciseAction(deletedId);
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
      await refreshList({ force: true });
    } else {
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
  };
}
