import type { FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import FormattedFeedbackExplanation from '@/components/FormattedFeedbackExplanation';
import { renderEditorMarkdown } from '@/components/admin-form/markdown/formatting';
import ExerciseRenderer from '@/features/exercises/renderers/ExerciseRenderer';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import type { FeedbackSections, PreviewCheckResult } from './types';

type AdminPreviewPanelProps = {
 preview: { exercise: Exercise | null; error: string };
 previewMode: 'desktop' | 'mobile';
 previewCheckResult: PreviewCheckResult | null;
 previewFeedbackSections: FeedbackSections | null;
 previewDictationText: string;
 onPreviewModeChange: (mode: 'desktop' | 'mobile') => void;
 onPreviewSubmit: (answer: SubmittedAnswer) => void;
 onPreviewDictationSubmit: (event: FormEvent<HTMLFormElement>) => void;
 onPreviewDictationTextChange: (text: string) => void;
};

export default function AdminPreviewPanel({
 preview,
 previewMode,
 previewCheckResult,
 previewFeedbackSections,
 previewDictationText,
 onPreviewModeChange,
 onPreviewSubmit,
 onPreviewDictationSubmit,
 onPreviewDictationTextChange,
}: AdminPreviewPanelProps) {
 return (
  <div className="h-fit rounded-xl border border-stroke bg-surface-strong p-4">
   <div className="mb-2 flex items-center justify-between gap-2">
    <h3 className="text-sm font-semibold text-foreground ">Превью в чате</h3>
    <div className="inline-flex rounded-md border border-stroke bg-surface p-0.5 text-xs ">
     <button
      type="button"
      onClick={() => onPreviewModeChange('desktop')}
      className={`rounded px-2 py-1 ${
       previewMode === 'desktop'
        ? 'bg-primary text-white'
        : 'text-foreground/80 hover:bg-stroke'
      }`}
     >
      Desktop
     </button>
     <button
      type="button"
      onClick={() => onPreviewModeChange('mobile')}
      className={`rounded px-2 py-1 ${
       previewMode === 'mobile'
        ? 'bg-primary text-white'
        : 'text-foreground/80 hover:bg-stroke'
      }`}
     >
      Mobile
     </button>
    </div>
   </div>
   {preview.error ? (
    <p className="text-sm text-amber-700">Превью недоступно: {preview.error}</p>
   ) : preview.exercise ? (
    <div className={previewMode === 'mobile' ? 'mx-auto w-[320px] max-w-full' : 'w-full'}>
     <div className="mb-2 rounded-xl bg-surface px-4 py-3 text-sm text-foreground shadow-sm [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0">
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(preview.exercise.prompt)}</ReactMarkdown>
     </div>
     <ExerciseRenderer
      exercise={preview.exercise}
      onSubmit={onPreviewSubmit}
      previewMode={true}
     />
     {preview.exercise.type === 'dictation' ? (
      <form onSubmit={onPreviewDictationSubmit} className="mt-3 space-y-2">
       <textarea
        rows={3}
        value={previewDictationText}
        onChange={(event) => onPreviewDictationTextChange(event.target.value)}
        placeholder="Введите услышанный текст для проверки..."
        className="w-full resize-y rounded-xl border border-stroke bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition placeholder:text-foreground/45 focus:border-primary focus:ring-1 focus:ring-primary"
       />
       <button
        type="submit"
        disabled={!previewDictationText.trim()}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-strong disabled:cursor-not-allowed disabled:bg-[var(--stroke)]"
       >
        Проверить диктант
       </button>
      </form>
     ) : null}
     {previewCheckResult && (
      <div
       className={`relative mt-3 rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full ${
        preview.exercise.type === 'dictation'
         ? 'border-cyan-200 bg-cyan-50 text-cyan-950 before:bg-cyan-400 dark:border-cyan-300/25 dark:bg-surface-strong dark:text-foreground dark:before:bg-cyan-300/65'
         : previewCheckResult.isCorrect
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 before:bg-emerald-400 dark:border-emerald-300/25 dark:bg-surface-strong dark:text-foreground dark:before:bg-emerald-300/65 [&>p:first-child]:dark:text-emerald-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 before:bg-amber-400 dark:border-amber-300/25 dark:bg-surface-strong dark:text-foreground dark:before:bg-amber-300/70 [&>p:first-child]:dark:text-amber-200'
       }`}
      >
       {previewFeedbackSections ? (
        <div className="space-y-3">
         {previewFeedbackSections.lead ? (
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(previewFeedbackSections.lead)}</ReactMarkdown>
         ) : null}
         <div className="rounded-xl border border-emerald-200 bg-emerald-100/60 px-3 py-2 text-emerald-900 dark:border-emerald-600/30 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
           Правильный ответ
          </div>
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(previewFeedbackSections.correctAnswer)}</ReactMarkdown>
         </div>
         <div className="rounded-xl border border-stroke bg-surface-strong/70 px-3 py-2 text-foreground">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/80 ">
           Объяснение
          </div>
          <FormattedFeedbackExplanation text={previewFeedbackSections.explanation} />
         </div>
        </div>
       ) : (
        <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(previewCheckResult.text)}</ReactMarkdown>
       )}
      </div>
     )}
    </div>
   ) : (
    <p className="text-sm text-foreground/60">Заполните поля задания для превью.</p>
   )}
  </div>
 );
}
