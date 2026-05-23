'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';

type MessageBubbleProps = {
  content: string;
  isBot: boolean;
  isQuestion?: boolean;
};

type FeedbackSections = {
  lead: string;
  correctAnswer: string;
  explanation: string;
};

function splitFeedbackSections(content: string): FeedbackSections | null {
  const labeledMatch = content.match(
    /(?:^|\n)\s*\u041f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442:\s*([\s\S]*?)\n+\s*\u041e\u0431\u044a\u044f\u0441\u043d\u0435\u043d\u0438\u0435:\s*([\s\S]*)$/u,
  );
  if (labeledMatch) {
    const full = content;
    const start = labeledMatch.index ?? 0;
    const lead = full.slice(0, start).trim();
    const correctAnswer = (labeledMatch[1] ?? '').trim();
    const explanation = (labeledMatch[2] ?? '').trim();
    if (correctAnswer && explanation) {
      return { lead, correctAnswer, explanation };
    }
  }

  return null;
}

function escapeMarkdownParenListMarkers(value: string) {
  return value.replace(/(^|\n)(\s*)(\d+)\)/gu, '$1$2$3\\)');
}

export default function MessageBubble({ content, isBot, isQuestion }: MessageBubbleProps) {
  const markdownContent = content.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const sections = useMemo(
    () => (isBot && !isQuestion ? splitFeedbackSections(markdownContent) : null),
    [isBot, isQuestion, markdownContent],
  );

  let bubbleClasses = '';
  if (isQuestion) {
    bubbleClasses = 'bg-[#3390EC] text-white rounded-bl-none shadow-sm';
  } else if (isBot) {
    bubbleClasses = 'bg-white text-black border border-[var(--stroke)] rounded-bl-none shadow-sm';
  } else {
    bubbleClasses = 'bg-[#EEFFDE] text-black border border-[#D5E5C3] rounded-br-none shadow-sm';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`mb-4 flex w-full ${isBot ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className={`max-w-[88%] rounded-2xl px-5 py-3 text-[15px] leading-[1.65] shadow-sm [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0 ${bubbleClasses}`}
      >
        {sections ? (
          <div className="space-y-3">
            {sections.lead ? <ReactMarkdown>{sections.lead}</ReactMarkdown> : null}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Правильный ответ
              </div>
              <ReactMarkdown>{sections.correctAnswer}</ReactMarkdown>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                Объяснение
              </div>
              <ReactMarkdown>{escapeMarkdownParenListMarkers(sections.explanation)}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <ReactMarkdown>{markdownContent}</ReactMarkdown>
        )}
      </div>
    </motion.div>
  );
}

