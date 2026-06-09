import type { FeedbackSections, Form } from './types';

function compactCorrectAnswerLine(line: string) {
  const noNumber = line.replace(/^\s*\**\d+[).]\**\s*/u, '').trim();
  const parts = noNumber.split(/\s+[\u2014-]\s+/u);
  if (parts.length === 1) return noNumber;
  const words = [];
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (index === 0) {
      words.push(part);
    } else {
      const match = part.match(/[,;]\s*([^,;]+)$/);
      if (match) words.push(match[1].trim());
      else {
        const match2 = part.match(/[.]\s*([^.]+)$/);
        if (match2) words.push(match2[1].trim());
        else words.push(part.trim());
      }
    }
  }
  return words
    .map((word) => word.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .join(', ');
}

export function normalizeMorphemeMarkdownSpacing(value: string) {
  const joinPrefixSpaces = (part: string) =>
    part.replace(
      /(^|[^\p{L}])(рас|раз|без|бес|нис|низ|нес|нез|вз|вс|воз|вос|из|ис|под|пред|пре|при|пра|про|транс|контр|суб|супер|сверх)\s+(?=\p{Ll}|\*\*)/giu,
      '$1$2',
    );
  const normalizeMarked = (part: string) =>
    part
      .replace(/(?<!\p{L})рас\s+ч[её]т(?!\p{L})/giu, 'расчёт')
      .replace(/\*\*([\p{L}])\s+\*\*(?=[\p{L}])/gu, '**$1**')
      .replace(/([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1**$2**')
      .replace(/([\p{L}])\*\*([\p{L}])\*\*\s+(?=[\p{L}])/gu, '$1**$2**')
      .replace(/(^|[^\p{L}])([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1$2**$3**')
      .replace(/(^|[^\p{L}*])([\p{L}]+(?:\*\*[\p{L}]+\*\*)+)\s+(?=\p{Ll})/gu, '$1$2')
      .replace(/\s+(?:\*\s*)+$/u, '');
  const parts = value.split(/\s+—\s+/u).map(normalizeMarked);
  if (parts.length < 2) return joinPrefixSpaces(normalizeMarked(value));
  parts[0] = joinPrefixSpaces(parts[0]);
  return parts.join(' — ');
}

function normalizeAnswerWord(value: string) {
  return normalizeMorphemeMarkdownSpacing(value)
    .replace(/\*\*/g, '')
    .replace(/_/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '');
}

function escapeRegExpLiteral(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function fillOptionBlanks(optionLine: string, correctLine: string) {
  const optionParts = optionLine.split(',').map((part) => part.trim());
  const correctWords = correctLine.split(',').map((part) => part.trim());
  if (optionParts.length !== correctWords.length) return correctLine;

  const filledParts = optionParts.map((option, index) => {
    const word = normalizeAnswerWord(correctWords[index]);
    const cleanOption = normalizeAnswerWord(option);
    const parts = cleanOption.split(/\.\.+/);
    if (parts.length !== 2) return normalizeAnswerWord(correctWords[index]);
    const [prefix, suffix] = parts;
    const escapedPrefix = escapeRegExpLiteral(prefix);
    const escapedSuffix = escapeRegExpLiteral(suffix);
    const match = word.match(new RegExp(`^${escapedPrefix}(.*?)${escapedSuffix}$`, 'i'));
    if (match) {
      return option.replace(/\.\.+/, match[1]);
    }
    return normalizeAnswerWord(correctWords[index]);
  });
  return filledParts.join(', ');
}

function fillOptionBlanksFromLine(optionLine: string, explanationLine: string) {
  const optionParts = optionLine.split(',').map((part) => part.trim());
  const cleanLine = normalizeAnswerWord(explanationLine);
  const filledParts = optionParts.map((option) => {
    const cleanOption = normalizeAnswerWord(option);
    const parts = cleanOption.split(/\.\.+/);
    if (parts.length !== 2) return option;
    const [prefix, suffix] = parts;
    const escapedPrefix = escapeRegExpLiteral(prefix);
    const escapedSuffix = escapeRegExpLiteral(suffix);
    const match = cleanLine.match(new RegExp(`${escapedPrefix}([\\p{L}]*?)${escapedSuffix}`, 'iu'));
    return match ? option.replace(/\.\.+/, match[1]) : option;
  });
  return filledParts.join(', ');
}

export function splitFeedbackSections(content: string, options?: string[]): FeedbackSections | null {
  if (!/\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435/u.test(content)) return null;
  const normalized = content.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const markerMatch = normalized.match(/\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u);
  if (!markerMatch || markerMatch.index == null) return null;

  const markerIndex = markerMatch.index;
  const lead = normalized.slice(0, markerIndex).trim();
  const body = normalized.slice(markerIndex).trim();
  const tail = body.replace(/^\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u, '').trim();

  const numberedChunks = [...tail.matchAll(/(?:^|[\n;]\s*)(\d+[).]\s*[\s\S]*?)(?=(?:[\n;]\s*\d+[).])|$)/gu)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  const answerSource = numberedChunks.length >= 2 ? numberedChunks : tail.split('\n');
  const answerLinesRaw = answerSource
    .map((line) => line.trim())
    .filter(Boolean)
    .map(compactCorrectAnswerLine)
    .filter(Boolean);

  const answerLines = answerLinesRaw.map((line, index) => {
    if (options && options[index]) {
      return fillOptionBlanks(options[index], line);
    }
    return line;
  });

  const markdownAnswerList = answerLines.join('\n\n');

  return {
    lead,
    correctAnswer: answerLines.length > 0 ? markdownAnswerList : tail,
    explanation: content,
  };
}

export function extractNumberedExplanationRows(content: string) {
  const normalized = content.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const markerRegex = /\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u;
  const markerMatch = normalized.match(markerRegex);
  const tail = markerMatch
    ? normalized.slice((markerMatch.index ?? 0) + markerMatch[0].length)
    : normalized;

  const rows: string[] = [];
  let currentRow: string | null = null;
  const lines = tail.split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const chunks = line
      .split(/(?=(?:^|[\s;])\**\d+[).]\**\s*)/u)
      .map((chunk) => chunk.replace(/^;\s*/, '').trim())
      .filter(Boolean);

    for (const chunk of chunks) {
      if (/^\**\d+[).]\**\s*/u.test(chunk)) {
        if (currentRow) rows.push(currentRow);
        currentRow = chunk;
      } else if (currentRow) {
        currentRow += ` ${chunk}`;
      }
    }
  }

  if (currentRow) rows.push(currentRow);

  return rows
    .map((row) => row.replace(/\s*Ответ:\s*[\d,.\s|]+.*$/iu, '').trim())
    .filter(Boolean);
}

function isDetailedEge10ExplanationRow(row: string) {
  return (
    /\u0420\u044f\u0434\s+(?:\u043d\u0435\s+)?\u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442/iu.test(row) ||
    /\**\u0421\u0442\u0440\u043e\u043a\u0430\s+\d+\**/iu.test(row)
  );
}

function normalizeDetailedEge10Row(row: string) {
  return row
    .replace(/^\**\u0421\u0442\u0440\u043e\u043a\u0430\s+(\d+)\**\s*/iu, '**$1)** ')
    .replace(/\s+(?:\*\s*)+$/u, '')
    .trim();
}

export function splitEge10FeedbackRows(rows: string[], optionsLength: number) {
  const normalizedRows = rows
    .map(normalizeMorphemeMarkdownSpacing)
    .filter((row) => row !== '*');
  const inlineDetailedStart = normalizedRows.findIndex((row) =>
    /\**\u0421\u0442\u0440\u043e\u043a\u0430\s+\d+\**/iu.test(row),
  );
  if (inlineDetailedStart >= 0) {
    const markerized = normalizedRows[inlineDetailedStart]
      .replace(/\*\*\u0421\u0442\u0440\u043e\u043a\u0430\s+(\d+)\*\*/giu, '\n\u0421\u0442\u0440\u043e\u043a\u0430 $1')
      .replace(/([^\n])\u0421\u0442\u0440\u043e\u043a\u0430\s+(\d+)/giu, '$1\n\u0421\u0442\u0440\u043e\u043a\u0430 $2');
    const chunks = markerized
      .split('\n')
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    const firstDetailedChunk = chunks.findIndex((chunk) =>
      /^\**\u0421\u0442\u0440\u043e\u043a\u0430\s+\d+\**/iu.test(chunk),
    );
    const answerRows = normalizedRows.slice(0, inlineDetailedStart);
    if (firstDetailedChunk > 0) answerRows.push(...chunks.slice(0, firstDetailedChunk));
    return {
      answerRows: answerRows.slice(0, optionsLength),
      explanationRows: chunks.slice(Math.max(firstDetailedChunk, 0)).map(normalizeDetailedEge10Row),
    };
  }
  const detailedStart = normalizedRows.findIndex(isDetailedEge10ExplanationRow);
  if (detailedStart > 0) {
    return {
      answerRows: normalizedRows.slice(0, Math.min(optionsLength, detailedStart)),
      explanationRows: normalizedRows.slice(detailedStart).map(normalizeDetailedEge10Row),
    };
  }
  return {
    answerRows: normalizedRows,
    explanationRows: normalizedRows,
  };
}

function buildCorrectAnswerLinesFromOptions(
  options: string[],
  targetSet: number[],
  explanationRows: string[] = [],
) {
  const mergedExplanation = explanationRows.join(' ');
  return [...new Set(targetSet)]
    .sort((left, right) => left - right)
    .map((index) => {
      const option = options[index - 1]?.trim();
      if (!option) return '';
      const explanationRow = explanationRows[index - 1] ?? mergedExplanation;
      return explanationRow
        ? fillOptionBlanksFromLine(option, explanationRow)
        : option;
    })
    .filter((value): value is string => Boolean(value));
}

export function buildEgeMultiSelectFeedback(
  options: string[],
  targetSet: number[],
  explanation: string,
) {
  const rows = splitEge10FeedbackRows(
    extractNumberedExplanationRows(explanation),
    options.length,
  );
  const correctAnswer = buildCorrectAnswerLinesFromOptions(
    options,
    targetSet,
    rows.answerRows,
  );
  if (!correctAnswer.length) return null;
  return {
    correctAnswer,
    explanation: rows.explanationRows.length
      ? rows.explanationRows
      : [normalizeMorphemeMarkdownSpacing(explanation)],
  };
}

export function shouldNormalizeEge10Form(form: Pick<Form, 'type' | 'skillTags'>) {
  return (
    form.type === 'ege_multi_select' &&
    form.skillTags
      .split(',')
      .map((tag) => tag.trim())
      .includes('ege.10')
  );
}

export function shouldStripEge18FillBeforePrompt(form: Pick<Form, 'type' | 'skillTags'>) {
  return (
    form.type === 'fill_blank' &&
    form.skillTags
      .split(',')
      .map((tag) => tag.trim())
      .includes('ege.18')
  );
}
