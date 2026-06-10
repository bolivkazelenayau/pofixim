'use client';

import type { FormEvent } from 'react';
import AdminChoiceFields from '@/components/admin-form/AdminChoiceFields';
import AdminCoreFields from '@/components/admin-form/AdminCoreFields';
import AdminDictationFields from '@/components/admin-form/AdminDictationFields';
import AdminEge20Fields from '@/components/admin-form/AdminEge20Fields';
import AdminEge21Fields from '@/components/admin-form/AdminEge21Fields';
import AdminFillBlankFields from '@/components/admin-form/AdminFillBlankFields';
import AdminMetaFields from '@/components/admin-form/AdminMetaFields';
import AdminOrderFragmentsFields from '@/components/admin-form/AdminOrderFragmentsFields';
import AdminOrthographyRepairFields from '@/components/admin-form/AdminOrthographyRepairFields';
import AdminPreviewPanel from '@/components/admin-form/AdminPreviewPanel';
import AdminPunctuationConstructorFields from '@/components/admin-form/AdminPunctuationConstructorFields';
import AdminPunctuationInsertFields from '@/components/admin-form/AdminPunctuationInsertFields';
import AdminQualityInspector from '@/components/admin-form/AdminQualityInspector';
import AdminWordBankClozeFields from '@/components/admin-form/AdminWordBankClozeFields';
import AdminWordSearchFields from '@/components/admin-form/AdminWordSearchFields';
import AdminDraftRecoveryModal from '@/components/admin-form/AdminDraftRecoveryModal';
import AdminEditorHeader from '@/components/admin-form/AdminEditorHeader';
import AdminMessageToast from '@/components/admin-form/AdminMessageToast';
import DeleteExerciseConfirmModal from '@/components/admin-form/DeleteExerciseConfirmModal';
import FloatingSaveButton from '@/components/admin-form/FloatingSaveButton';
import SeedRegenerateConfirmModal from '@/components/admin-form/SeedRegenerateConfirmModal';
import type { DraftRecoveryState, FeedbackSections, Form, PreviewCheckResult } from '@/components/admin-form/types';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';

type AdminExerciseEditorProps = {
  status: {
    isEdit: boolean;
    hasUnsavedChanges: boolean;
    message: string;
    isError: boolean;
    saving: boolean;
    deleting: boolean;
    showFloatingSave: boolean;
  };
  formState: {
    formRef: React.RefObject<HTMLFormElement | null>;
    form: Form;
    typeOptions: Form['type'][];
    setForm: React.Dispatch<React.SetStateAction<Form>>;
    mainSaveAnchorRef: React.RefObject<HTMLDivElement | null>;
  };
  previewState: {
    preview: { exercise: Exercise | null; error: string };
    mode: 'desktop' | 'mobile';
    checkResult: PreviewCheckResult | null;
    feedbackSections: FeedbackSections | null;
    dictationText: string;
  };
  recovery: {
    draft: DraftRecoveryState;
    initialSelectionPending: boolean;
    initialSelectedExercise: Record<string, unknown> | null;
    onUseDatabaseVersion: () => void;
    onUseRecoveredDraft: () => void;
  };
  modals: {
    showSeedRegenerate: boolean;
    showDeleteConfirm: boolean;
    onSeedRegenerateCancel: () => void;
    onSeedRegenerateConfirm: () => void;
    onDeleteCancel: () => void;
    onDeleteConfirm: () => void;
  };
  actions: {
    onUndo: () => void;
    onRedo: () => void;
    onNewDraft: () => void;
    onSubmit: (event: React.FormEvent) => Promise<void>;
    onTypeChange: (nextType: Form['type']) => void;
    onGenerateSeedClick: () => void;
    onSeedManualChange: () => void;
    onDeleteClick: () => void;
    onPreviewModeChange: (mode: 'desktop' | 'mobile') => void;
    onPreviewSubmit: (answer: SubmittedAnswer) => void;
    onPreviewDictationSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onPreviewDictationTextChange: (text: string) => void;
    onFloatingSaveClick: () => void;
    onSaveIntent: () => void;
  };
};

