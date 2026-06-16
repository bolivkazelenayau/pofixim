import type {
  Exercise,
  OrthographyRepairExercise,
  PunctuationConstructorExercise,
} from '../schemas';
import type { CheckMistake, CheckResult } from '../types';
import { punctuationConstructorGlyph } from './checkUtils';

export type Pedagogy = Pick<
  CheckResult,
  'mistakeCode' | 'failedStepIds' | 'stepFeedback' | 'nextRecommendation'
>;

export function buildPedagogy(
  exercise: Exercise,
  isCorrect: boolean,
  mistakes: CheckMistake[],
): Pedagogy {
  const skillTags = exercise.skillTags;
  const isEge14 = skillTags.includes('ege.14');
  const isEge18 = skillTags.includes('ege.18');
  const fallbackStepId = exercise.algorithmSteps?.[0]?.id ?? 'decision';

  if (isCorrect) {
    return {
      mistakeCode: null,
      failedStepIds: [],
      stepFeedback: [],
      nextRecommendation: {
        mode: exercise.difficulty === 2 ? 'challenge' : 'transfer',
        reason: 'Верный ответ, можно переносить правило в новый контекст.',
      },
    };
  }

  if (exercise.type === 'punctuation_constructor') {
    return buildPunctuationConstructorPedagogy(exercise, mistakes);
  }

  if (exercise.type === 'orthography_repair') {
    return buildOrthographyRepairPedagogy(exercise, mistakes);
  }

  if (exercise.type === 'dictation') {
    return buildDictationPedagogy(mistakes);
  }

  if (isEge14) {
    return {
      mistakeCode: 'fipi.ege14.homonymy_or_pos_confusion',
      failedStepIds: ['pos', 'context', 'decision'],
      stepFeedback: [
        {
          stepId: 'pos',
          ok: false,
          message: 'Сначала определи часть речи у спорного слова.',
        },
        {
          stepId: 'context',
          ok: false,
          message: 'Проверь значение в контексте и зависимые слова.',
        },
        {
          stepId: 'decision',
          ok: false,
          message: 'После этого выбери слитное/раздельное/дефисное написание.',
        },
      ],
      nextRecommendation: {
        mode: 'retry',
        reason: 'Проверь часть речи, контекст и способ написания спорного слова.',
      },
    };
  }

  if (isEge18) {
    return {
      mistakeCode: 'fipi.ege18.introductory_or_address_confusion',
      failedStepIds: ['syntax_role', 'boundary', 'decision'],
      stepFeedback: [
        {
          stepId: 'syntax_role',
          ok: false,
          message: 'Определи синтаксическую роль конструкции в предложении.',
        },
        {
          stepId: 'boundary',
          ok: false,
          message: 'Уточни границы вводного слова или обращения.',
        },
        {
          stepId: 'decision',
          ok: false,
          message: 'Поставь знак там, где конструкция действительно обособляется.',
        },
      ],
      nextRecommendation: {
        mode: 'retry',
        reason: 'Проверь границы конструкции и место знака в предложении.',
      },
    };
  }

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds: [fallbackStepId],
    stepFeedback: [
      {
        stepId: fallbackStepId,
        ok: false,
        message: 'Проверь выбранный ответ по правилу этого задания.',
      },
    ],
    nextRecommendation: {
      mode: 'retry',
      reason: 'Проверь условие, правило и выбранный ответ.',
    },
  };
}

function buildPunctuationConstructorPedagogy(
  exercise: PunctuationConstructorExercise,
  mistakes: CheckMistake[],
): Pedagogy {
  const messagesBySlot = new Map<number, string[]>();

  for (const mistake of mistakes) {
    const target = parseConstructorMistakeTarget(mistake.target);
    if (!target) continue;

    const mark = formatConstructorMarkForFeedback(target.mark);
    const messages = messagesBySlot.get(target.slotIndex) ?? [];
    if (mistake.kind === 'missing_punctuation_constructor_mark') {
      messages.push(`В слоте ${target.slotIndex} нужен знак: ${mark}.`);
    } else if (mistake.kind === 'extra_punctuation_constructor_mark') {
      messages.push(`В слоте ${target.slotIndex} стоит лишний знак: ${mark}.`);
    } else {
      messages.push(`Проверь слот ${target.slotIndex}: место и порядок знаков.`);
    }
    messagesBySlot.set(target.slotIndex, messages);
  }

  const slotExplanations = exercise.answer.slotExplanations ?? [];
  for (const item of slotExplanations) {
    if (!messagesBySlot.has(item.slotIndex)) continue;
    const messages = messagesBySlot.get(item.slotIndex) ?? [];
    messages.push(item.text);
    messagesBySlot.set(item.slotIndex, messages);
  }

  const failedStepIds =
    messagesBySlot.size > 0
      ? [...messagesBySlot.keys()]
          .sort((left, right) => left - right)
          .map((slotIndex) => `slot_${slotIndex}`)
      : ['punctuation_constructor'];

  const stepFeedback =
    messagesBySlot.size > 0
      ? failedStepIds.map((stepId) => {
          const slotIndex = Number(stepId.replace('slot_', ''));
          const messages = messagesBySlot.get(slotIndex) ?? [
            `Проверь слот ${slotIndex}.`,
          ];
          return {
            stepId,
            ok: false,
            message: [...new Set(messages)].join(' '),
          };
        })
      : [
          {
            stepId: 'punctuation_constructor',
            ok: false,
            message: 'Проверь подсвеченные слоты: знак, место и порядок.',
          },
        ];

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds,
    stepFeedback,
    nextRecommendation: {
      mode: 'retry',
      reason: 'Проверь подсвеченные слоты: знак, место и порядок внутри слота.',
    },
  };
}

