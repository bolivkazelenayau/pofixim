import { exerciseSchema, type Exercise } from '@/features/exercises/schemas';
import { normalizeNumberAnswerSignature, parseIndexCsv, stripEge18PromptFromFillBefore } from '@/lib/exercise-type-conversion';
import { buildEgeMultiSelectFeedback, normalizeMorphemeMarkdownSpacing } from './feedback';
import {
  parseEge21SentencesText,
  parseOrthographyRepairRepairs,
  parseOrthographyRepairTargets,
  parsePunctuationConstructorGuidedSteps,
  parsePunctuationConstructorMarkBank,
  parsePunctuationConstructorPlacements,
  parsePunctuationConstructorSegments,
  parsePunctuationConstructorSlotExplanations,
  parsePunctuationMarks,
} from './parsers';
import type { Form, PCMark } from './types';

type BuildPreviewExerciseInput = {
  form: Form;
  parsedSkillTags: string[];
  parsedSteps: string[];
};

export function buildPreviewExercise({
  form,
  parsedSkillTags,
  parsedSteps,
}: BuildPreviewExerciseInput): { exercise: Exercise | null; error: string } {
  const isEge18FillBlank =
    form.type === 'fill_blank' && parsedSkillTags.includes('ege.18');
  const ege18AcceptedSignature = normalizeNumberAnswerSignature(form.fillAccepted);
  const base = {
    id: form.id,
    seedKey: form.seedKey || null,
    category: form.category,
    difficulty: form.difficulty,
    prompt: form.prompt || 'Предпросмотр задания',
    explanation: form.explanation || 'Пояснение пока не заполнено.',
    skillTags: parsedSkillTags,
    sourceAlignment: form.sourceAlignment
      ? { reference: form.sourceAlignment }
      : undefined,
    typicalMistake: form.typicalMistake || undefined,
    algorithmSteps: parsedSteps.length
      ? parsedSteps.map((title, index) => ({
          id: `preview_${index + 1}`,
          title,
          required: true,
        }))
      : undefined,
    qualityStatus: form.qualityStatus,
    isActive: true,
    type: form.type,
  } as const;

  let candidate: unknown;
  if (form.type === 'multiple_choice') {
    const previewOptions = form.options.map((value) => value.trim()).filter(Boolean);
    const safeOptions = previewOptions.length > 0 ? previewOptions : ['Вариант 1'];
    const safeCorrectIndex = Math.min(
      Math.max(form.correctOptionIndex, 0),
      safeOptions.length - 1,
    );

    candidate = {
      ...base,
      payload: { options: safeOptions },
      answer: { correctOptionIndex: safeCorrectIndex },
    };
  } else if (form.type === 'ege_multi_select') {
    const previewOptions = form.options.map((value) => value.trim()).filter(Boolean);
    const safeOptions = previewOptions.length > 0 ? previewOptions : ['Вариант 1', 'Вариант 2'];
    const targetSet = form.multiCorrectOptionIndexes
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value <= safeOptions.length);
    const signature = [...new Set(targetSet)].sort((left, right) => left - right).join('');
    const safeTargetSet = targetSet.length ? targetSet : [1];
    const isEge10 = parsedSkillTags.includes('ege.10');
    const feedback = isEge10
      ? buildEgeMultiSelectFeedback(
          safeOptions,
          safeTargetSet,
          base.explanation,
        )
      : null;
    candidate = {
      ...base,
      explanation: isEge10
        ? normalizeMorphemeMarkdownSpacing(base.explanation)
        : base.explanation,
      payload: {
        options: safeOptions,
        ...(feedback ? { feedback } : {}),
      },
      answer: {
        rawAnswerText: signature || '1',
        acceptedAnswers: [signature || '1'],
        targetSet: safeTargetSet,
      },
    };
  } else if (form.type === 'fill_blank') {
    const accepted = isEge18FillBlank
      ? [ege18AcceptedSignature].filter(Boolean)
      : form.fillAccepted
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);

    candidate = {
      ...base,
      payload: {
        before:
          isEge18FillBlank
            ? stripEge18PromptFromFillBefore(form.fillBefore, form.prompt) || 'Текст до пропуска'
            : form.fillBefore || 'Текст до пропуска',
        after: form.fillAfter || (form.fillBefore ? '' : 'текст после пропуска'),
      },
      answer: {
        accepted: accepted.length > 0 ? accepted : ['пример'],
        caseSensitive: form.fillCaseSensitive,
      },
    };
  } else if (form.type === 'word_bank_cloze') {
    const wordBank = form.wordBankWords
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    const correctBySlot = form.wordBankCorrectBySlot
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    const slotCount = correctBySlot.length > 0 ? correctBySlot.length : 1;

    candidate = {
      ...base,
      payload: {
        textWithSlots: form.wordBankTextWithSlots || 'Текст [[1]] с пропуском.',
        slotCount,
        wordBank: wordBank.length > 0 ? wordBank : ['пример'],
      },
      answer: {
        correctBySlot: correctBySlot.length > 0 ? correctBySlot : ['пример'],
        caseSensitive: form.wordBankCaseSensitive,
      },
    };
  } else if (form.type === 'word_search') {
    const rows = form.wordSearchGridRows
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    const words = form.wordSearchWords
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);

    candidate = {
      ...base,
      payload: {
        grid:
          rows.length >= 2
            ? rows.map((line) => line.split('').filter(Boolean))
            : [
                ['Д', 'О', 'М'],
                ['О', 'К', 'Н'],
              ],
        words: words.length > 0 ? words : ['ДОМ'],
        allowDiagonal: true,
        allowReverse: true,
      },
      answer: {
        words: words.length > 0 ? words : ['ДОМ'],
        caseSensitive: form.wordSearchCaseSensitive,
      },
    };
  } else if (form.type === 'dictation') {
    const playbackRates = form.dictationPlaybackRates
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    candidate = {
      ...base,
      payload: {
        title: form.dictationTitle.trim() || form.prompt.trim() || 'Диктант',
        audioSrc:
          form.dictationAudioSrc.trim() ||
          '/voice_memos/audio_2026-06-08_00-53-43.ogg',
        ...(playbackRates.length > 0 ? { playbackRates } : {}),
      },
      answer: {
        text: form.dictationText.trim() || 'Текст диктанта.',
        caseSensitive: form.dictationCaseSensitive,
        ignorePunctuation: form.dictationIgnorePunctuation,
      },
    };
  } else if (form.type === 'orthography_repair') {
    const targets = parseOrthographyRepairTargets(form.orthographyRepairTargets);
    const safeTargets =
      targets.length > 0
        ? targets
        : [
            {
              id: 'target_1',
              surface: 'ошыбка',
              replacement: 'ошибка',
              type: 'word' as const,
              options: ['ошыбка', 'ошибка'],
            },
          ];
    const targetIds = new Set(safeTargets.map((target) => target.id));
    const repairs = parseOrthographyRepairRepairs(form.orthographyRepairRepairs)
      .filter((repair) => targetIds.has(repair.targetId));
    const safeRepairs =
      repairs.length > 0
        ? repairs
        : safeTargets.map((target) => ({
            targetId: target.id,
            correct: target.replacement,
          }));

    candidate = {
      ...base,
      payload: {
        text:
          form.orthographyRepairText.trim() ||
          `Найдите слово: ${safeTargets[0]?.surface ?? 'ошыбка'}.`,
        mode: form.orthographyRepairMode,
        targets: safeTargets,
        ...(form.orthographyRepairHints.trim()
          ? {
              hints: form.orthographyRepairHints
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : {}),
      },
      answer: {
        repairs: safeRepairs,
        ...(form.orthographyRepairCorrectText.trim()
          ? { correctText: form.orthographyRepairCorrectText.trim() }
          : {}),
      },
    };
  } else if (form.type === 'order_fragments') {
    const fragments = form.orderFragments
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const match = line.match(/^([^|]+)\|(.+)$/);
        if (match) {
          return { id: match[1].trim(), text: match[2].trim() };
        }
        return { id: `f${index + 1}`, text: line };
      })
      .filter((fragment) => fragment.id.length > 0 && fragment.text.length > 0);
    const safeFragments =
      fragments.length >= 2
        ? fragments
        : [
            { id: 'f1', text: 'Первый фрагмент' },
            { id: 'f2', text: 'Второй фрагмент' },
          ];
    const idSet = new Set(safeFragments.map((fragment) => fragment.id));
    const order = form.orderCorrectOrder
      .split(',')
      .map((value) => value.trim())
      .filter((id) => idSet.has(id));
    const correctOrder =
      order.length === safeFragments.length
        ? order
        : safeFragments.map((fragment) => fragment.id);

    candidate = {
      ...base,
      payload: { fragments: safeFragments },
      answer: { correctOrder },
    };
  } else if (form.type === 'punctuation_constructor') {
    const tokens = form.punctuationConstructorTokens
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
    const markBank = parsePunctuationConstructorMarkBank(
      form.punctuationConstructorMarkBank,
    );

    candidate = {
      ...base,
      payload: {
        tokens:
          tokens.length >= 2
            ? tokens
            : ['Мне', 'сказали', 'Ждите', 'придет'],
        markBank:
          markBank.length > 0
            ? markBank
            : (['comma', 'colon', 'dash'] satisfies PCMark[]),
        ...(form.punctuationConstructorHints.trim()
          ? {
              hints: form.punctuationConstructorHints
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : {}),
        ...(form.punctuationConstructorGuidedSteps.trim()
          ? {
              guidedSteps: parsePunctuationConstructorGuidedSteps(
                form.punctuationConstructorGuidedSteps,
              ),
            }
          : {}),
        ...(form.punctuationConstructorSegments.trim()
          ? { segments: parsePunctuationConstructorSegments(form.punctuationConstructorSegments) }
          : {}),
      },
      answer: {
        placements: parsePunctuationConstructorPlacements(
          form.punctuationConstructorPlacements,
        ),
        ...(form.punctuationConstructorSlotExplanations.trim()
          ? {
              slotExplanations: parsePunctuationConstructorSlotExplanations(
                form.punctuationConstructorSlotExplanations,
              ),
            }
          : {}),
      },
    };
  } else if (form.type === 'ege20_complex_sentence_punctuation') {
    const slots = form.ege20Slots
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    const slotsSet = new Set(slots);
    const targetSetRaw = parseIndexCsv(form.ege20TargetSet);
    const targetSet = [...new Set(targetSetRaw.filter((value) => slotsSet.has(value)))].sort(
      (left, right) => left - right,
    );
    const signature = targetSet.join('');

    candidate = {
      ...base,
      payload: {
        textWithSlots: form.ege20TextWithSlots || 'Текст (1) с (2) разметкой.',
        slots: slots.length > 0 ? [...new Set(slots)].sort((left, right) => left - right) : [1, 2],
      },
      answer: {
        rawAnswerText: signature || '1',
        acceptedAnswers: [signature || '1'],
        targetSet:
          targetSet.length > 0
            ? targetSet
            : slots.length > 0
              ? [slots[0]]
              : [1],
      },
    };
  } else if (form.type === 'ege21_punctuation_analysis') {
    const sentences = parseEge21SentencesText(form.ege21Sentences);
    const sentenceSet = new Set(sentences.map((sentence) => sentence.index));
    const targetSetRaw = parseIndexCsv(form.ege21TargetSet);
    const targetSet = [...new Set(targetSetRaw.filter((value) => sentenceSet.has(value)))].sort(
      (left, right) => left - right,
    );
    const signature = targetSet.join('');

    candidate = {
      ...base,
      payload: {
        targetPunctuation: form.ege21TargetPunctuation,
        sentences:
          sentences.length > 0
            ? sentences
            : [
                { index: 1, text: 'Пример первого предложения.' },
                { index: 2, text: 'Пример второго предложения.' },
              ],
      },
      answer: {
        rawAnswerText: signature || '1',
        acceptedAnswers: [signature || '1'],
        targetSet:
          targetSet.length > 0
            ? targetSet
            : sentences.length > 0
              ? [sentences[0].index]
              : [1],
      },
    };
  } else {
    const tokens = form.punctuationTokens
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
    const allowedMarks = form.punctuationAllowedMarks
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    candidate = {
      ...base,
      payload: {
        tokens: tokens.length > 0 ? tokens : ['Пример', 'предложения'],
        allowedMarks: allowedMarks.length > 0 ? allowedMarks : [','],
      },
      answer: {
        marks: parsePunctuationMarks(form.punctuationMarks),
      },
    };
  }

  const parsed = exerciseSchema.safeParse(candidate);
  return parsed.success
    ? { exercise: parsed.data as Exercise, error: '' }
    : {
        exercise: null,
        error: parsed.error.issues[0]?.message ?? 'Ошибка валидации превью',
      };
}
