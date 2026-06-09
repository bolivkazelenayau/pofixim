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

export default function AdminExerciseEditor({
  status,
  formState,
  previewState,
  recovery,
  modals,
  actions,
}: AdminExerciseEditorProps) {
  const { form, formRef, mainSaveAnchorRef, setForm, typeOptions } = formState;

  return (
    <>
      <div className={`rounded-2xl border border-stroke bg-surface-strong p-5 shadow-sm ${recovery.initialSelectionPending && !recovery.initialSelectedExercise ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity`}>
        <AdminEditorHeader
          isEdit={status.isEdit}
          hasUnsavedChanges={status.hasUnsavedChanges}
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

            <AdminChoiceFields form={form} setForm={setForm} />
            <AdminFillBlankFields form={form} setForm={setForm} />
            <AdminWordBankClozeFields form={form} setForm={setForm} />
            <AdminWordSearchFields form={form} setForm={setForm} />
            <AdminDictationFields form={form} setForm={setForm} />
            <AdminOrthographyRepairFields form={form} setForm={setForm} />
            <AdminOrderFragmentsFields form={form} setForm={setForm} />
            <AdminPunctuationInsertFields form={form} setForm={setForm} />
            <AdminPunctuationConstructorFields form={form} setForm={setForm} />
            <AdminEge20Fields form={form} setForm={setForm} />
            <AdminEge21Fields form={form} setForm={setForm} />

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
        </div>
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
