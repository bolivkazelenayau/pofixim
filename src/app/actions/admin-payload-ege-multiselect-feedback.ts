function compactCorrectAnswerLine(line: string) {
  const noNumber = line.replace(/^\s*\**\d+[).]\**\s*/u, '').trim();
  const parts = noNumber.split(/\s+[\u2014-]\s+/u);
  if (parts.length === 1) return noNumber;
  const words = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (i === 0) {
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
    .map((w) => w.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

export function normalizeMorphemeMarkdownSpacing(value: string) {
  const joinPrefixSpaces = (part: string) => part
    .replace(
      /(^|[^\p{L}])(рас|раз|без|бес|нис|низ|нес|нез|вз|вс|воз|вос|из|ис|под|пред|пре|при|пра|про|транс|контр|суб|супер|сверх)\s+(?=\p{Ll}|\*\*)/giu,
      '$1$2',
    );
  const normalizeMarked = (part: string) => part
    .replace(/(?<!\p{L})рас\s+ч[её]т(?!\p{L})/giu, 'расчёт')
    .replace(/\*\*([\p{L}])\s+\*\*(?=[\p{L}])/gu, '**$1**')
    .replace(/([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1**$2**')
    .replace(/([\p{L}])\*\*([\p{L}])\*\*\s+(?=[\p{L}])/gu, '$1**$2**')
    .replace(/(^|[^\p{L}])([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1$2**$3**')
    .replace(/((?=[\p{L}*]{1,24}\*\*)[\p{L}*]{1,24})\s+(?=\p{Ll})/gu, '$1')
    .replace(/\s+(?:\*\s*)+$/u, '');
  const parts = value.split(/\s+—\s+/u).map(normalizeMarked);
  if (parts.length < 2) return joinPrefixSpaces(normalizeMarked(value));
  parts[0] = parts[0].replace(
    /\b(рас|раз|без|бес|нис|низ|воз|вос|из|ис|под|пред|пре|при|сверх)\s+(?=\p{Ll})/giu,
    '$1',
  );
  return parts.map(joinPrefixSpaces).join(' — ');
}

function escapeRegExpLiteral(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function fillOptionBlanksFromLine(optionLine: string, explanationLine: string) {
  const optionParts = (optionLine || '').split(',').map((s) => s.trim());
  const cleanLine = normalizeMorphemeMarkdownSpacing(String(explanationLine || ''))
    .replace(/\*\*/g, '')
    .replace(/_/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '');
  const filledParts = optionParts.map((opt) => {
    const cleanOpt = normalizeMorphemeMarkdownSpacing(opt)
      .replace(/\*\*/g, '')
      .replace(/_/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, '');
    const parts = cleanOpt.split(/\.\.+/);
    if (parts.length !== 2) return opt;
    const [prefix, suffix] = parts;
    const escapedPrefix = escapeRegExpLiteral(prefix);
    const escapedSuffix = escapeRegExpLiteral(suffix);

    const regex = new RegExp(escapedPrefix + '([а-яёА-ЯЁ*A-Za-z]*?)' + escapedSuffix, 'i');
    const match = cleanLine.match(regex);
    if (match) {
      return opt.replace(/\.\.+/, match[1]);
    }
    return opt;
  });
  return filledParts.join(', ');
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

function splitEge10FeedbackRows(rows: string[], optionsLength: number) {
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

export function splitFeedbackFromExplanation(explanation: string, options: string[]) {
  const markerRegex =
    /\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u;
  const normalized = explanation.replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const markerMatch = normalized.match(markerRegex);
  const tail = markerMatch ? normalized.slice((markerMatch.index ?? 0) + markerMatch[0].length) : normalized;

  // Split by newlines first, then by inline numbered patterns
  const lines = tail.split('\n').map((l) => l.trim()).filter(Boolean);

  const numberedRows: string[] = [];
  let currentRow: string | null = null;
  for (const line of lines) {
    const inlineChunks = line.split(/(?=(?:^|\s)\**\d+[).]\**\s)/).map((c) => c.trim()).filter(Boolean);
    for (const chunk of inlineChunks) {
      const numMatch = chunk.match(/^\s*\**(\d+)[).]\**\s*/);
      if (numMatch) {
        if (currentRow !== null) numberedRows.push(currentRow);
        currentRow = chunk;
      } else if (currentRow !== null) {
        currentRow += ' ' + chunk;
      }
    }
  }
  if (currentRow !== null) numberedRows.push(currentRow);

  if (numberedRows.length > 0) {
    numberedRows[numberedRows.length - 1] = numberedRows[numberedRows.length - 1]
      .replace(/\s*\u041e\u0442\u0432\u0435\u0442:\s*[\d,.\s]+.*$/iu, '')
      .trim();
  }

  const rows = splitEge10FeedbackRows(
    numberedRows.length > 0 ? numberedRows : [tail],
    options.length,
  );
  const correctAnswer = rows.answerRows.map((line, i) => {
    if (options && options[i]) {
      return fillOptionBlanksFromLine(options[i], line);
    }
    return compactCorrectAnswerLine(line);
  }).filter(Boolean);

  if (!correctAnswer.length || !rows.explanationRows.length) return null;
  return { correctAnswer, explanation: rows.explanationRows };
}

export function buildCorrectAnswerLinesFromOptions(
  options: string[],
  targetSet: number[],
  explanationLines: string[] = [],
) {
  const mergedExplanation = explanationLines.join(' ');
  return [...new Set(targetSet)]
    .sort((a, b) => a - b)
    .map((idx) => {
      const option = options[idx - 1]?.trim();
      if (!option) return '';
      const explanationLine = explanationLines[idx - 1] ?? mergedExplanation;
      return explanationLine
        ? fillOptionBlanksFromLine(option, explanationLine)
        : option;
    })
    .filter((value): value is string => Boolean(value));
}
