const assert = require('node:assert/strict');
const postgres = require('postgres');
require('dotenv').config();

function stripBoldMarkdown(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

function extractRowsFromExplanation(explanation) {
  const rowsByIndex = new Map();
  const rowRe = /(?:\*\*)?Ряд\s+([1-5])(?:\*\*)?\s*:\s*([\s\S]*?)\s+[—-]\s+(?:\*\*)?(?:не\s+подходит|подходит)(?:\*\*)?\s*:/gu;
  for (const m of String(explanation ?? '').matchAll(rowRe)) {
    const idx = Number(m[1]);
    const text = stripBoldMarkdown(String(m[2] ?? '').trim());
    if (Number.isInteger(idx) && idx > 0 && text) rowsByIndex.set(idx, text);
  }
  return rowsByIndex;
}

function buildEge9Lines(exercise) {
  const rowsByIndex = extractRowsFromExplanation(exercise.explanation);
  const optionSkeletons = Array.isArray(exercise.payload?.options)
    ? exercise.payload.options
    : Array.isArray(exercise.payload?.answerOptions)
      ? exercise.payload.answerOptions
      : [];

  return [...new Set(exercise.answer?.targetSet ?? [])]
    .sort((a, b) => a - b)
    .map((idx) => rowsByIndex.get(idx) || stripBoldMarkdown(String(optionSkeletons[idx - 1] ?? '').trim()))
    .filter(Boolean);
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select seed_key, payload, answer, explanation
      from exercises
      where seed_key = 'live-ege9-51517'
      limit 1
    `;
    assert.equal(rows.length, 1, 'Exercise live-ege9-51517 not found');
    const ex = rows[0];

    const extracted = extractRowsFromExplanation(ex.explanation);
    const expectedRows = new Map([
      [1, 'расстилать, разбираться, утихать'],
      [2, 'вытирать, сжигать, начинать'],
      [3, 'перила, расплескать, сочетание'],
      [4, 'поровну, прискакать, возлагать'],
      [5, 'опровергать, дебаты, истинный'],
    ]);

    for (const [k, v] of expectedRows) {
      assert.equal(extracted.get(k), v, `Row ${k} mismatch`);
    }

    const displayExercise = {
      ...ex,
      answer: { ...ex.answer, targetSet: [1, 2, 3] },
    };
    const lines = buildEge9Lines(displayExercise);
    assert.deepEqual(lines, [
      'расстилать, разбираться, утихать',
      'вытирать, сжигать, начинать',
      'перила, расплескать, сочетание',
    ]);

    console.log('PASS live-ege9-51517 extraction and display');
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
