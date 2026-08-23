'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminEditorContainer from '@/components/admin-form/AdminEditorContainer';
import AdminSidebarContainer from '@/components/admin-form/AdminSidebarContainer';
import { EMPTY } from '@/components/admin-form/defaults';
import { loadFormState } from '@/components/admin-form/draftStorage';
import { formFromExerciseItem } from '@/components/admin-form/formMapping';
import type { AdminFormProps, Form } from '@/components/admin-form/types';
import { useAdminEditorController } from '@/hooks/useAdminEditorController';
import { useAdminTanStackForm } from '@/hooks/useAdminTanStackForm';
import { useAppShortcut } from '@/hooks/useAppShortcut';
import { useExerciseList } from '@/hooks/useExerciseList';
import { EXERCISE_TYPES } from '@/features/exercises/types';

const AdminCommandPalette = dynamic(
  () => import('@/components/admin-form/AdminCommandPalette'),
  { loading: () => null },
);

export default function AdminForm({
  initialItems = [],
  initialTotalItems,
  initialSelectedId = null,
  initialSelectedExercise = null,
  initialTypeFilter = 'all',
  initialStatusFilter = 'all',
  initialExamTypeFilter = 'all',
  initialSortBy = 'id',
  initialSortDir = 'desc',
}: AdminFormProps) {
  const initialForm = useMemo<Form>(() => {
    if (initialSelectedId && initialSelectedExercise) {
      return loadFormState(initialSelectedId, formFromExerciseItem(initialSelectedExercise));
    }
    return EMPTY;
  }, [initialSelectedExercise, initialSelectedId]);
  const {
    adminFormApi,
    form,
    setForm,
    validation: formValidation,
  } = useAdminTanStackForm(initialForm);
  const isDraftLoaded = true;
  const [typeOptions] = useState<Form['type'][]>(
    Array.from(EXERCISE_TYPES) as Form['type'][],
  );
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  const {
    setItems,
    totalItems,
    setTotalItems,
    matchingItems,
    setMatchingItems,
    initialListPending,
    hasActiveListFilter,
    groupedItems,
    flatFilteredItems,
    listQuery,
    setListQuery,
    listTypeFilter,
    setListTypeFilter,
    listStatusFilter,
    setListStatusFilter,
    listExamTypeFilter,
    setListExamTypeFilter,
    listSortBy,
    setListSortBy,
    listSortDir,
    setListSortDir,
    sortPrefsReady,
    isRefreshing,
    hasMore,
    loadingMore,
    refreshList,
    loadMore,
  } = useExerciseList({
    initialItems,
    initialTotalItems,
    initialTypeFilter,
    initialStatusFilter,
    initialExamTypeFilter,
    initialSortBy,
    initialSortDir,
    setIsError,
    setMessage,
  });

  const editor = useAdminEditorController({
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
  });

  const openExerciseFromList = useCallback(
    async (id: number) => {
      setMobileSidebarOpen(false);
      await editor.openExerciseWithAutosave(id);
    },
    [editor],
  );

  const clearListFilters = useCallback(() => {
    setListQuery('');
    setListTypeFilter('all');
    setListExamTypeFilter('all');
    setListStatusFilter('all');
  }, [setListExamTypeFilter, setListQuery, setListStatusFilter, setListTypeFilter]);

  const openAdjacentExercise = useCallback((direction: 1 | -1) => {
    if (flatFilteredItems.length === 0) return;
    const currentIndex = flatFilteredItems.findIndex((item) => item.id === editor.selectedId);
    const fallbackIndex = direction > 0 ? -1 : flatFilteredItems.length;
    const nextIndex = currentIndex >= 0 ? currentIndex + direction : fallbackIndex + direction;
    const nextItem = flatFilteredItems[nextIndex];
    if (nextItem) {
      void editor.openExerciseWithAutosave(nextItem.id);
    }
  }, [editor, flatFilteredItems]);

  function focusListSearch() {
    document.getElementById('admin-list-search')?.focus();
  }

  function setStatusView(status: 'all' | 'draft' | 'review' | 'approved') {
    setListStatusFilter(status);
    setListExamTypeFilter('all');
  }

  useAppShortcut('admin.commandPalette', () => {
    setCommandOpen((value) => !value);
  });
  useAppShortcut('admin.save', () => {
    editor.formRef.current?.requestSubmit();
  });
  useAppShortcut('admin.nextExercise', () => {
    openAdjacentExercise(1);
  });
  useAppShortcut('admin.previousExercise', () => {
    openAdjacentExercise(-1);
  });

  return (
    <>
      {commandOpen ? (
        <AdminCommandPalette
          open={commandOpen}
          selectedId={editor.selectedId}
          items={flatFilteredItems}
          onOpenChange={setCommandOpen}
          onOpenExercise={(id) => void openExerciseFromList(id)}
          onSave={() => editor.formRef.current?.requestSubmit()}
          onNewDraft={editor.actions.onNewDraft}
          onNext={() => openAdjacentExercise(1)}
          onPrevious={() => openAdjacentExercise(-1)}
          onFocusSearch={focusListSearch}
          onSetStatusView={setStatusView}
        />
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          className="min-h-10 rounded-xl border border-stroke bg-surface-strong px-3 text-sm font-semibold text-foreground shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={() => setMobileSidebarOpen(true)}
          aria-expanded={mobileSidebarOpen}
          aria-controls="admin-exercise-sidebar"
        >
          Список заданий
        </button>
        <span className="min-w-0 truncate text-xs text-foreground/60">
          {totalItems === null ? 'Загрузка списка…' : `${totalItems} заданий`}
        </span>
      </div>
      {mobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Закрыть список заданий"
          className="fixed inset-0 z-[59] bg-black/35 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}
      <div className="mx-auto grid min-w-0 w-full max-w-[1400px] items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <AdminSidebarContainer
          sidebarRef={editor.sidebarRef}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          selectedId={editor.selectedId}
          list={{
            totalItems,
            matchingItems,
            initialListPending,
            hasActiveListFilter,
            groupedItems,
            flatFilteredItems,
            query: listQuery,
            typeFilter: listTypeFilter,
            statusFilter: listStatusFilter,
            examTypeFilter: listExamTypeFilter,
            sortBy: listSortBy,
            sortDir: listSortDir,
            sortPrefsReady,
            isRefreshing,
            hasMore,
            loadingMore,
            setQuery: setListQuery,
            setTypeFilter: setListTypeFilter,
            setStatusFilter: setListStatusFilter,
            setExamTypeFilter: setListExamTypeFilter,
            setSortBy: setListSortBy,
            setSortDir: setListSortDir,
            refresh: refreshList,
            loadMore,
          }}
          onOpenExercise={openExerciseFromList}
          onClearFilters={clearListFilters}
          setIsError={setIsError}
          setMessage={setMessage}
        />

        <AdminEditorContainer
          status={editor.status}
          formState={{
            adminFormApi,
            formRef: editor.formRef,
            form,
            isDraftLoaded,
            typeOptions,
            setForm,
            validation: formValidation,
            mainSaveAnchorRef: editor.mainSaveAnchorRef,
          }}
          recovery={editor.recovery}
          modals={editor.modals}
          actions={editor.actions}
        />
      </div>
    </>
  );
}
