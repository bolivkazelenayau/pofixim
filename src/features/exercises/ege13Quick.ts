import type { EgeMultiSelectExercise } from './schemas';
import { hashString, xorshift } from '@/lib/hash';

export type Ege13QuickChoice = 'joined' | 'separate';

export type Ege13QuickCard = {
  id: string;
  sourceExerciseId?: number;
  seedKey?: string | null;
  rowIndex: number;
  token: string;
  context: string;
  correctChoice: Ege13QuickChoice;
  choices: ['Слитно', 'Раздельно'];
  correctChoiceIndex: 0 | 1;
  explanationSnippet?: string;
  resolution: Ege13QuickResolution;
};

export type Ege13QuickResolution = {
  kind: 'row_keyword' | 'row_spelling' | 'fallback_keyword' | 'fallback_spelling';
  source: 'row' | 'fallback';
  confidence: 'high' | 'medium';
};

const MARKER_RE =
  /(?:\((?:НЕ|НИ)\)\s*(?:\([^)]+\)\s*)*[\p{Script=Cyrillic}-]+)|(?:\((?:НЕ|НИ)\)\s*[\p{Script=Cyrillic}-]+)/u;
const NE_NI_RE = /\((?:НЕ|НИ)\)/u;
const CYRILLIC_BOUNDARY_LEFT = '(?<![\\p{Script=Cyrillic}-])';
const CYRILLIC_BOUNDARY_RIGHT = '(?![\\p{Script=Cyrillic}-])';

export function buildEge13QuickCards(
  exercise: EgeMultiSelectExercise,
): Ege13QuickCard[] {
  if (!exercise.skillTags.includes('ege.13')) {
    return [];
  }

  const explanationRows = extractExplanationRows(exercise.explanation);
  const cards: Ege13QuickCard[] = [];

  exercise.payload.options.slice(0, 5).forEach((optionLine, optionIndex) => {
    const rowIndex = optionIndex + 1;
    const context = stripMarkdown(optionLine);
    const marker = normalizeMarker(context.match(MARKER_RE)?.[0]);
    if (!marker || !NE_NI_RE.test(marker)) return;

    const explanationRow = explanationRows.get(rowIndex) ?? '';
    const resolution = classifyWriting({
      marker,
      explanationRow,
      fallbackExplanation: exercise.explanation,
    });
    if (!resolution) return;

    const choices: ['Слитно', 'Раздельно'] = ['Слитно', 'Раздельно'];

    cards.push({
      id: `${exercise.seedKey ?? exercise.id ?? 'ege13'}-${rowIndex}-${hashString(context)}`,
      sourceExerciseId: exercise.id,
      seedKey: exercise.seedKey,
      rowIndex,
      token: marker,
      context,
      correctChoice: resolution.choice,
      choices,
      correctChoiceIndex: resolution.choice === 'joined' ? 0 : 1,
      explanationSnippet: buildExplanationSnippet(explanationRow),
      resolution: resolution.resolution,
    });
  });

  return cards;
}

export function shuffleEge13QuickCards(
  cards: Ege13QuickCard[],
  seed = String(Date.now()),
): Ege13QuickCard[] {
  const result = [...cards];
  let state = hashString(seed) || 1;

  for (let i = result.length - 1; i > 0; i -= 1) {
    state = xorshift(state);
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

export function isEge13QuickCardEligibleForNormalPool(card: Ege13QuickCard) {
  return card.resolution.source === 'row';
}

function classifyWriting({
  marker,
  explanationRow,
  fallbackExplanation,
}: {
  marker: string;
  explanationRow: string;
  fallbackExplanation: string;
}): { choice: Ege13QuickChoice; resolution: Ege13QuickResolution } | null {
  const rowResult = explanationRow
    ? classifyWritingInText(marker, explanationRow, 'row')
    : null;
  if (rowResult) return rowResult;

  return classifyWritingInText(marker, fallbackExplanation, 'fallback');
}

function classifyWritingInText(
  marker: string,
  sourceText: string,
  source: 'row' | 'fallback',
): { choice: Ege13QuickChoice; resolution: Ege13QuickResolution } | null {
  const cleanRow = stripMarkdown(sourceText);
  const firstJoinedAt = cleanRow.search(/слитн[оа-я]*/iu);
  const firstSeparateAt = cleanRow.search(/раздельн[оа-я]*/iu);
  const confidence = source === 'row' ? 'high' : 'medium';

  if (firstJoinedAt >= 0 || firstSeparateAt >= 0) {
    const choice =
      firstSeparateAt === -1
        ? 'joined'
        : firstJoinedAt === -1
          ? 'separate'
          : firstJoinedAt < firstSeparateAt ? 'joined' : 'separate';
    return {
      choice,
      resolution: {
        kind: source === 'row' ? 'row_keyword' : 'fallback_keyword',
        source,
        confidence,
      },
    };
  }

  const markerParts = marker.match(/\((НЕ|НИ)\)\s*([\p{Script=Cyrillic}-]+)/u);
  if (!markerParts) return null;

  const particle = markerParts[1].toUpperCase();
  const word = markerParts[2];
  const row = stripMarkdown(cleanRow);
  const joined = new RegExp(
    `${CYRILLIC_BOUNDARY_LEFT}${particle}${escapeRegExp(word)}${CYRILLIC_BOUNDARY_RIGHT}`,
    'iu',
  );
  const separate = new RegExp(
    `${CYRILLIC_BOUNDARY_LEFT}${particle}\\s+${escapeRegExp(word)}${CYRILLIC_BOUNDARY_RIGHT}`,
    'iu',
  );

  if (separate.test(row)) {
    return {
      choice: 'separate',
      resolution: {
        kind: source === 'row' ? 'row_spelling' : 'fallback_spelling',
        source,
        confidence,
      },
    };
  }
  if (joined.test(row)) {
    return {
      choice: 'joined',
      resolution: {
        kind: source === 'row' ? 'row_spelling' : 'fallback_spelling',
        source,
        confidence,
      },
    };
  }
  return null;
}

function normalizeMarker(value: string | undefined) {
  return value?.replace(/\)\s+/u, ')').replace(/\s+/g, ' ').trim();
}

function extractExplanationRows(explanation: string) {
  const clean = stripMarkdown(explanation)
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const rows = new Map<number, string>();
  const rowRe =
    /(?:^|\s)(?:(?:Ряд\s*)?([1-5])\s*[:)]|\*\*Ряд\s*([1-5])\*\*\s*:)\s*([\s\S]*?)(?=\s+(?:(?:Ряд\s*)?[1-5]\s*[:)]|\*\*Ряд\s*[1-5]\*\*\s*:)|$)/giu;

  for (const match of clean.matchAll(rowRe)) {
    const rowIndex = Number(match[1] ?? match[2]);
    const rowText = String(match[3] ?? '').trim();
    if (rowIndex >= 1 && rowIndex <= 5 && rowText) {
      rows.set(rowIndex, rowText);
    }
  }

  return rows;
}

function buildExplanationSnippet(row: string) {
  const clean = stripMarkdown(row);
  if (!clean) return undefined;

  const afterDash = clean.split(/\s+[—-]\s+/u).slice(1).join(' — ').trim();
  const value = afterDash || clean;
  return value.length > 220 ? `${value.slice(0, 217).trim()}...` : value;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


