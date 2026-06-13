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
  <section className="h-fit rounded-xl border border-stroke bg-surface-strong p-4">
   <div className="mb-3 flex items-start justify-between gap-3">
    <div>
     <h3 className="text-sm font-semibold text-foreground">Превью в чате</h3>
     <p className="mt-0.5 text-xs leading-5 text-foreground/70">
      Проверка того, как задание увидит ученик.
     </p>
    </div>
    <div className="inline-flex shrink-0 rounded-lg border border-stroke bg-surface p-0.5 text-xs">
     <button
      type="button"
      onClick={() => onPreviewModeChange('desktop')}
      className={`rounded-md px-2 py-1 transition-[background-color,color,transform] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] ${
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
      className={`rounded-md px-2 py-1 transition-[background-color,color,transform] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] ${
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
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
     <div className="font-semibold">Превью недоступно</div>
     <p className="mt-0.5 text-pretty text-xs">{preview.error}</p>
    </div>
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
        id="admin-preview-dictation-text"
        name="previewDictationText"
        rows={3}
        value={previewDictationText}
        onChange={(event) => onPreviewDictationTextChange(event.target.value)}
        placeholder="Введите услышанный текст для проверки..."
        aria-label="Текст диктанта для проверки"
        className="w-full resize-y rounded-xl border border-stroke bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-foreground/55 focus:border-primary focus:ring-1 focus:ring-primary"
       />
       <button
        type="submit"
        disabled={!previewDictationText.trim()}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[var(--stroke)] disabled:active:scale-100"
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
          <div className="mb-1 text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-300">
           Правильный ответ
          </div>
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(previewFeedbackSections.correctAnswer)}</ReactMarkdown>
         </div>
         <div className="rounded-xl border border-stroke bg-surface-strong/70 px-3 py-2 text-foreground">
          <div className="mb-1 text-xs font-semibold uppercase text-foreground/80 ">
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
    <div className="rounded-xl border border-dashed border-stroke bg-surface px-3 py-4">
     <div className="text-sm font-semibold text-foreground">Превью появится здесь</div>
     <p className="mt-1 text-pretty text-xs leading-5 text-foreground/70">
      Заполните формулировку, ответ и объяснение, чтобы проверить карточку перед сохранением.
     </p>
    </div>
   )}
  </section>
 );
}
