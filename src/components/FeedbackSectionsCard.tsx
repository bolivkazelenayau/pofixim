'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { ChevronDown } from 'lucide-react';
import ExpandableContent from '@/components/ExpandableContent';
import FormattedFeedbackExplanation from '@/components/FormattedFeedbackExplanation';
import { renderEditorMarkdown } from '@/components/admin-form/markdown/formatting';
import { copyTextToClipboard } from '@/lib/clipboard';

export type FeedbackSectionsCardData = {
  lead: string;
  correctAnswer: string;
  explanation: string;
};

type FeedbackSectionsCardProps = {
  sections: FeedbackSectionsCardData;
  collapseExplanationByDefault?: boolean;
  seedKey?: string | null;
};

export default function FeedbackSectionsCard({
  sections,
  collapseExplanationByDefault = false,
  seedKey,
}: FeedbackSectionsCardProps) {
  const [explanationOpen, setExplanationOpen] = useState(!collapseExplanationByDefault);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  async function copySeed() {
    if (!seedKey) return;
    const didCopy = await copyTextToClipboard(seedKey);
    setCopyToast(didCopy ? 'Seed скопирован' : 'Не удалось скопировать');
  }

  return (
    <div className="relative">
      <div className="space-y-3">
      {sections.lead ? (
        <ReactMarkdown rehypePlugins={[rehypeRaw]}>
          {renderEditorMarkdown(sections.lead)}
        </ReactMarkdown>
      ) : null}
      <div className="rounded-[20px] border border-emerald-200 bg-emerald-100/60 px-3 py-2 text-emerald-900 dark:border-emerald-600/30 dark:bg-emerald-950/30 dark:text-emerald-200">
        <div className="mb-1 text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-300">
          Правильный ответ
        </div>
        <ExpandableContent
          text={sections.correctAnswer}
          collapsedMaxHeight={132}
          minCharacters={220}
          minLines={5}
          fadeClassName="from-emerald-100 dark:from-emerald-950"
        >
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>
            {renderEditorMarkdown(sections.correctAnswer)}
          </ReactMarkdown>
        </ExpandableContent>
      </div>
      {collapseExplanationByDefault && !explanationOpen ? (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => setExplanationOpen(true)}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition-[color,background-color,transform] duration-150 ease-out hover:bg-primary/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.96]"
            aria-expanded={false}
            title="Открыть подробный разбор ответа"
          >
            Показать объяснение
            <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
          </button>
          {seedKey ? (
            <button
              type="button"
              onClick={copySeed}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-foreground/50 transition-colors duration-150 ease-out hover:text-primary focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/30"
              title="Скопировать seed key"
            >
              seed: {seedKey}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="animate-[feedback-explanation-in_180ms_cubic-bezier(0.2,0,0,1)] rounded-[20px] border border-stroke bg-surface-strong/70 px-3 py-2 text-foreground shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase text-foreground/80">
                Объяснение
              </div>
            </div>
            <div className="mt-1">
              {collapseExplanationByDefault ? (
                <FormattedFeedbackExplanation text={sections.explanation} />
              ) : (
                <ExpandableContent
                  text={sections.explanation}
                  collapsedMaxHeight={172}
                  minCharacters={360}
                  minLines={6}
                >
                  <FormattedFeedbackExplanation text={sections.explanation} />
                </ExpandableContent>
              )}
            </div>
            {collapseExplanationByDefault ? (
              <button
                type="button"
                onClick={() => setExplanationOpen(false)}
                className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition-[color,background-color,transform] duration-150 ease-out hover:bg-primary/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.96]"
                aria-expanded={true}
              >
                Свернуть
                <ChevronDown
                  className="h-4 w-4 rotate-180 transition-transform duration-150 ease-out"
                  strokeWidth={2.2}
                />
              </button>
            ) : null}
          </div>
          {seedKey ? (
            <button
              type="button"
              onClick={copySeed}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-foreground/50 transition-colors duration-150 ease-out hover:text-primary focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/30"
              title="Скопировать seed key"
            >
              seed: {seedKey}
            </button>
          ) : null}
        </>
      )}
      </div>
      {copyToast && (
        <div className="pointer-events-none absolute bottom-2 left-4 z-sticky rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background shadow-lg">
          {copyToast}
        </div>
      )}
    </div>
  );
}