function parseConstructorMistakeTarget(target: string | undefined):
  | {
      slotIndex: number;
      mark: PunctuationConstructorExercise['answer']['placements'][number]['mark'];
    }
  | null {
  if (!target) return null;
  const [slotRaw, markRaw] = target.split(':');
  const slotIndex = Number(slotRaw);
  if (!Number.isInteger(slotIndex) || !markRaw) return null;
  const mark = markRaw as PunctuationConstructorExercise['answer']['placements'][number]['mark'];
  return { slotIndex, mark };
}

function formatConstructorMarkForFeedback(
  mark: PunctuationConstructorExercise['answer']['placements'][number]['mark'],
) {
  const labels: Record<
    PunctuationConstructorExercise['answer']['placements'][number]['mark'],
    string
  > = {
    comma: 'запятая',
    colon: 'двоеточие',
    semicolon: 'точка с запятой',
    dash: 'тире',
    quote_open: 'открывающая кавычка',
    quote_close: 'закрывающая кавычка',
    paren_open: 'открывающая скобка',
    paren_close: 'закрывающая скобка',
    period: 'точка',
    exclamation: 'восклицательный знак',
    question: 'вопросительный знак',
    ellipsis: 'многоточие',
  };
  return labels[mark] ?? punctuationConstructorGlyph(mark);
}

function buildOrthographyRepairPedagogy(
  exercise: OrthographyRepairExercise,
  mistakes: CheckMistake[],
): Pedagogy {
  const targetById = new Map(
    exercise.payload.targets.map((target) => [target.id, target]),
  );
  const repairById = new Map(
    exercise.answer.repairs.map((repair) => [repair.targetId, repair]),
  );
  const failedStepIds = [
    ...new Set(
      mistakes.map((mistake) => parseOrthographyRepairTargetId(mistake.target)),
    ),
  ].filter(Boolean);
  const stepIds = failedStepIds.length > 0 ? failedStepIds : ['orthography_repair'];

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds: stepIds,
    stepFeedback: stepIds.map((stepId) => {
      const target = targetById.get(stepId);
      const repair = repairById.get(stepId);
      const surface = target?.surface ?? 'выбранный фрагмент';
      const correct = repair?.correct ?? target?.replacement;
      const message = correct
        ? `Проверь фрагмент «${surface}»: правильный вариант — «${correct}».`
        : 'Проверь выбранный фрагмент и вариант исправления.';
      return {
        stepId,
        ok: false,
        message,
      };
    }),
    nextRecommendation: {
      mode: 'retry',
      reason: 'Найди ошибочный фрагмент и выбери нормативное написание.',
    },
  };
}

function buildDictationPedagogy(mistakes: CheckMistake[]): Pedagogy {
  const kinds = new Set(mistakes.map((mistake) => mistake.kind));
  const failedStepIds = [
    ...(kinds.has('missing_dictation_token') ? ['omissions'] : []),
    ...(kinds.has('extra_dictation_token') ? ['extras'] : []),
    ...(kinds.has('wrong_dictation_token') ? ['substitutions'] : []),
  ];

  return {
    mistakeCode: mistakes[0]?.kind ?? null,
    failedStepIds: failedStepIds.length > 0 ? failedStepIds : ['dictation'],
    stepFeedback: [
      ...(kinds.has('missing_dictation_token')
        ? [
            {
              stepId: 'omissions',
              ok: false,
              message: 'Проверь пропущенные слова и знаки: часть диктовки не попала в текст.',
            },
          ]
        : []),
      ...(kinds.has('extra_dictation_token')
        ? [
            {
              stepId: 'extras',
              ok: false,
              message: 'Убери лишние слова или знаки, которых не было в аудио.',
            },
          ]
        : []),
      ...(kinds.has('wrong_dictation_token')
        ? [
            {
              stepId: 'substitutions',
              ok: false,
              message: 'Сверь подсвеченные замены с эталонной расшифровкой.',
            },
          ]
        : []),
    ],
    nextRecommendation: {
      mode: 'retry',
      reason: 'Переслушай фрагмент и исправь подсвеченные места.',
    },
  };
}

function parseOrthographyRepairTargetId(target: string | undefined) {
  if (!target) return '';
  return target.split(':')[0] ?? '';
}
