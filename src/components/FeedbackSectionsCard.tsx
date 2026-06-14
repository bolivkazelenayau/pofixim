'use client';

import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import FormattedFeedbackExplanation from '@/components/FormattedFeedbackExplanation';
import { renderEditorMarkdown } from '@/components/admin-form/markdown/formatting';

export type FeedbackSectionsCardData = {
  lead: string;
  correctAnswer: string;
  explanation: string;
};

type FeedbackSectionsCardProps = {
  sections: FeedbackSectionsCardData;
};

export default function FeedbackSectionsCard({ sections }: FeedbackSectionsCardProps) {
  return (
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
        <ReactMarkdown rehypePlugins={[rehypeRaw]}>
          {renderEditorMarkdown(sections.correctAnswer)}
        </ReactMarkdown>
      </div>
      <div className="rounded-[20px] border border-stroke bg-surface-strong/70 px-3 py-2 text-foreground">
        <div className="mb-1 text-xs font-semibold uppercase text-foreground/80">
          Объяснение
        </div>
        <FormattedFeedbackExplanation text={sections.explanation} />
      </div>
    </div>
  );
}
