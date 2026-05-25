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

function findMaskedWordMatches(value) {
  const regex = /[А-ЯЁа-яёA-Za-z-]*(?:\.{2,}|…+|_+)[А-ЯЁа-яёA-Za-z-]*/gu;
  const result = [];
  let match;
  while ((match = regex.exec(String(value ?? ''))) !== null) {
    if (match.index == null) continue;
    result.push({ value: match[0], start: match.index, end: match.index + match[0].length });
  }
  return result;
}

function getDonorWordsOutsideParentheses(value) {
  const withoutParentheses = String(value ?? '').replace(/\([^)]*\)/g, ' ');
  return withoutParentheses.match(/[А-ЯЁа-яёA-Za-z-]+/gu) ?? [];
}

function findBestUnusedDonorWordForMaskedWord(maskedWord, donorWords, usedDonorIndexes) {
  const knownParts = String(maskedWord).split(/\.{2,}|…+|_+/u).filter(Boolean);
  for (let i = 0; i < donorWords.length; i++) {
    if (usedDonorIndexes.has(i)) continue;
    const donorWord = donorWords[i];
    const matches = knownParts.every((part) => donorWord.includes(part));
    if (matches) {
      usedDonorIndexes.add(i);
      return donorWord;
    }
  }
  return null;
}

function fillMaskedWordWithBold(maskedWord, donorWord) {
  const gapRegex = /\.{2,}|…+|_+/u;
  if (!gapRegex.test(maskedWord)) return maskedWord;
  const parts = maskedWord.split(gapRegex);
  let result = parts[0];
  let cursor = parts[0].length;
  if (!donorWord.startsWith(parts[0])) return donorWord;
  for (let i = 1; i < parts.length; i++) {
    const nextKnownPart = parts[i];
    const nextIndex = nextKnownPart ? donorWord.indexOf(nextKnownPart, cursor) : donorWord.length;
    if (nextIndex === -1) return donorWord;
    const missingLetters = donorWord.slice(cursor, nextIndex);
    if (missingLetters.length > 0) result += `**${missingLetters}**`;
    result += nextKnownPart;
    cursor = nextIndex + nextKnownPart.length;
  }
  return result;
}

function replaceMaskedWordsInText(optionText, donorWords) {
  const optionClean = stripBoldMarkdown(optionText).trim();
  const maskedMatches = findMaskedWordMatches(optionClean);
  if (maskedMatches.length === 0) return optionClean;
  if (donorWords.length === 0) return optionClean;

  let result = optionClean;
  let offset = 0;
  const usedDonorIndexes = new Set();

  maskedMatches.forEach((maskedMatch) => {
    const donorWord = findBestUnusedDonorWordForMaskedWord(maskedMatch.value, donorWords, usedDonorIndexes);
    if (!donorWord) return;
    const filledWord = fillMaskedWordWithBold(maskedMatch.value, donorWord);
    const start = maskedMatch.start + offset;
    const end = maskedMatch.end + offset;
    result = result.slice(0, start) + filledWord + result.slice(end);
    offset += filledWord.length - maskedMatch.value.length;
  });

  return result;
}

function fillGapsInOptionRowWithBold(optionRow, explanationRow) {
  const donorWords = getDonorWordsOutsideParentheses(explanationRow);
  return replaceMaskedWordsInText(optionRow, donorWords)
    .replace(/\s+([,;:])/g, '$1')
    .replace(/,\s*/g, ', ')
    .trim();
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

  assert.equal(
    fillGapsInOptionRowWithBold(
      'проповед..вать, (на террасе) свеж..',
      'проповедовать, (на террасе) свежо',
    ),
    'проповед**о**вать, (на террасе) свеж**о**',
  );

  assert.equal(
    fillGapsInOptionRowWithBold(
      '(ветерок) ве..л, стоим..сть',
      '(ветерок) веял, стоимость',
    ),
    '(ветерок) ве**я**л, стоим**о**сть',
  );

  assert.equal(fillMaskedWordWithBold('свеж..', 'свежо'), 'свеж**о**');

  assert.equal(
    fillGapsInOptionRowWithBold(
      'обур..вающий, торф..ное (болото)',
      'обуревающий, торфяное (болото)',
    ),
    'обур**е**вающий, торф**я**ное (болото)',
  );

  assert.equal(
    fillGapsInOptionRowWithBold(
      'заботл..вый, луков..ца',
      'заботливый, луковица',
    ),
    'заботл**и**вый, луков**и**ца',
  );

  assert.equal(
    fillGapsInOptionRowWithBold(
      '(на террасе) свеж..',
      '(на террасе) свежо',
    ),
    '(на террасе) свеж**о**',
  );

  assert.equal(
    fillGapsInOptionRowWithBold(
      'сращ..вать, трещ..нка',
      'сращивать, трещинка',
    ),
    'сращ**и**вать, трещ**и**нка',
  );

  assert.equal(
    fillGapsInOptionRowWithBold(
      'собач..нка, морж..вый (клык)',
      'собачонка, моржовый (клык)',
    ),
    'собач**о**нка, морж**о**вый (клык)',
  );

  assert.equal(
    fillGapsInOptionRowWithBold(
      'облиц..вать, сирен..ватый',
      'облицовывать, сиреневатый',
    ),
    'облиц**овы**вать, сирен**е**ватый',
  );

  console.log('PASS ege10 correct-answer display regression');
})();
