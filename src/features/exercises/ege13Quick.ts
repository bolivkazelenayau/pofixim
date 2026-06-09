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
};

const MARKER_RE =
  /(?:\((?:НЕ|НИ)\)(?:\([^)]+\))*[\p{Script=Cyrillic}-]+)|(?:\((?:НЕ|НИ)\)[\p{Script=Cyrillic}-]+)/u;
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
    const marker = context.match(MARKER_RE)?.[0];
    if (!marker || !NE_NI_RE.test(marker)) return;

    const explanationRow = explanationRows.get(rowIndex) ?? '';
    const correctChoice = classifyWriting({
      marker,
      explanationRow,
      fallbackExplanation: exercise.explanation,
    });
    if (!correctChoice) return;

    const choices: ['Слитно', 'Раздельно'] = ['Слитно', 'Раздельно'];

    cards.push({
      id: `${exercise.seedKey ?? exercise.id ?? 'ege13'}-${rowIndex}-${hashString(context)}`,
      sourceExerciseId: exercise.id,
      seedKey: exercise.seedKey,
      rowIndex,
      token: marker,
      context,
      correctChoice,
      choices,
      correctChoiceIndex: correctChoice === 'joined' ? 0 : 1,
      explanationSnippet: buildExplanationSnippet(explanationRow),
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

function classifyWriting({
  marker,
  explanationRow,
  fallbackExplanation,
}: {
  marker: string;
  explanationRow: string;
  fallbackExplanation: string;
}): Ege13QuickChoice | null {
  const cleanRow = stripMarkdown(explanationRow || fallbackExplanation);
  const firstJoinedAt = cleanRow.search(/слитн[оа-я]*/iu);
  const firstSeparateAt = cleanRow.search(/раздельн[оа-я]*/iu);

  if (firstJoinedAt >= 0 || firstSeparateAt >= 0) {
    if (firstSeparateAt === -1) return 'joined';
    if (firstJoinedAt === -1) return 'separate';
    return firstJoinedAt < firstSeparateAt ? 'joined' : 'separate';
  }

  const markerParts = marker.match(/\((НЕ|НИ)\)([\p{Script=Cyrillic}-]+)/u);
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

  if (separate.test(row)) return 'separate';
  if (joined.test(row)) return 'joined';
  return null;
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


