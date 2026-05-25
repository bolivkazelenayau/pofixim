const assert = require('node:assert/strict');

function stripBoldMarkdown(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

function stripGlossParentheses(value) {
  return String(value).replace(/\(=[^)]+\)/g, '').replace(/\s+/g, ' ').trim();
}

function fillOptionPartFromExplanation(optionPart, explanationPart) {
  const optionWordMatch = optionPart.match(/[A-Za-zА-Яа-яЁё.-]+/u);
  const explanationWordMatch = stripGlossParentheses(explanationPart).match(/[A-Za-zА-Яа-яЁё-]+/u);
  if (!optionWordMatch || !explanationWordMatch) return optionPart;

  const optionWord = optionWordMatch[0];
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

  return optionPart.replace(optionWord, rebuilt);
}

function mergeOptionWithExplanation(optionLine, explanationRowText) {
  const optionParts = optionLine.split(',').map((s) => s.trim()).filter(Boolean);
  const explanationParts = stripBoldMarkdown(explanationRowText).split(',').map((s) => s.trim()).filter(Boolean);
  if (!optionParts.length || optionParts.length !== explanationParts.length) return '';
  return optionParts
    .map((optionPart, i) => fillOptionPartFromExplanation(optionPart, explanationParts[i] ?? ''))
    .join(', ');
}

function buildCorrectAnswerLines(exercise) {
  const rowsByIndex = new Map();
  const rowRe = /(?:\*\*)?Ряд\s+([1-5])(?:\*\*)?\s*:\s*([\s\S]*?)\s+[—-]\s+(?:\*\*)?(?:подходит|не подходит)(?:\*\*)?\s*:/g;

  for (const match of String(exercise.explanation ?? '').matchAll(rowRe)) {
    const index = Number(match[1]);
    const rowText = stripBoldMarkdown(String(match[2] ?? '').trim());
    if (Number.isInteger(index) && index > 0 && rowText) rowsByIndex.set(index, rowText);
  }

  const answerOptions = Array.isArray(exercise.payload?.answerOptions) ? exercise.payload.answerOptions : [];

  return [...new Set(exercise.answer?.targetSet ?? [])]
    .sort((a, b) => a - b)
    .map((index) => {
      const optionBase = stripBoldMarkdown(String(answerOptions[index - 1] ?? '').trim());
      const rowText = rowsByIndex.get(index);
      if (!rowText) return optionBase;
      return mergeOptionWithExplanation(optionBase, rowText) || rowText || optionBase;
    })
    .filter(Boolean);
}

(function run() {
  const exercise = {
    seed_key: 'ege10-bank-59874',
    payload: {
      answerOptions: [
        'непр..емлемый, пр..гожий, непр..ступная',
        '—',
        'пр..бежать, пр..российские, пр..образ',
      ],
    },
    answer: { targetSet: [1, 3] },
    explanation: [
      '**Ряд 1**: *неприемлемый*, *пригожий*, *неприступная (крепость)* — **подходит**: ...',
      '**Ряд 2**: *...* — **не подходит**: ...',
      '**Ряд 3**: *пробежать (круг)*, *пророссийские (интересы)*, *прообраз (героя)* — **подходит**: ...',
    ].join('\n\n'),
  };

  assert.deepEqual(buildCorrectAnswerLines(exercise), [
    'неприемлемый, пригожий, неприступная',
    'пробежать, пророссийские, прообраз',
  ]);

  const exerciseGloss = {
    payload: {
      answerOptions: [
        'бе..симптомный, и..порченный, не..добровать',
        'пр..неприятный, пр..ступный (сговор), пр..успеть (в учёбе)',
      ],
    },
    answer: { targetSet: [1, 2] },
    explanation: [
      '**Ряд 1**: *бессимптомный*, *испорченный*, *несдобровать* — **подходит**: ...',
      '**Ряд 2**: *пренеприятный (=очень)*, *преступный (=переступить) (сговор)*, *преуспеть (в учёбе)* — **подходит**: ...',
    ].join('\n\n'),
  };

  assert.deepEqual(buildCorrectAnswerLines(exerciseGloss), [
    'бессимптомный, испорченный, несдобровать',
    'пренеприятный, преступный (сговор), преуспеть (в учёбе)',
  ]);

  console.log('PASS ege10 correct-answer display regression');
})();
