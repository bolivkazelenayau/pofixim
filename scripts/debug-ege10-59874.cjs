const postgres = require('postgres');
require('dotenv').config();

function stripBoldMarkdown(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}
function stripGlossParentheses(value) {
  return String(value ?? '').replace(/\(=[^)]+\)/g, '').replace(/\s+/g, ' ').trim();
}
function extractHeadWordsFromExplanationRow(rowText) {
  return stripBoldMarkdown(rowText)
    .split(/[,;]+/u)
    .map((chunk) => stripGlossParentheses(chunk))
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/[A-Za-zА-Яа-яЁё-]+/u);
      return m ? m[0] : '';
    })
    .filter(Boolean);
}
function fillOptionPartFromExplanation(optionPart, explanationPart) {
  const optionWordMatch = optionPart.match(/[A-Za-zА-Яа-яЁё.-]+/u);
  const explanationWordMatch = stripGlossParentheses(explanationPart).match(/[A-Za-zА-Яа-яЁё-]+/u);
  if (!optionWordMatch || !explanationWordMatch) return optionPart;

  const optionWordRaw = optionWordMatch[0];
  const trailingPunctuationMatch = optionWordRaw.match(/[.,;:!?]+$/u);
  const trailingPunctuation = trailingPunctuationMatch ? trailingPunctuationMatch[0] : '';
  const optionWord = trailingPunctuation ? optionWordRaw.slice(0, -trailingPunctuation.length) : optionWordRaw;
  const explanationWord = explanationWordMatch[0];

  if (!optionWord.includes('..')) return optionPart;
  const gapMatches = [...optionWord.matchAll(/\.\.+/g)];
  if (!gapMatches.length) return optionPart;

  let rebuilt = '';
  let cursor = 0;
  let expCursor = 0;

  for (let i = 0; i < gapMatches.length; i++) {
    const m = gapMatches[i];
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const prefix = optionWord.slice(cursor, start);
    const nextGap = gapMatches[i + 1];
    const suffix = nextGap ? optionWord.slice(end, nextGap.index ?? end) : optionWord.slice(end);

    const prefIdx = explanationWord.indexOf(prefix, expCursor);
    if (prefIdx < 0) return optionPart;
    const afterPrefix = prefIdx + prefix.length;
    const suffixIdx = suffix ? explanationWord.indexOf(suffix, afterPrefix) : explanationWord.length;
    if (suffixIdx < 0 || suffixIdx < afterPrefix) return optionPart;

    rebuilt += prefix + explanationWord.slice(afterPrefix, suffixIdx);
    expCursor = suffixIdx;
    cursor = end;
  }
  rebuilt += optionWord.slice(cursor);

  if (!rebuilt || rebuilt.includes('..')) return optionPart;
  return optionPart.replace(optionWordRaw, `${rebuilt}${trailingPunctuation}`);
}
function mergeOptionWithExplanation(optionLine, explanationRowText) {
  const optionParts = optionLine.split(',');
  const donorWords = extractHeadWordsFromExplanationRow(explanationRowText);
  if (!optionParts.length || !donorWords.length) return '';
  const mergedParts = optionParts.map((optionPart, i) => fillOptionPartFromExplanation(optionPart, donorWords[i] ?? ''));
  return mergedParts.join(',');
}
function extractRowsFromExplanation(explanation) {
  const rowsByIndex = new Map();
  const rowRe = /(?:\*\*)?Ряд\s+([1-5])(?:\*\*)?\s*:\s*([\s\S]*?)\s+[—-]\s+(?:\*\*)?(?:не\s+подходит|подходит)(?:\*\*)?\s*:/gu;
  for (const match of String(explanation ?? '').matchAll(rowRe)) {
    rowsByIndex.set(Number(match[1]), stripBoldMarkdown(String(match[2] ?? '').trim()));
  }
  return rowsByIndex;
}

(async()=>{
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const [ex] = await sql`select id, seed_key, payload, answer, explanation from exercises where seed_key='ege10-bank-59874' limit 1`;
    if (!ex) throw new Error('not found');
    const rowsByIndex = extractRowsFromExplanation(ex.explanation);
    const optionSkeletons = Array.isArray(ex.payload?.options) ? ex.payload.options : Array.isArray(ex.payload?.answerOptions) ? ex.payload.answerOptions : [];
    console.log('targetSet', ex.answer.targetSet);
    for (const idx of ex.answer.targetSet) {
      const base = stripBoldMarkdown(String(optionSkeletons[idx - 1] ?? '').trim());
      const from = rowsByIndex.get(idx) || '';
      const merged = mergeOptionWithExplanation(base, from);
      console.log('IDX', idx);
      console.log('BASE', base);
      console.log('FROM', from);
      console.log('MERG', merged || '<empty>');
    }
  } finally { await sql.end(); }
})();
