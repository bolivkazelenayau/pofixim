'use client';

import AdminExerciseEditor from '@/components/admin-form/AdminExerciseEditor';
import { useExercisePreview } from '@/hooks/useExercisePreview';
import { useFormHistory } from '@/hooks/useFormHistory';
import type { DraftRecoveryState, Form } from './types';
import type { AnyFormApi } from '@tanstack/react-form';
import type { AdminFormValidation } from './validation';

type AdminEditorContainerProps = {
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
    adminFormApi: AnyFormApi;
    formRef: React.RefObject<HTMLFormElement | null>;
    form: Form;
    isDraftLoaded: boolean;
    typeOptions: Form['type'][];
    setForm: React.Dispatch<React.SetStateAction<Form>>;
    validation: AdminFormValidation;
    mainSaveAnchorRef: React.RefObject<HTMLDivElement | null>;
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
    onNewDraft: () => void;
    onRevisionRestored: (id: number) => Promise<void>;
    onSubmit: (event: React.FormEvent) => Promise<void>;
    onTypeChange: (nextType: Form['type']) => void;
    onGenerateSeedClick: () => void;
    onSeedManualChange: () => void;
    onDeleteClick: () => void;
    onFloatingSaveClick: () => void;
    onSaveIntent: () => void;
  };
};

export default function AdminEditorContainer({
  status,
  formState,
  recovery,
  modals,
  actions,
}: AdminEditorContainerProps) {
  const { undoForm, redoForm } = useFormHistory({
    form: formState.form,
    isDraftLoaded: formState.isDraftLoaded,
    setForm: formState.setForm,
  });
  const {
    previewMode,
    setPreviewMode,
    previewCheckResult,
    previewDictationText,
    previewFillBlankText,
    preview,
    previewFeedbackSections,
    handlePreviewSubmit,
    handlePreviewDictationSubmit,
    handlePreviewDictationTextChange,
    handlePreviewFillBlankSubmit,
    handlePreviewFillBlankTextChange,
  } = useExercisePreview(formState.form);

  return (
    <AdminExerciseEditor
      status={status}
      formState={formState}
      previewState={{
        preview,
        mode: previewMode,
        checkResult: previewCheckResult,
        feedbackSections: previewFeedbackSections,
        dictationText: previewDictationText,
        fillBlankText: previewFillBlankText,
      }}
      recovery={recovery}
      modals={modals}
      actions={{
        ...actions,
        onUndo: undoForm,
        onRedo: redoForm,
        onPreviewModeChange: setPreviewMode,
        onPreviewSubmit: handlePreviewSubmit,
        onPreviewDictationSubmit: handlePreviewDictationSubmit,
        onPreviewDictationTextChange: handlePreviewDictationTextChange,
        onPreviewFillBlankSubmit: handlePreviewFillBlankSubmit,
        onPreviewFillBlankTextChange: handlePreviewFillBlankTextChange,
      }}
    />
  );
}
