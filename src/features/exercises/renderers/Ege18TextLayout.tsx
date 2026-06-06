'use client';

import React from 'react';
import { cn } from '@/lib/utils';

const CENTERED_LAYOUT_ALIAS_RE = /^\s*\|\s*\|\s*\|---\|\s*\|/u;
const CENTERED_LAYOUT_ALIAS_ANY_RE = /\|\s*\|\s*\|---\|\s*\|/u;
const SINGLE_COLUMN_TABLE_RE =
  /^([\s\S]*?)\r?\n\s*\|\s*\|\s*\r?\n\s*\|---\|\s*\r?\n\s*\|([\s\S]*?)\|\s*([\s\S]*)$/u;

export type Ege18TextLayoutParts = {
  centered: boolean;
  content: string;
};

export type Ege18LayoutExplanationParts = {
  lead: string;
  layout: string;
  tail: string;
};

function cleanInvisibleText(value: string) {
  return String(value ?? '').replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
}

export function parseEge18TextLayout(text: string): Ege18TextLayoutParts {
  const clean = cleanInvisibleText(text);
  const centered = CENTERED_LAYOUT_ALIAS_RE.test(clean);
  const content = (
    centered
      ? clean.replace(CENTERED_LAYOUT_ALIAS_RE, '').replace(/\|\s*$/u, '')
      : clean
  ).trim();

  return { centered, content };
}

export function splitEge18LayoutExplanation(text: string): Ege18LayoutExplanationParts | null {
  const clean = cleanInvisibleText(text).trim();
  if (!clean) return null;

  const tableMatch = clean.match(SINGLE_COLUMN_TABLE_RE);
  const tableLayout = tableMatch?.[2] ?? '';
  if (tableMatch && /<br\s*\/?>/iu.test(tableLayout)) {
    return {
      lead: (tableMatch[1] ?? '').trim(),
      layout: tableLayout.trim(),
      tail: (tableMatch[3] ?? '').trim(),
    };
  }

  const aliasMatch = CENTERED_LAYOUT_ALIAS_ANY_RE.exec(clean);
  if (!aliasMatch || aliasMatch.index == null) return null;

  const lead = clean.slice(0, aliasMatch.index).trim();
  const rest = clean.slice(aliasMatch.index + aliasMatch[0].length).trim();
  const endIndex = rest.indexOf('|');
  const layout = (endIndex >= 0 ? rest.slice(0, endIndex) : rest).trim();
  const tail = (endIndex >= 0 ? rest.slice(endIndex + 1) : '').trim();

  if (!/<br\s*\/?>/iu.test(layout)) return null;

  return { lead, layout, tail };
}

export function renderEge18TextWithBreaks(text: string) {
  const parts = cleanInvisibleText(text).split(/<br\s*\/?>/giu);

  return parts.map((part, index) => (
    <React.Fragment key={`${index}-${part.slice(0, 12)}`}>
      {index > 0 && <br />}
      {part}
    </React.Fragment>
  ));
}

function isSignatureLine(line: string) {
  const text = line.trim();
  return /^\(.+\)$/u.test(text);
}

function isCenteredLine(line: string) {
  const text = line.trim();

  if (!text) {
    return false;
  }

  if (isSignatureLine(text) || /^<\.{3}>$/u.test(text) || /^<\u2026>$/u.test(text)) {
    return true;
  }

  return text.length <= 24 && !/[,.!?;:\u2014-]/u.test(text);
}

function renderCenteredTextLayout(text: string) {
  const lines = cleanInvisibleText(text)
    .split(/<br\s*\/?>/giu)
    .map((part) => part.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const centered = isCenteredLine(line);
    const previousCentered = index > 0 ? isCenteredLine(lines[index - 1]) : false;

    const spacing =
      centered && index > 0
        ? isSignatureLine(line)
          ? 'mt-5'
          : 'mt-4'
        : !centered && previousCentered
          ? 'mt-3'
          : !centered && index > 0
            ? 'mt-1'
            : '';

    return (
      <div
        key={`${index}-${line.slice(0, 12)}`}
        className={cn(
          'min-h-6',
          centered ? 'text-center' : 'text-left',
          isSignatureLine(line) && 'italic',
          spacing,
        )}
      >
        {line}
      </div>
    );
  });
}

type Ege18TextLayoutProps = {
  text: string;
  forceCentered?: boolean;
  className?: string;
};

export function Ege18TextLayout({
  text,
  forceCentered,
  className,
}: Ege18TextLayoutProps) {
  const layout = parseEge18TextLayout(text);
  const centered = forceCentered || layout.centered;

  return (
    <div
      className={cn(
        'whitespace-normal break-words',
        centered && 'text-center',
        className,
      )}
    >
      {centered ? (
        <div className="inline-block max-w-full text-left">
          {renderCenteredTextLayout(layout.content)}
        </div>
      ) : (
        renderEge18TextWithBreaks(layout.content)
      )}
    </div>
  );
}
