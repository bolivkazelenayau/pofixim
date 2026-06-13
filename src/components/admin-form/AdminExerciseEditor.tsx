'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, type FormEvent } from 'react';
import AdminCoreFields from '@/components/admin-form/AdminCoreFields';
import AdminMetaFields from '@/components/admin-form/AdminMetaFields';
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
    fillBlankText: string;
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
    onPreviewFillBlankSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onPreviewFillBlankTextChange: (text: string) => void;
    onFloatingSaveClick: () => void;
    onSaveIntent: () => void;
  };
};

type TypeSpecificFieldsProps = {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
};

const typeFieldLoading = () => <EditorSkeletonBlock className="mt-3 h-32 rounded-lg" />;

const AdminChoiceFields = dynamic(() => import('@/components/admin-form/AdminChoiceFields'), {
  loading: typeFieldLoading,
});
const AdminDictationFields = dynamic(() => import('@/components/admin-form/AdminDictationFields'), {
  loading: typeFieldLoading,
});
const AdminEge20Fields = dynamic(() => import('@/components/admin-form/AdminEge20Fields'), {
  loading: typeFieldLoading,
});
const AdminEge21Fields = dynamic(() => import('@/components/admin-form/AdminEge21Fields'), {
  loading: typeFieldLoading,
});
const AdminFillBlankFields = dynamic(() => import('@/components/admin-form/AdminFillBlankFields'), {
  loading: typeFieldLoading,
});
const AdminOrderFragmentsFields = dynamic(() => import('@/components/admin-form/AdminOrderFragmentsFields'), {
  loading: typeFieldLoading,
});
const AdminOrthographyRepairFields = dynamic(() => import('@/components/admin-form/AdminOrthographyRepairFields'), {
  loading: typeFieldLoading,
});
const AdminPunctuationConstructorFields = dynamic(() => import('@/components/admin-form/AdminPunctuationConstructorFields'), {
  loading: typeFieldLoading,
});
const AdminPunctuationInsertFields = dynamic(() => import('@/components/admin-form/AdminPunctuationInsertFields'), {
  loading: typeFieldLoading,
});
const AdminWordBankClozeFields = dynamic(() => import('@/components/admin-form/AdminWordBankClozeFields'), {
  loading: typeFieldLoading,
});
const AdminWordSearchFields = dynamic(() => import('@/components/admin-form/AdminWordSearchFields'), {
  loading: typeFieldLoading,
});
const AdminPreviewPanel = dynamic(() => import('@/components/admin-form/AdminPreviewPanel'), {
  loading: () => <PreviewPanelShell />,
});
const AdminQualityInspector = dynamic(() => import('@/components/admin-form/AdminQualityInspector'), {
  loading: () => <QualityInspectorShell />,
});

function EditorSkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-foreground/10 motion-safe:animate-pulse ${className}`} />;
}

function useIdleReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(() => setReady(true), 1800);
    return () => globalThis.clearTimeout(id);
  }, [ready]);

  return ready;
}

function useAfterFirstPaint() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [ready]);

  return ready;
}

function PreviewPanelShell() {
  return (
    <section className="h-fit rounded-3xl border border-stroke bg-surface-strong p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Превью в чате</h3>
          <p className="mt-0.5 text-xs leading-5 text-foreground/70">
            Проверка того, как задание увидит ученик.
          </p>
        </div>
        <EditorSkeletonBlock className="h-8 w-28 rounded-lg" />
      </div>
      <div className="rounded-[20px] border border-dashed border-stroke bg-surface px-3 py-4">
        <div className="text-sm font-semibold text-foreground">Превью появится здесь</div>
        <p className="mt-1 text-pretty text-xs leading-5 text-foreground/70">
          Заполните формулировку, ответ и объяснение, чтобы проверить карточку перед сохранением.
        </p>
      </div>
    </section>
  );
}

function QualityInspectorShell() {
  return (
    <section className="rounded-3xl border border-stroke bg-surface-strong p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quality inspector</h3>
          <p className="mt-0.5 text-pretty text-xs leading-5 text-foreground/70">
            Блокеры, предупреждения и разбор quick-слоя.
          </p>
        </div>
        <EditorSkeletonBlock className="h-7 w-16 rounded-md" />
      </div>
      <div className="space-y-1.5" aria-hidden="true">
        <EditorSkeletonBlock className="h-7 rounded-lg" />
        <EditorSkeletonBlock className="h-7 rounded-lg" />
        <EditorSkeletonBlock className="h-7 rounded-lg" />
      </div>
    </section>
  );
}

function AdminExerciseEditorSkeleton() {
  return (
    <div>
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

        <aside className="rounded-3xl border border-stroke bg-surface p-4">
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
  const afterFirstPaint = useAfterFirstPaint();
  const idleReady = useIdleReady();
  const previewHasContent = Boolean(
    previewState.preview.error || previewState.checkResult || previewState.dictationText.trim(),
  );
  const isInitialSelectionLoading =
    recovery.initialSelectionPending && !recovery.initialSelectedExercise;

  return (
    <>
      <div
        className="relative rounded-3xl border border-stroke bg-surface-strong p-4 shadow-sm sm:rounded-[28px] sm:p-5"
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
          <form
            ref={formRef}
            onSubmit={actions.onSubmit}
            aria-describedby={status.isError && status.message ? 'admin-form-error' : undefined}
          >
            {status.isError && status.message ? (
              <div
                id="admin-form-error"
                role="alert"
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
              >
                {status.message}
              </div>
            ) : null}
            <AdminCoreFields
              form={form}
              typeOptions={typeOptions}
              setForm={setForm}
              onTypeChange={actions.onTypeChange}
              onGenerateSeedClick={actions.onGenerateSeedClick}
              onSeedManualChange={actions.onSeedManualChange}
            />

            {afterFirstPaint ? (
              <TypeSpecificFields form={form} setForm={setForm} />
            ) : (
              typeFieldLoading()
            )}

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
            {idleReady || previewHasContent ? (
              <AdminPreviewPanel
                preview={previewState.preview}
                previewMode={previewState.mode}
                previewCheckResult={previewState.checkResult}
                previewFeedbackSections={previewState.feedbackSections}
                previewDictationText={previewState.dictationText}
                previewFillBlankText={previewState.fillBlankText}
                onPreviewModeChange={actions.onPreviewModeChange}
                onPreviewSubmit={actions.onPreviewSubmit}
                onPreviewDictationSubmit={actions.onPreviewDictationSubmit}
                onPreviewDictationTextChange={actions.onPreviewDictationTextChange}
                onPreviewFillBlankSubmit={actions.onPreviewFillBlankSubmit}
                onPreviewFillBlankTextChange={actions.onPreviewFillBlankTextChange}
              />
            ) : (
              <PreviewPanelShell />
            )}
            {idleReady ? (
              <AdminQualityInspector
                form={form}
                setForm={setForm}
                preview={previewState.preview}
              />
            ) : (
              <QualityInspectorShell />
            )}
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
