'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { CheckCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import FeedbackSectionsCard from './FeedbackSectionsCard';
import { renderEditorMarkdown } from '@/components/admin-form/markdown/formatting';

type MessageBubbleProps = {
  content: string;
  isBot: boolean;
  isQuestion?: boolean;
  createdAt?: number;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  holdTail?: boolean;
  suppressTail?: boolean;
};

type FeedbackSections = {
  lead: string;
  correctAnswer: string;
  explanation: string;
};

type TailSide = 'none' | 'left' | 'right';

type BubbleRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

const BUBBLE_RADIUS = 18;
const GROUPED_RADIUS = 6;
const TAIL_WIDTH = 8;
const TAIL_HEIGHT = 11;
const TAIL_JOIN = 15;
export const MESSAGE_ENTER_DURATION_MS = 180;
const MESSAGE_ENTER_DURATION_SECONDS = MESSAGE_ENTER_DURATION_MS / 1000;

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((current) => {
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function clampRadius(radius: number, width: number, height: number) {
  return Math.min(radius, width / 2, height / 2);
}

function getBubblePath(
  width: number,
  height: number,
  tailSide: TailSide,
  radii: BubbleRadii,
) {
  if (width <= 0 || height <= 0) return '';

  const w = width;
  const h = height;
  const tl = clampRadius(radii.topLeft, w, h);
  const tr = clampRadius(radii.topRight, w, h);
  const br = clampRadius(radii.bottomRight, w, h);
  const bl = clampRadius(radii.bottomLeft, w, h);
  const tw = TAIL_WIDTH;
  const th = Math.min(TAIL_HEIGHT, Math.max(0, h - Math.max(tl, tr)));
  const join = Math.min(TAIL_JOIN, w * 0.35);

  if (tailSide === 'left') {
    return `
      M ${tl} 0
      H ${w - tr}
      Q ${w} 0 ${w} ${tr}
      V ${h - br}
      Q ${w} ${h} ${w - br} ${h}
      H ${join}
      C ${join * 0.55} ${h} 4 ${h - 0.5} ${-tw} ${h}
      C ${-4} ${h - 3.5} 0 ${h - 6.5} 0 ${h - th}
      V ${tl}
      Q 0 0 ${tl} 0
      Z
    `;
  }

  if (tailSide === 'right') {
    return `
      M ${tl} 0
      H ${w - tr}
      Q ${w} 0 ${w} ${tr}
      V ${h - th}
      C ${w} ${h - 6.5} ${w + 4} ${h - 3.5} ${w + tw} ${h}
      C ${w - 4} ${h - 0.5} ${w - join * 0.55} ${h} ${w - join} ${h}
      H ${bl}
      Q 0 ${h} 0 ${h - bl}
      V ${tl}
      Q 0 0 ${tl} 0
      Z
    `;
  }

  return `
    M ${tl} 0
    H ${w - tr}
    Q ${w} 0 ${w} ${tr}
    V ${h - br}
    Q ${w} ${h} ${w - br} ${h}
    H ${bl}
    Q 0 ${h} 0 ${h - bl}
    V ${tl}
    Q 0 0 ${tl} 0
    Z
  `;
}

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

function getFeedbackTone(content: string) {
  if (/^\s*Верно\./u.test(content)) return 'correct';
  if (/^\s*(Почти|Проверь|Правильный ответ:|<div class="dictation-feedback">|<div[^>]*>\s*<div[^>]*>Ошибок:)/u.test(content)) return 'wrong';
  return null;
}

function shouldRenderTrustedHtml(content: string) {
  const trimmed = content.trim();
  return (
    (/^📊\s+\*\*Таблица лидеров\*\*/u.test(content) && content.includes('<table')) ||
    /^<div class="dictation-(?:diff|feedback)">/u.test(trimmed)
  );
}

export default function MessageBubble({ content, isBot, isQuestion, createdAt, isFirstInGroup, isLastInGroup, holdTail = false, suppressTail = false }: MessageBubbleProps) {
  const [bubbleRef, bubbleSize] = useElementSize<HTMLDivElement>();
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
  const usesSvgShape = !isQuestion && !isFeedback;
  const trustedHtml = isBot ? shouldRenderTrustedHtml(markdownContent) : false;

  let bubbleClasses = '';
  const first = isFirstInGroup !== false;
  const last = isLastInGroup !== false;
  const shouldRenderTail = holdTail || (last && !suppressTail);
  const tailSide: TailSide = usesSvgShape && shouldRenderTail ? (isBot ? 'left' : 'right') : 'none';
  const radii = useMemo<BubbleRadii>(() => ({
    topLeft: isBot && !first ? GROUPED_RADIUS : BUBBLE_RADIUS,
    topRight: !isBot && !first ? GROUPED_RADIUS : BUBBLE_RADIUS,
    bottomRight: !isBot && !shouldRenderTail ? GROUPED_RADIUS : BUBBLE_RADIUS,
    bottomLeft: isBot && !shouldRenderTail ? GROUPED_RADIUS : BUBBLE_RADIUS,
  }), [first, isBot, shouldRenderTail]);
  const bubblePath = useMemo(
    () => getBubblePath(bubbleSize.width, bubbleSize.height, tailSide, radii),
    [bubbleSize.height, bubbleSize.width, radii, tailSide],
  );
  const bubbleVars = usesSvgShape
    ? ({
        '--bubble-tail-bg': isBot ? 'var(--surface-strong)' : 'var(--message-user-bg)',
        '--bubble-tail-border': isBot ? 'var(--stroke)' : 'var(--message-user-border)',
      } as CSSProperties)
    : undefined;

  if (isQuestion) {
    bubbleClasses = 'bg-primary text-white shadow-sm';
  } else if (isFeedback) {
    bubbleClasses = feedbackTone === 'correct'
      ? 'border border-emerald-300/25 bg-[var(--surface-strong)] text-foreground shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-emerald-400/70 dark:before:bg-emerald-300/65 [&>div>p:first-child]:text-emerald-700 [&>div>p:first-child]:dark:text-emerald-200'
      : 'border border-amber-300/25 bg-[var(--surface-strong)] text-foreground shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full before:bg-amber-400/75 dark:before:bg-amber-300/70 [&>div>p:first-child]:text-amber-700 [&>div>p:first-child]:dark:text-amber-200';
  } else if (isBot) {
    bubbleClasses = 'message-bubble message-bubble--bot text-foreground';
    if (!first) bubbleClasses += ' rounded-tl-[6px]';
    if (!shouldRenderTail) bubbleClasses += ' rounded-bl-[6px]';
    if (shouldRenderTail) bubbleClasses += ' message-bubble--bot-tail';
  } else {
    bubbleClasses = 'message-bubble message-bubble--user text-black dark:text-amber-50';
    if (!first) bubbleClasses += ' rounded-tr-[6px]';
    if (!shouldRenderTail) bubbleClasses += ' rounded-br-[6px]';
    if (shouldRenderTail) bubbleClasses += ' message-bubble--user-tail';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: MESSAGE_ENTER_DURATION_SECONDS, ease: 'easeOut' }}
      className={`${last ? 'mb-4' : 'mb-1'} flex w-full ${isBot ? 'justify-start' : 'justify-end'}`}
    >
      <div
        ref={bubbleRef}
        className={`relative max-w-[92%] rounded-2xl px-4 py-3 ${usesSvgShape ? '' : 'shadow-sm'} before:pointer-events-none after:pointer-events-none sm:max-w-[88%] sm:px-5 [&_strong]:font-bold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_p]:mb-2 [&_p:last-child]:mb-0 ${isFeedback ? 'text-pretty text-[14px] leading-[1.78]' : 'text-pretty text-[15px] leading-[1.65]'} ${bubbleClasses}`}
        style={bubbleVars}
      >
        {usesSvgShape && bubblePath ? (
          <svg
            aria-hidden="true"
            className="message-bubble__shape"
            focusable="false"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none',
            }}
            viewBox={`0 0 ${bubbleSize.width} ${bubbleSize.height}`}
          >
            <path
              className="message-bubble__path"
              d={bubblePath}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              style={{
                fill: isBot
                  ? 'var(--bubble-tail-bg, var(--surface-strong))'
                  : 'var(--bubble-tail-bg, var(--message-user-bg, #EEFFDE))',
                filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.08))',
                stroke: isBot
                  ? 'var(--bubble-tail-border, var(--stroke))'
                  : 'var(--bubble-tail-border, var(--message-user-border, #D5E5C3))',
                vectorEffect: 'non-scaling-stroke',
              }}
            />
          </svg>
        ) : null}
        <div
          className={usesSvgShape ? 'message-bubble__content' : undefined}
          style={usesSvgShape ? { position: 'relative', zIndex: 1 } : undefined}
        >
          {sections ? (
            <FeedbackSectionsCard sections={sections} />
          ) : (
            <div className="relative">
            <div className={!isBot ? 'pr-12' : 'pr-10'}>
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                {trustedHtml ? markdownContent : renderEditorMarkdown(markdownContent)}
              </ReactMarkdown>
            </div>
            {!isBot ? (
              <div className="absolute -bottom-1 -right-2 flex items-center gap-1 text-[11px] font-semibold text-[#5f9f4b] dark:text-amber-200/80">
                {timeString && <span>{timeString}</span>}
                <CheckCheck className="h-[14px] w-[14px]" strokeWidth={2.5} />
              </div>
            ) : (
              <div className={`absolute -bottom-1 -right-1.5 flex items-center gap-1 text-[11px] font-semibold ${isQuestion ? 'text-white/75' : 'text-foreground/65'}`}>
                {timeString && <span>{timeString}</span>}
              </div>
            )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
