'use client';

import { useEffect } from 'react';
import { getExerciseIdFromHash, getExerciseIdFromSearch } from '@/components/admin-form/api';
import { loadFormState } from '@/components/admin-form/draftStorage';
import { formFromExerciseItem } from '@/components/admin-form/formMapping';
import { EMPTY } from '@/components/admin-form/defaults';
import { slugFromPrompt } from '@/components/admin-form/utils';
import { logAdminDebug } from '@/components/admin-form/debug';
import type { Form } from '@/components/admin-form/types';

interface UseFormEffectsOptions {
  form: Form;
  isDraftLoaded: boolean;
  selectedId: number | null;
  initialSelectedId: number | null | undefined;
  initialSelectedExercise: Record<string, unknown> | null | undefined;
  initialSelectionPending: boolean;
  initialSelectionResolvedRef: React.MutableRefObject<boolean>;
  initialTargetIdRef: React.MutableRefObject<number | null>;
  initializedFromUrlRef: React.MutableRefObject<boolean>;
  lastPersistedSnapshotRef: React.MutableRefObject<string>;
  sidebarRef: React.MutableRefObject<HTMLElement | null>;
  mainSaveAnchorRef: React.MutableRefObject<HTMLDivElement | null>;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  setInitialSelectionPending: React.Dispatch<React.SetStateAction<boolean>>;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFloatingSave: React.Dispatch<React.SetStateAction<boolean>>;
  offerExistingDraftRecovery: (id: number, form: Form) => void;
  loadExercise: (id: number) => Promise<void>;
}

export function useFormEffects({
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
}: UseFormEffectsOptions) {
  useEffect(() => {
    if (initialSelectionResolvedRef.current) return;
    const searchId = getExerciseIdFromSearch(window.location.search);
    const hashId = getExerciseIdFromHash(window.location.hash);

    if (initialSelectedId && initialSelectedExercise) {
      initialSelectionResolvedRef.current = true;
      window.setTimeout(() => {
        offerExistingDraftRecovery(
          initialSelectedId,
          loadFormState(initialSelectedId, formFromExerciseItem(initialSelectedExercise)),
        );
      }, 0);
      return;
    }

    if (!initialSelectedId) {
      const id = searchId ?? hashId;
      const hasTargetId = id !== null;
      initialTargetIdRef.current = hasTargetId ? id : null;
      initializedFromUrlRef.current = hasTargetId;
      if (hasTargetId) {
        initialSelectionResolvedRef.current = true;
        window.setTimeout(() => setInitialSelectionPending(true), 0);
      }
    }

    if (!initializedFromUrlRef.current && !initialSelectedExercise) {
      initialSelectionResolvedRef.current = true;
      setForm(loadFormState(null, EMPTY));
      setInitialSelectionPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId, initialSelectedExercise]);

  useEffect(() => {
    if (!selectedId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('exercise', String(selectedId));
    url.searchParams.delete('id');
    url.searchParams.delete('exerciseId');
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    hashParams.delete('exercise');
    url.hash = hashParams.toString();
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      logAdminDebug('url-sync:replaceState', {
        source: 'selectedId',
        selectedId,
        from: currentUrl,
        to: nextUrl,
      });
      window.history.replaceState(null, '', nextUrl);
    }
  }, [selectedId]);

  useEffect(() => {
    const baseTitle = 'Админка ЕГЭ';
    if (!form.id) {
      document.title = baseTitle;
      return;
    }
    const slug = slugFromPrompt(form.prompt);
    document.title = `${baseTitle} · #${form.id} · ${slug}`;
  }, [form.id, form.prompt]);

  useEffect(() => {
    const anchor = mainSaveAnchorRef.current;
    if (!anchor || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingSave(!entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.05,
      },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedId) {
      logAdminDebug('selection:persist', {
        selectedId,
        currentUrl: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      });
      localStorage.setItem('admin_last_selected_id', String(selectedId));
      document.cookie = `admin_selected_exercise_id=${selectedId}; Path=/admin; Max-Age=31536000; SameSite=Lax`;
      return;
    }
    logAdminDebug('selection:clear', {
      currentUrl: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    });
    localStorage.removeItem('admin_last_selected_id');
    document.cookie = 'admin_selected_exercise_id=; Path=/admin; Max-Age=0; SameSite=Lax';
  }, [selectedId]);

  useEffect(() => {
    if (!isDraftLoaded) return;
    setHasUnsavedChanges(JSON.stringify(form) !== lastPersistedSnapshotRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isDraftLoaded]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLButtonElement)) return;
      if (!sidebarRef.current?.contains(active)) return;
      const target = e.target as Node | null;
      if (target && sidebarRef.current.contains(target)) return;
      active.blur();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!isDraftLoaded || !initialSelectionPending) return;
    const id = initialTargetIdRef.current;
    if (id == null) {
      setInitialSelectionPending(false);
      return;
    }
    void (async () => {
      try {
        await loadExercise(id);
      } finally {
        setInitialSelectionPending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraftLoaded, initialSelectionPending]);
}
