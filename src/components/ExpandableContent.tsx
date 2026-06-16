'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type ExpandableContentProps = {
  children: ReactNode;
  text: string;
  collapsedMaxHeight?: number;
  minCharacters?: number;
  minLines?: number;
  expandLabel?: string;
  collapseLabel?: string;
  className?: string;
  fadeClassName?: string;
};

function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_`~[\]()<>{}|\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineCount(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export default function ExpandableContent({
  children,
  text,
  collapsedMaxHeight = 220,
  minCharacters = 520,
  minLines = 8,
  expandLabel = 'Показать полностью',
  collapseLabel = 'Свернуть',
  className,
  fadeClassName = 'from-[var(--surface-strong)]',
}: ExpandableContentProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = useMemo(() => {
    const clean = plainText(text);
    return clean.length >= minCharacters || lineCount(text) >= minLines;
  }, [minCharacters, minLines, text]);

  if (!isLong) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      <div
        className="relative overflow-hidden transition-[max-height] duration-200 ease-out"
        style={{ maxHeight: expanded ? undefined : collapsedMaxHeight }}
      >
        {children}
        {!expanded ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent ${fadeClassName}`}
          />
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition-[color,background-color,transform] duration-150 ease-out hover:bg-primary/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.96]"
        aria-expanded={expanded}
      >
        {expanded ? collapseLabel : expandLabel}
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-150 ease-out ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2.2}
        />
      </button>
    </div>
  );
}
