import assert from 'node:assert/strict';
import {
  buildEge13QuickCards,
  isEge13QuickCardEligibleForNormalPool,
} from './ege13Quick';
import { buildEge15QuickCards, buildEge15QuickDiagnostics } from './ege15Quick';
import {
  buildEge9BlitzCards,
  isEge9BlitzCardEligibleForNormalPool,
} from './ege9Blitz';
import {
  buildStructuredFeedbackDiagnostics,
  extractStructuredFeedback,
} from './checkers/structuredFeedback';
import type { EgeMultiSelectExercise, FillBlankExercise } from './schemas';

function makeEge9Exercise(options: string[], explanation: string): EgeMultiSelectExercise {
  return {
    id: 1,
    type: 'ege_multi_select',
    seedKey: 'test-ege9-bank',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.9'],
    prompt: 'Укажите варианты ответов.',
    explanation,
    qualityStatus: 'review',
    isActive: true,
    payload: {
      options,
    },
    answer: {
      rawAnswerText: '1',
      acceptedAnswers: ['1'],
      targetSet: [1],
    },
  } as EgeMultiSelectExercise;
}

function findCard(exercise: EgeMultiSelectExercise, rowIndex: number, wordIndex: number) {
  const card = buildEge9BlitzCards(exercise).find(
    (item) => item.rowIndex === rowIndex && item.wordIndex === wordIndex,
  );

  assert(card, `Expected card row=${rowIndex} word=${wordIndex}`);
  return card;
}

