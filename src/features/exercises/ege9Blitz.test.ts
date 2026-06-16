import assert from 'node:assert/strict';
import { buildEge13QuickCards } from './ege13Quick';
import { buildEge15QuickCards } from './ege15Quick';
import { buildEge9BlitzCards } from './ege9Blitz';
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
  assert.equal(ege13Cards[1]?.rowIndex, 2);
  assert.equal(ege13Cards[1]?.correctChoice, 'separate');

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
  assert.equal(ege15Cards[1]?.positionIndex, 2);
  assert.equal(ege15Cards[1]?.correctChoice, 'nn');
}
