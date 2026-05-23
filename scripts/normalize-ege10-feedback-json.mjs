import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sql = postgres(connectionString);

function sameStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => String(value) === String(right[index]));
}

function sameFeedback(left, right) {
  return (
    sameStringArray(left?.correctAnswer, right?.correctAnswer) &&
    sameStringArray(left?.explanation, right?.explanation)
  );
}

function compactCorrectAnswerLine(line) {
  const noNumber = line.replace(/^\s*\**\d+[).]\**\s*/u, '').trim();
  const parts = noNumber.split(/\s+[\u2014-]\s+/u);
  if (parts.length === 1) return noNumber;
  const words = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (i === 0) {
      words.push(part);
    } else {
      // For intermediate parts, take only the last segment after punctuation
      // as the "word" — the rest is explanation text
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

function normalizeMorphemeMarkdownSpacing(value) {
  const joinPrefixSpaces = (part) => part
    .replace(/(^|[^\p{L}])не\s+с\s+(?=\p{Ll})/giu, '$1нес')
    .replace(
      /(^|[^\p{L}])(рас|раз|без|бес|нис|низ|нес|нез|вз|вс|воз|вос|из|ис|под|пред|пре|при|пра|про|транс|контр|суб|супер|сверх)\s+(?=\p{Ll}|\*\*)/giu,
      '$1$2',
    );
  const normalizeMarked = (part) => part
    .replace(/(?<!\p{L})рас\s+ч[её]т(?!\p{L})/giu, 'расчёт')
    .replace(/([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1**$2**')
    .replace(/([\p{L}])\*\*([\p{L}])\*\*\s+(?=[\p{L}])/gu, '$1**$2**')
    .replace(/(^|[^\p{L}])([\p{L}])\s+\*\*([\p{L}])\*\*\s*(?=[\p{L}])/gu, '$1$2**$3**')
    .replace(/((?=[\p{L}*]{1,24}\*\*)[\p{L}*]{1,24})\s+(?=\p{Ll})/gu, '$1')
    .replace(/\s+(?:\*\s*)+$/u, '');
  const parts = String(value ?? '').split(/\s+—\s+/u).map(normalizeMarked);
  if (parts.length < 2) return joinPrefixSpaces(normalizeMarked(String(value ?? '')));
  parts[0] = parts[0].replace(
    /\b(рас|раз|без|бес|нис|низ|воз|вос|из|ис|под|пред|пре|при|сверх)\s+(?=\p{Ll})/giu,
    '$1',
  );
  return parts.map(joinPrefixSpaces).join(' — ');
}

function fillOptionBlanksFromLine(optionLine, explanationLine) {
  const optionParts = (optionLine || '').split(',').map((s) => s.trim());
  const cleanLine = normalizeMorphemeMarkdownSpacing(explanationLine)
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
    const escapedPrefix = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const escapedSuffix = suffix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    const regex = new RegExp(escapedPrefix + '([а-яёА-ЯЁ*A-Za-z]*?)' + escapedSuffix, 'i');
    const match = cleanLine.match(regex);
    if (match) {
      return opt.replace(/\.\.+/, match[1]);
    }
    return opt;
  });
  return filledParts.join(', ');
}

function isDetailedEge10ExplanationRow(row) {
  return (
    /\u0420\u044f\u0434\s+(?:\u043d\u0435\s+)?\u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442/iu.test(row) ||
    /\**\u0421\u0442\u0440\u043e\u043a\u0430\s+\d+\**/iu.test(row)
  );
}

function normalizeDetailedEge10Row(row) {
  return row
    .replace(/^\**\u0421\u0442\u0440\u043e\u043a\u0430\s+(\d+)\**\s*/iu, '**$1)** ')
    .replace(/\s+(?:\*\s*)+$/u, '')
    .trim();
}

function splitEge10FeedbackRows(rows, optionsLength) {
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

function splitFeedbackFromExplanation(explanation, options) {
  const markerRegex =
    /\u041f\u0440\u0438\u0432\u0435\u0434[\u0435\u0451]\u043c \u0432\u0435\u0440\u043d\u043e\u0435 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435[:.]?\s*/u;
  const normalized = String(explanation ?? '').replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
  const markerMatch = normalized.match(markerRegex);
  const tail = markerMatch
    ? normalized.slice((markerMatch.index ?? 0) + markerMatch[0].length)
    : normalized;

  // Split by newlines first, then by inline numbered patterns
  const lines = tail.split('\n').map((l) => l.trim()).filter(Boolean);

  const numberedRows = [];
  let currentRow = null;
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

  // Strip trailing "Ответ: ..." from last row
  if (numberedRows.length > 0) {
    numberedRows[numberedRows.length - 1] = numberedRows[numberedRows.length - 1]
      .replace(/\s*Ответ:\s*[\d,.\s]+.*$/iu, '')
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

function buildCorrectAnswerLinesFromOptions(options, targetSet, explanationLines = []) {
  return [...new Set(targetSet)]
    .sort((a, b) => a - b)
    .map((idx) => {
      const option = String(options[idx - 1] ?? '').trim();
      if (!option) return '';
      const explanationLine = explanationLines[idx - 1];
      return explanationLine
        ? fillOptionBlanksFromLine(option, explanationLine)
        : option;
    })
    .filter(Boolean);
}

async function main() {
  const rows = await sql`
    select id, seed_key, payload, answer, explanation
    from exercises
    where type = 'ege_multi_select'
      and skill_tags @> array['ege.10']::text[]
  `;

  const updates = [];
  for (const row of rows) {
    const payload = row.payload ?? {};
    const answer = row.answer ?? {};
    const options = payload.options ?? [];
    const normalizedExplanation = normalizeMorphemeMarkdownSpacing(row.explanation);
    const feedback = splitFeedbackFromExplanation(normalizedExplanation, options);
    if (!feedback) continue;
    const correctAnswer = Array.isArray(answer.targetSet)
      ? buildCorrectAnswerLinesFromOptions(options, answer.targetSet, feedback.explanation)
      : [];
    if (!correctAnswer.length) continue;
    feedback.correctAnswer = correctAnswer;

    const prev = payload.feedback ?? null;
    const normalizedEditorExplanation = feedback.explanation.join('\n');
    const feedbackChanged = !sameFeedback(prev, feedback);
    const explanationChanged = String(row.explanation ?? '') !== normalizedEditorExplanation;
    const changed = feedbackChanged || explanationChanged;
    if (!changed) continue;

    updates.push({
      id: row.id,
      seedKey: row.seed_key,
      payload: { ...payload, feedback },
      explanation: normalizedEditorExplanation,
    });
  }

  console.log(`Type-10 rows scanned: ${rows.length}`);
  console.log(`Rows to update feedback JSON: ${updates.length}`);
  if (!APPLY) {
    console.log('Dry run complete. Add --apply to persist.');
    return;
  }

  for (const item of updates) {
    await sql`
      update exercises
      set payload = ${sql.json(item.payload)},
          explanation = ${item.explanation},
          updated_at = now()
      where id = ${item.id}
    `;
  }
  console.log('Done.');
}

try {
  await main();
} finally {
  await sql.end();
}