type TypeSpecificFieldsProps = {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
};

function EditorSkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-foreground/10 ${className}`} />;
}

function AdminExerciseEditorSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <EditorSkeletonBlock className="h-7 w-56" />
          <EditorSkeletonBlock className="mt-3 h-4 w-36" />
        </div>
        <div className="flex gap-3">
          <EditorSkeletonBlock className="h-5 w-10" />
          <EditorSkeletonBlock className="h-5 w-10" />
          <EditorSkeletonBlock className="h-5 w-24" />
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <EditorSkeletonBlock className="h-12 rounded-lg" />
            <EditorSkeletonBlock className="h-12 rounded-lg" />
            <EditorSkeletonBlock className="h-12 rounded-lg" />
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]">
            <EditorSkeletonBlock className="h-12 rounded-lg" />
            <EditorSkeletonBlock className="h-12 rounded-lg" />
            <EditorSkeletonBlock className="h-12 rounded-lg" />
          </div>

          <EditorSkeletonBlock className="mb-2 h-4 w-28" />
          <EditorSkeletonBlock className="mb-4 h-48 rounded-lg" />
          <EditorSkeletonBlock className="mb-2 h-4 w-24" />
          <EditorSkeletonBlock className="mb-4 h-44 rounded-lg" />

          <EditorSkeletonBlock className="mb-3 h-4 w-36" />
          <div className="space-y-2">
            <EditorSkeletonBlock className="h-10 rounded-lg" />
            <EditorSkeletonBlock className="h-10 rounded-lg" />
            <EditorSkeletonBlock className="h-10 rounded-lg" />
          </div>
        </div>

        <aside className="rounded-2xl border border-stroke bg-surface p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <EditorSkeletonBlock className="h-5 w-28" />
            <EditorSkeletonBlock className="h-8 w-28 rounded-lg" />
          </div>
          <EditorSkeletonBlock className="mb-4 h-20 rounded-xl" />
          <div className="space-y-3">
            <EditorSkeletonBlock className="h-16 rounded-xl" />
            <EditorSkeletonBlock className="h-16 rounded-xl" />
            <EditorSkeletonBlock className="h-16 rounded-xl" />
            <EditorSkeletonBlock className="h-16 rounded-xl" />
          </div>
          <EditorSkeletonBlock className="mt-4 h-12 rounded-xl" />
        </aside>
      </div>
    </div>
  );
}

function TypeSpecificFields({ form, setForm }: TypeSpecificFieldsProps) {
  switch (form.type) {
    case 'multiple_choice':
    case 'ege_multi_select':
      return <AdminChoiceFields form={form} setForm={setForm} />;
    case 'fill_blank':
      return <AdminFillBlankFields form={form} setForm={setForm} />;
    case 'word_bank_cloze':
      return <AdminWordBankClozeFields form={form} setForm={setForm} />;
    case 'word_search':
      return <AdminWordSearchFields form={form} setForm={setForm} />;
    case 'dictation':
      return <AdminDictationFields form={form} setForm={setForm} />;
    case 'orthography_repair':
      return <AdminOrthographyRepairFields form={form} setForm={setForm} />;
    case 'order_fragments':
      return <AdminOrderFragmentsFields form={form} setForm={setForm} />;
    case 'punctuation_insert':
      return <AdminPunctuationInsertFields form={form} setForm={setForm} />;
    case 'punctuation_constructor':
      return <AdminPunctuationConstructorFields form={form} setForm={setForm} />;
    case 'ege20_complex_sentence_punctuation':
      return <AdminEge20Fields form={form} setForm={setForm} />;
    case 'ege21_punctuation_analysis':
      return <AdminEge21Fields form={form} setForm={setForm} />;
    default:
      return null;
  }
}

export default function AdminExerciseEditor({
  status,
  formState,
  previewState,
  recovery,
  modals,
  actions,
}: AdminExerciseEditorProps) {
  const { form, formRef, mainSaveAnchorRef, setForm, typeOptions } = formState;
  const isInitialSelectionLoading =
    recovery.initialSelectionPending && !recovery.initialSelectedExercise;

  return (
    <>
      <div
        className="relative rounded-2xl border border-stroke bg-surface-strong p-5 shadow-sm"
        aria-busy={isInitialSelectionLoading}
      >
        {isInitialSelectionLoading ? (
          <AdminExerciseEditorSkeleton />
        ) : (
          <>
        <AdminEditorHeader
          isEdit={status.isEdit}
          hasUnsavedChanges={status.hasUnsavedChanges}
          formMeta={{
            id: form.id,
            type: form.type,
            qualityStatus: form.qualityStatus,
            isActive: form.isActive,
            seedKey: form.seedKey,
          }}
          onUndo={actions.onUndo}
          onRedo={actions.onRedo}
          onNewDraft={actions.onNewDraft}
        />

        <AdminMessageToast message={status.message} isError={status.isError} />

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <form ref={formRef} onSubmit={actions.onSubmit}>
            <AdminCoreFields
              form={form}
              typeOptions={typeOptions}
              setForm={setForm}
              onTypeChange={actions.onTypeChange}
              onGenerateSeedClick={actions.onGenerateSeedClick}
              onSeedManualChange={actions.onSeedManualChange}
            />

            <TypeSpecificFields form={form} setForm={setForm} />

            <AdminMetaFields
              form={form}
              setForm={setForm}
              mainSaveAnchorRef={mainSaveAnchorRef}
              saving={status.saving}
              deleting={status.deleting}
              isEdit={status.isEdit}
              onSaveIntent={actions.onSaveIntent}
              onDeleteClick={actions.onDeleteClick}
            />
          </form>

          <aside className="space-y-3 2xl:sticky 2xl:top-4">
            <AdminPreviewPanel
              preview={previewState.preview}
              previewMode={previewState.mode}
              previewCheckResult={previewState.checkResult}
              previewFeedbackSections={previewState.feedbackSections}
              previewDictationText={previewState.dictationText}
              onPreviewModeChange={actions.onPreviewModeChange}
              onPreviewSubmit={actions.onPreviewSubmit}
              onPreviewDictationSubmit={actions.onPreviewDictationSubmit}
              onPreviewDictationTextChange={actions.onPreviewDictationTextChange}
            />
            <AdminQualityInspector
              form={form}
              setForm={setForm}
              preview={previewState.preview}
            />
          </aside>
        </div>
          </>
        )}
      </div>

      <FloatingSaveButton
        visible={status.showFloatingSave}
        saving={status.saving}
        deleting={status.deleting}
        isEdit={status.isEdit}
        onClick={actions.onFloatingSaveClick}
        onSaveIntent={actions.onSaveIntent}
      />

      {recovery.draft ? (
        <AdminDraftRecoveryModal
          exerciseId={recovery.draft.id}
          onUseDatabaseVersion={recovery.onUseDatabaseVersion}
          onUseRecoveredDraft={recovery.onUseRecoveredDraft}
        />
      ) : null}

      {modals.showSeedRegenerate ? (
        <SeedRegenerateConfirmModal
          onCancel={modals.onSeedRegenerateCancel}
          onConfirm={modals.onSeedRegenerateConfirm}
        />
      ) : null}

      {modals.showDeleteConfirm ? (
        <DeleteExerciseConfirmModal
          exerciseLabel={form.seedKey.trim() || `#${form.id}`}
          deleting={status.deleting}
          onCancel={modals.onDeleteCancel}
          onConfirm={modals.onDeleteConfirm}
        />
      ) : null}
    </>
  );
}
