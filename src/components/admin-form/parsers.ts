import type { PCMark, PMark } from './types';

const PUNCTUATION_CONSTRUCTOR_MARKS = new Set<PCMark>([
  'comma',
  'colon',
  'semicolon',
  'dash',
  'quote_open',
  'quote_close',
  'paren_open',
  'paren_close',
  'period',
  'exclamation',
  'question',
  'ellipsis',
]);

export function parsePunctuationMarks(raw: string) {
  const regex = /(\d+)\s*:\s*([^\s]+)/g;
  const matches = Array.from(raw.matchAll(regex));

  return matches
    .map((match) => {
      const index = match[1];
      let mark = match[2];
      if (mark.length > 1 && mark.endsWith(',')) {
        mark = mark.slice(0, -1);
      }
      return {
        afterTokenIndex: Number(index),
        mark: mark as PMark,
      };
    })
    .filter(
      (value) =>
        Number.isInteger(value.afterTokenIndex) &&
        value.afterTokenIndex >= 0 &&
        typeof value.mark === 'string' &&
        value.mark.length > 0,
    );
}

export function parseOrthographyRepairTargets(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('|').map((part) => part.trim());
      const [idRaw, surfaceRaw, replacementRaw, typeRaw, optionsRaw, occurrenceRaw] = parts;
      return {
        id: idRaw || `target_${index + 1}`,
        surface: surfaceRaw ?? '',
        replacement: replacementRaw ?? '',
        type: typeRaw === 'span' ? ('span' as const) : ('word' as const),
        options: optionsRaw
          ? optionsRaw
              .split(',')
              .map((option) => option.trim())
              .filter(Boolean)
          : undefined,
        occurrence: occurrenceRaw ? Number(occurrenceRaw) : undefined,
      };
    })
    .filter(
      (target) =>
        target.id.length > 0 &&
        target.surface.length > 0 &&
        target.replacement.length > 0,
    );
}

export function parseOrthographyRepairRepairs(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [targetIdRaw, correctRaw] = line.split('|').map((part) => part.trim());
      return {
        targetId: targetIdRaw ?? '',
        correct: correctRaw ?? '',
      };
    })
    .filter((repair) => repair.targetId.length > 0 && repair.correct.length > 0);
}

export function parsePunctuationConstructorMarkBank(raw: string): PCMark[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is PCMark =>
      PUNCTUATION_CONSTRUCTOR_MARKS.has(value as PCMark),
    );
}

export function parsePunctuationConstructorPlacements(raw: string) {
  const regex = /(\d+)\s*:\s*([a-z_]+)/g;
  const matches = Array.from(raw.matchAll(regex));

  return matches
    .map((match) => ({
      slotIndex: Number(match[1]),
      mark: match[2] as PCMark,
    }))
    .filter(
      (placement) =>
        Number.isInteger(placement.slotIndex) &&
        placement.slotIndex >= 0 &&
        PUNCTUATION_CONSTRUCTOR_MARKS.has(placement.mark),
    );
}

export function punctuationConstructorGlyph(mark: PCMark) {
  const glyphs: Record<PCMark, string> = {
    comma: ',',
    colon: ':',
    semicolon: ';',
    dash: '—',
    quote_open: '«',
    quote_close: '»',
    paren_open: '(',
    paren_close: ')',
    period: '.',
    exclamation: '!',
    question: '?',
    ellipsis: '...',
  };

  return glyphs[mark];
}

export function renderPunctuationConstructorAnswer(tokensRaw: string, placementsRaw: string) {
  const tokens = tokensRaw
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean);
  const placements = parsePunctuationConstructorPlacements(placementsRaw);
  const parts: string[] = [];

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const beforeMarks = placements
      .filter((placement) => placement.slotIndex === tokenIndex)
      .map((placement) => punctuationConstructorGlyph(placement.mark))
      .join('');
    if (beforeMarks) parts.push(beforeMarks);
    parts.push(tokens[tokenIndex]);
  }

  const tailMarks = placements
    .filter((placement) => placement.slotIndex === tokens.length)
    .map((placement) => punctuationConstructorGlyph(placement.mark))
    .join('');
  if (tailMarks) parts.push(tailMarks);

  return parts
    .join(' ')
    .replace(/\s+([,;:.!?»)\u2026])/g, '$1')
    .replace(/([:;])«/g, '$1 «')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

export function parsePunctuationConstructorSegments(raw: string) {
  const allowed = new Set([
    'author_words',
    'direct_speech',
    'main_clause',
    'subordinate_clause',
    'introductory',
    'enumeration',
    'other',
  ]);

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, tokenStart, tokenEnd, kind] = line
        .split('|')
        .map((part) => part.trim());
      return {
        label,
        tokenStart: Number(tokenStart),
        tokenEnd: Number(tokenEnd),
        kind,
      };
    })
    .filter(
      (segment) =>
        segment.label &&
        Number.isInteger(segment.tokenStart) &&
        segment.tokenStart >= 0 &&
        Number.isInteger(segment.tokenEnd) &&
        segment.tokenEnd >= segment.tokenStart &&
        allowed.has(segment.kind),
    )
    .map((segment) => ({
      ...segment,
      kind: segment.kind as
        | 'author_words'
        | 'direct_speech'
        | 'main_clause'
        | 'subordinate_clause'
        | 'introductory'
        | 'enumeration'
        | 'other',
    }));
}

export function parsePunctuationConstructorGuidedSteps(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [idRaw, titleRaw, slotRaw, marksRaw] = line
        .split('|')
        .map((part) => part.trim());
      const marks = (marksRaw ?? '')
        .split(',')
        .map((mark) => mark.trim())
        .filter((mark): mark is PCMark =>
          PUNCTUATION_CONSTRUCTOR_MARKS.has(mark as PCMark),
        );
      return {
        id: idRaw || `step_${index + 1}`,
        title: titleRaw,
        slotIndex: Number(slotRaw),
        marks: marks.length > 0 ? marks : undefined,
      };
    })
    .filter(
      (step) =>
        step.id &&
        step.title &&
        Number.isInteger(step.slotIndex) &&
        step.slotIndex >= 0,
    );
}

export function parsePunctuationConstructorSlotExplanations(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [slotIndexRaw, marksRaw, ...textParts] = line.split('|');
      const marks = (marksRaw ?? '')
        .split(',')
        .map((mark) => mark.trim())
        .filter((mark): mark is PCMark =>
          PUNCTUATION_CONSTRUCTOR_MARKS.has(mark as PCMark),
        );
      return {
        slotIndex: Number(slotIndexRaw?.trim()),
        marks: marks.length > 0 ? marks : undefined,
        text: textParts.join('|').trim(),
      };
    })
    .filter(
      (item) =>
        Number.isInteger(item.slotIndex) &&
        item.slotIndex >= 0 &&
        item.text.length > 0,
    );
}

export function parseEge21SentencesText(raw: string): Array<{ index: number; text: string }> {
  const text = raw.trim();
  if (!text) return [];

  const marker = /\(?(\d{1,2})\)?\s*[.)\-:]\s*/g;
  const points: Array<{ idx: number; start: number; markerEnd: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text)) !== null) {
    points.push({
      idx: Number(match[1]),
      start: match.index,
      markerEnd: marker.lastIndex,
    });
  }

  if (points.length === 0) return [];

  const out: Array<{ index: number; text: string }> = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const body = text.slice(current.markerEnd, next ? next.start : text.length).trim();
    if (!Number.isInteger(current.idx) || current.idx <= 0 || !body) continue;
    out.push({ index: current.idx, text: body });
  }

  return out.sort((a, b) => a.index - b.index);
}
