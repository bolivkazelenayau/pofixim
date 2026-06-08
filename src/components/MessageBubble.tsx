'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';
import { CheckCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import FormattedFeedbackExplanation from './FormattedFeedbackExplanation';

type MessageBubbleProps = {
  content: string;
  isBot: boolean;
  isQuestion?: boolean;
  createdAt?: number;
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

function renderEditorMarkdown(value: string) {
  return value
    .replace(/==([\s\S]+?)==/g, '<span style="text-decoration-line: underline; text-decoration-style: double; text-decoration-skip-ink: none;">$1</span>')
    .replace(/\+\+([\s\S]+?)\+\+/g, '<u>$1</u>');
}

function getFeedbackTone(content: string) {
  if (/^\s*Верно\./u.test(content)) return 'correct';
  if (/^\s*(Почти|Проверь|Правильный ответ:|<div[^>]*>\s*<div[^>]*>Ошибок:)/u.test(content)) return 'wrong';
  return null;
}

export default function MessageBubble({ content, isBot, isQuestion, createdAt }: MessageBubbleProps) {
  const markdownContent = content.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const timeString = useMemo(() => {
    if (!createdAt) return '';
    return new Date(createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }, [createdAt]);
  const sections = useMemo(
    () => (isBot && !isQuestion ? splitFeedbackSections(markdownContent) : null),
    [isBot, isQuestion, markdownContent],
  );
  const feedbackTone = isBot && !isQuestion ? getFeedbackTone(markdownContent) : null;
  const isFeedback = Boolean(feedbackTone || sections);

  let bubbleClasses = '';
  if (isQuestion) {
    bubbleClasses = 'bg-primary text-white shadow-sm';
  } else if (isFeedback) {
    bubbleClasses = feedbackTone === 'correct'
      ? 'border border-emerald-300/25 bg-[var(--surface-strong)] text-foreground shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-emerald-400/70 dark:before:bg-emerald-300/65 [&>div>p:first-child]:text-emerald-700 [&>div>p:first-child]:dark:text-emerald-200'
      : 'border border-amber-300/25 bg-[var(--surface-strong)] text-foreground shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-amber-400/75 dark:before:bg-amber-300/70 [&>div>p:first-child]:text-amber-700 [&>div>p:first-child]:dark:text-amber-200';
  } else if (isBot) {
    bubbleClasses = 'bg-[var(--surface-strong)] text-foreground border border-[var(--stroke)] rounded-bl-none shadow-sm before:absolute before:bottom-[-1px] before:left-[-16px] before:h-4 before:w-4 before:bg-[var(--stroke)] before:[clip-path:polygon(100%_0,100%_100%,0_100%)] after:absolute after:bottom-0 after:left-[-14px] after:h-3.5 after:w-3.5 after:bg-[var(--surface-strong)] after:[clip-path:polygon(100%_0,100%_100%,0_100%)]';
  } else {
    bubbleClasses = 'bg-[#EEFFDE] text-black border border-[#D5E5C3] dark:border-[#74550d] dark:bg-[#3c2c12] dark:text-amber-50 rounded-br-none shadow-sm dark:shadow-none before:absolute before:bottom-[-1px] before:right-[-16px] before:h-4 before:w-4 before:bg-[#D5E5C3] before:[clip-path:polygon(0_0,100%_100%,0_100%)] dark:before:bg-[#74550d] after:absolute after:bottom-0 after:right-[-14px] after:h-3.5 after:w-3.5 after:bg-[#EEFFDE] after:[clip-path:polygon(0_0,100%_100%,0_100%)] dark:after:bg-[#3c2c12]';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`mb-4 flex w-full ${isBot ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className={`relative max-w-[88%] rounded-2xl px-5 py-3 shadow-sm before:pointer-events-none after:pointer-events-none [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0 ${isFeedback ? 'text-[14px] leading-[1.78] tracking-[0.025em]' : 'text-[15px] leading-[1.65]'} ${bubbleClasses}`}
      >
        {sections ? (
          <div className="space-y-3">
            {sections.lead ? <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(sections.lead)}</ReactMarkdown> : null}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-600/30 dark:bg-emerald-950/40 px-3 py-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                Правильный ответ
              </div>
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(sections.correctAnswer)}</ReactMarkdown>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-[var(--stroke)] dark:bg-[var(--surface)] px-3 py-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-foreground/80">
                Объяснение
              </div>
              <FormattedFeedbackExplanation text={sections.explanation} />
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className={!isBot ? 'pr-12' : ''}>
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>{renderEditorMarkdown(markdownContent)}</ReactMarkdown>
            </div>
            {!isBot && (
              <div className="absolute -bottom-1 -right-2 flex items-center gap-1 text-[11px] font-medium text-[#7EAC55] dark:text-amber-100/70">
                {timeString && <span>{timeString}</span>}
                <CheckCheck className="h-[14px] w-[14px]" strokeWidth={2.5} />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

