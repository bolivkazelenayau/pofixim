'use client';

import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import {
  Ege18TextLayout,
  splitEge18LayoutExplanation,
} from '@/features/exercises/renderers/Ege18TextLayout';
import { renderEditorMarkdown } from '@/components/admin-form/markdown/formatting';

type FormattedFeedbackExplanationProps = {
  text: string;
};

function escapeMarkdownParenListMarkers(value: string) {
  return value.replace(/(^|\n)(\s*)(\d+)\)/gu, '$1$2$3\\)');
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown rehypePlugins={[rehypeRaw]}>
      {renderEditorMarkdown(escapeMarkdownParenListMarkers(text))}
    </ReactMarkdown>
  );
}

export default function FormattedFeedbackExplanation({
  text,
}: FormattedFeedbackExplanationProps) {
  const layoutParts = splitEge18LayoutExplanation(text);

  if (!layoutParts) {
    return <MarkdownBlock text={text} />;
  }

  return (
    <div className="space-y-3">
      {layoutParts.lead ? <MarkdownBlock text={layoutParts.lead} /> : null}
      <Ege18TextLayout
        text={layoutParts.layout}
        forceCentered
        className="my-2 text-[15px] font-medium leading-6 text-foreground"
      />
      {layoutParts.tail ? <MarkdownBlock text={layoutParts.tail} /> : null}
    </div>
  );
}
