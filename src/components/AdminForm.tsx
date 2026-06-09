'use client';

import { useState } from 'react';
import AdminEditorContainer from '@/components/admin-form/AdminEditorContainer';
import AdminSidebarContainer from '@/components/admin-form/AdminSidebarContainer';
import { EMPTY } from '@/components/admin-form/defaults';
import { loadFormState } from '@/components/admin-form/draftStorage';
import { formFromExerciseItem } from '@/components/admin-form/formMapping';
import type { AdminFormProps, Form } from '@/components/admin-form/types';
import { useAdminEditorController } from '@/hooks/useAdminEditorController';
import { useExerciseList } from '@/hooks/useExerciseList';
import { EXERCISE_TYPES } from '@/features/exercises/types';

export default function AdminForm({
  initialItems,
  initialTotalItems,
  initialSelectedId = null,
  initialSelectedExercise = null,
}: AdminFormProps) {
  const [form, setForm] = useState<Form>(() => {
    if (initialSelectedId && initialSelectedExercise) {
      return loadFormState(initialSelectedId, formFromExerciseItem(initialSelectedExercise));
    }
    return EMPTY;
  });
  const isDraftLoaded = true;
  const [typeOptions] = useState<Form['type'][]>(
    Array.from(EXERCISE_TYPES) as Form['type'][],
  );
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

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
    hasMore,
    loadingMore,
    refreshList,
    loadMore,
  } = useExerciseList({ initialItems, initialTotalItems, setIsError, setMessage });

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

  return (
    <div className="mx-auto grid w-full max-w-[1400px] items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
      <AdminSidebarContainer
        sidebarRef={editor.sidebarRef}
        databaseIndicator={editor.databaseIndicator}
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
        onOpenExercise={editor.openExerciseWithAutosave}
        setIsError={setIsError}
        setMessage={setMessage}
      />

      <AdminEditorContainer
        status={editor.status}
        formState={{
          formRef: editor.formRef,
          form,
          isDraftLoaded,
          typeOptions,
          setForm,
          mainSaveAnchorRef: editor.mainSaveAnchorRef,
        }}
        recovery={editor.recovery}
        modals={editor.modals}
        actions={editor.actions}
      />
    </div>
  );
}