export function runEge9BlitzRegressionTests() {
  const exercise = makeEge9Exercise(
    [
      'притв... риться, ср... внять(счёт), укр... щать',
      'ш...стка',
      'авиац...онно-космический',
      'фант...стический',
      'ж...кей',
    ],
    [
      '1) притвориться, сравнять(счёт), укрощать — проверяемые гласные.',
      '2) шёрстка — под ударением после шипящих пишется Ё.',
      '3) авиационно-космический — пишется И.',
      '4) фантастический — пишется А.',
      '5) жокей — иноязычное слово после Ж, пишется О.',
    ].join(' '),
  );

  const compareScore = findCard(exercise, 1, 2);
  assert.equal(compareScore.before, 'ср');
  assert.equal(compareScore.after, 'внять');
  assert.equal(compareScore.missingLetter, 'а');
  assert(compareScore.choices.includes('а'));
  assert(compareScore.choices.includes('о'));

  const fur = findCard(exercise, 2, 1);
  assert.equal(fur.before, 'ш');
  assert.equal(fur.after, 'рстка');
  assert.equal(fur.missingLetter, 'ё');
  assert(fur.choices.includes('ё'));
  assert(fur.choices.includes('о'));

  const aviation = findCard(exercise, 3, 1);
  assert.equal(aviation.before, 'авиац');
  assert.equal(aviation.after, 'онно-космический');
  assert.equal(aviation.missingLetter, 'и');

  const jockey = findCard(exercise, 5, 1);
  assert.equal(jockey.before, 'ж');
  assert.equal(jockey.after, 'кей');
  assert.equal(jockey.missingLetter, 'о');
  assert.deepEqual([...jockey.choices].sort(), ['а', 'о']);

  const violetExercise = makeEge9Exercise(
    [
      'ш..рстка, тяж..лый, защ..лка',
      'ф..лиал, ф..алка, ун..вермаг',
      'ц..ллофан, ц..нга, ц..стерна',
      'х..мелеон, ха..тический, прир..стание',
      'оч..рование, отр..сли (волосы), нак..лить (докрасна)',
    ],
    [
      '1) шёрстка, тяжёлый, защёлка — ё.',
      '2) филиал, фиалка, универмаг — и.',
      '3) целлофан, цинга, цистерна.',
      '4) хамелеон, хаотический, прирастание.',
      '5) очарование, отросли, накалить.',
    ].join(' '),
  );
  violetExercise.seedKey = 'ege9-bank-49737';
  const violet = findCard(violetExercise, 2, 2);
  assert.equal(violet.maskedWord, 'ф..алка');
  assert.equal(violet.correctWord, 'фиалка');
  assert.equal(violet.missingLetter, 'и');
  assert.deepEqual([...violet.choices].sort(), ['е', 'и']);
  assert.deepEqual(violet.resolution, {
    kind: 'exact',
    donorWord: 'фиалка',
    displayMaskedWord: 'ф..алка',
    distance: 0,
  });
  assert.equal(isEge9BlitzCardEligibleForNormalPool(violet), true);

  const malformedVioletExercise = makeEge9Exercise(
    [
      'ш..рстка, тяж..лый, защ..лка',
      'ф..лиал, ф..алллкка, ун..вермаг',
      'ц..ллофан, ц..нга, ц..стерна',
      'х..мелеон, ха..тический, прир..стание',
      'оч..рование, отр..сли (волосы), нак..лить (докрасна)',
    ],
    [
      '1) шёрстка, тяжёлый, защёлка — ё.',
      '2) филиал, фиалка, универмаг — и.',
      '3) целлофан, цинга, цистерна.',
      '4) хамелеон, хаотический, прирастание.',
      '5) очарование, отросли, накалить.',
    ].join(' '),
  );
  malformedVioletExercise.seedKey = 'ege9-bank-49737';
  const malformedViolet = findCard(malformedVioletExercise, 2, 2);
  assert.equal(malformedViolet.maskedWord, 'ф..алллкка');
  assert.equal(malformedViolet.correctWord, 'фиалка');
  assert.equal(malformedViolet.before, 'ф');
  assert.equal(malformedViolet.after, 'алллкка');
  assert.equal(malformedViolet.missingLetter, 'и');
  assert.deepEqual([...malformedViolet.choices].sort(), ['е', 'и']);
  assert.deepEqual(malformedViolet.resolution, {
    kind: 'fuzzy',
    donorWord: 'фиалка',
    displayMaskedWord: 'ф..алллкка',
    distance: 3,
  });
  assert.equal(isEge9BlitzCardEligibleForNormalPool(malformedViolet), false);

  const malformedVioletTrailingExercise = makeEge9Exercise(
    [
      'ш..рстка, тяж..лый, защ..лка',
      'ф..лиал, ф..алллккаа, ун..вермаг',
      'ц..ллофан, ц..нга, ц..стерна',
      'х..мелеон, ха..тический, прир..стание',
      'оч..рование, отр..сли (волосы), нак..лить (докрасна)',
    ],
    [
      '1) шёрстка, тяжёлый, защёлка — ё.',
      '2) филиал, фиалка, универмаг — и.',
      '3) целлофан, цинга, цистерна.',
      '4) хамелеон, хаотический, прирастание.',
      '5) очарование, отросли, накалить.',
    ].join(' '),
  );
  malformedVioletTrailingExercise.seedKey = 'ege9-bank-49737';
  const malformedVioletTrailing = findCard(malformedVioletTrailingExercise, 2, 2);
  assert.equal(malformedVioletTrailing.maskedWord, 'ф..алллккаа');
  assert.equal(malformedVioletTrailing.correctWord, 'фиалка');
  assert.equal(malformedVioletTrailing.before, 'ф');
  assert.equal(malformedVioletTrailing.after, 'алллккаа');
  assert.equal(malformedVioletTrailing.missingLetter, 'и');
  assert.deepEqual([...malformedVioletTrailing.choices].sort(), ['е', 'и']);
  assert.deepEqual(malformedVioletTrailing.resolution, {
    kind: 'fuzzy',
    donorWord: 'фиалка',
    displayMaskedWord: 'ф..алллккаа',
    distance: 4,
  });
  assert.equal(isEge9BlitzCardEligibleForNormalPool(malformedVioletTrailing), false);

  const structuredVioletFeedbackExercise = makeEge9Exercise(
    [
      'ш..рстка, тяж..лый, защ..лка',
      'ф..лиал, ф..алллккаа, ун..вермаг',
      'ц..ллофан, ц..нга, ц..стерна',
      'х..мелеон, ха..тический, прир..стание',
      'оч..рование, отр..сли (волосы), нак..лить (докрасна)',
    ],
    [
      'Ряд 1: шёрстка, тяжёлый, защёлка — ё.',
      'Ряд 2: филиал, фиалка, универмаг — и.',
      'Ряд 3: целлофан, цинга, цистерна.',
      'Ряд 4: хамелеон, хаотический, прирастание.',
      'Ряд 5: очарование, отросли, накалить.',
    ].join('\n'),
  );
  structuredVioletFeedbackExercise.answer = {
    rawAnswerText: '2',
    acceptedAnswers: ['2'],
    targetSet: [2],
  };
  const structuredVioletFeedback = extractStructuredFeedback(structuredVioletFeedbackExercise);
  assert.equal(
    structuredVioletFeedback?.correctAnswer,
    'ф**и**лиал, ф**и**алллккаа, ун**и**вермаг',
  );
  const structuredVioletDiagnostics = buildStructuredFeedbackDiagnostics(
    structuredVioletFeedbackExercise,
  );
  assert.equal(structuredVioletDiagnostics?.source, 'generated_rows');
  assert.deepEqual(structuredVioletDiagnostics?.targetIndexes, [2]);
  assert.deepEqual(structuredVioletDiagnostics?.extractedRowIndexes, [1, 2, 3, 4, 5]);
  assert.deepEqual(structuredVioletDiagnostics?.warnings, []);

  const ege13 = makeEge9Exercise(
    [
      'Многие употребляют в речи (НЕ)НУЖНЫЕ слова.',
      'Он смотрел на (НЕ)ОБРАЩАВШИХ внимания товарищей.',
    ],
    [
      '1) (НЕ)НУЖНЫЕ — слитно, можно заменить синонимом.',
      '2) (НЕ)ОБРАЩАВШИХ — раздельно, есть зависимое слово.',
    ].join(' '),
  ) as EgeMultiSelectExercise;
  ege13.skillTags = ['ege.13'];
  const ege13Cards = buildEge13QuickCards(ege13);
  assert.equal(ege13Cards[0]?.rowIndex, 1);
  assert.equal(ege13Cards[0]?.correctChoice, 'joined');
  assert.deepEqual(ege13Cards[0]?.resolution, {
    kind: 'row_keyword',
    source: 'row',
    confidence: 'high',
  });
  assert.equal(isEge13QuickCardEligibleForNormalPool(ege13Cards[0]!), true);
  assert.equal(ege13Cards[1]?.rowIndex, 2);
  assert.equal(ege13Cards[1]?.correctChoice, 'separate');
  assert.deepEqual(ege13Cards[1]?.resolution, {
    kind: 'row_keyword',
    source: 'row',
    confidence: 'high',
  });

  const ege13Fallback = makeEge9Exercise(
    [
      'Многие употребляют в речи (НЕ)НУЖНЫЕ слова.',
    ],
    [
      'Строка первая без распознанного номера: (НЕ)НУЖНЫЕ — слитно, можно заменить синонимом.',
    ].join(' '),
  ) as EgeMultiSelectExercise;
  ege13Fallback.skillTags = ['ege.13'];
  const ege13FallbackCards = buildEge13QuickCards(ege13Fallback);
  assert.equal(ege13FallbackCards[0]?.correctChoice, 'joined');
  assert.deepEqual(ege13FallbackCards[0]?.resolution, {
    kind: 'fallback_keyword',
    source: 'fallback',
    confidence: 'medium',
  });
  assert.equal(isEge13QuickCardEligibleForNormalPool(ege13FallbackCards[0]!), false);

  const ege15 = {
    id: 2,
    type: 'fill_blank',
    seedKey: 'test-ege15-bank',
    category: 'orthography',
    difficulty: 1,
    skillTags: ['ege.15'],
    prompt: 'Укажите цифру(-ы), на месте которой(-ых) пишется НН.',
    explanation: '2) деревянные — НН, 1) названые — одна Н.',
    qualityStatus: 'review',
    isActive: true,
    payload: {
      before: 'Назва(1)ые коньки были украше(2)ы узором.',
      after: '',
    },
    answer: {
      accepted: ['2'],
      caseSensitive: false,
    },
  } as FillBlankExercise;
  const ege15Cards = buildEge15QuickCards(ege15);
  assert.equal(ege15Cards[0]?.positionIndex, 1);
  assert.equal(ege15Cards[0]?.correctChoice, 'n');
  assert.deepEqual(ege15Cards[0]?.resolution, {
    kind: 'numbered_gap',
    promptKind: 'nn',
    acceptedSource: 'digit_set',
  });
  assert.equal(ege15Cards[1]?.positionIndex, 2);
  assert.equal(ege15Cards[1]?.correctChoice, 'nn');
  const ege15Diagnostics = buildEge15QuickDiagnostics(ege15);
  assert.equal(ege15Diagnostics.numberedCount, 2);
  assert.equal(ege15Diagnostics.simpleCount, 0);
  assert.deepEqual(ege15Diagnostics.acceptedDigitPositions, [2]);
  assert.deepEqual(ege15Diagnostics.skippedReasons, []);

  const simpleEge15 = {
    ...ege15,
    id: 3,
    seedKey: 'test-ege15-simple',
    payload: {
      before: 'деревя',
      after: 'ый',
    },
    answer: {
      accepted: ['нн'],
      caseSensitive: false,
    },
  } as FillBlankExercise;
  const simpleEge15Cards = buildEge15QuickCards(simpleEge15);
  assert.equal(simpleEge15Cards.length, 1);
  assert.equal(simpleEge15Cards[0]?.correctChoice, 'nn');
  assert.deepEqual(simpleEge15Cards[0]?.resolution, {
    kind: 'simple_fill_blank',
    promptKind: null,
    acceptedSource: 'direct_choice',
  });
  const simpleEge15Diagnostics = buildEge15QuickDiagnostics(simpleEge15);
  assert.equal(simpleEge15Diagnostics.numberedCount, 0);
  assert.equal(simpleEge15Diagnostics.simpleCount, 1);
  assert.equal(simpleEge15Diagnostics.directAcceptedChoice, 'nn');

  const ege18 = {
    id: 4,
    type: 'fill_blank',
    seedKey: 'test-ege18-bank',
    category: 'punctuation',
    difficulty: 1,
    skillTags: ['ege.18'],
    prompt: 'Расставьте знаки препинания.',
    explanation: 'Вводная конструкция обособляется.',
    qualityStatus: 'review',
    isActive: true,
    payload: {
      before: '1, 2',
      after: '',
    },
    answer: {
      accepted: ['12', '1 2'],
      caseSensitive: false,
    },
  } as FillBlankExercise;
  const ege18Diagnostics = buildStructuredFeedbackDiagnostics(ege18);
  assert.equal(ege18Diagnostics?.source, 'ege18_fill_blank');
  assert.deepEqual(ege18Diagnostics?.correctAnswerLines, ['12']);
  assert.deepEqual(ege18Diagnostics?.warnings, []);
}
