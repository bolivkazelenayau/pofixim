import type { ExerciseEditorInput } from '@/app/actions/admin';
import type { ExerciseCategory } from '@/features/exercises/types';
import { normalizeNumberAnswerSignature, parseIndexCsv } from '@/lib/exercise-type-conversion';
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
import type { Form, PMark } from './types';

export function formFromExerciseItem(item: Record<string, unknown>): Form {
  return {
    id: item.id as number,
    type: item.type as Form['type'],
    seedKey: String(item.seedKey ?? ''),
    category: item.category as ExerciseCategory,
    difficulty: item.difficulty as 1 | 2,
    qualityStatus: item.qualityStatus as Form['qualityStatus'],
    prompt: String(item.prompt ?? ''),
    explanation: String(item.explanation ?? ''),
    skillTags: Array.isArray(item.skillTags) ? (item.skillTags as string[]).join(', ') : '',
    sourceAlignment: String(item.sourceAlignment ?? ''),
    typicalMistake: String(item.typicalMistake ?? ''),
    algorithmSteps: Array.isArray(item.algorithmSteps) ? (item.algorithmSteps as string[]).join('\n') : '',
    isActive: Boolean(item.isActive),
    options: Array.isArray(item.options) ? (item.options as string[]) : ['', ''],
    correctOptionIndex: Number(item.correctOptionIndex ?? 0),
    multiCorrectOptionIndexes: Array.isArray(item.multiCorrectOptionIndexes)
      ? (item.multiCorrectOptionIndexes as number[]).join(', ')
      : '',
    fillBefore: String(item.fillBefore ?? ''),
    fillAfter: String(item.fillAfter ?? ''),
    fillAccepted: Array.isArray(item.fillAccepted) ? (item.fillAccepted as string[]).join(', ') : '',
    fillCaseSensitive: Boolean(item.fillCaseSensitive),
    wordBankTextWithSlots: String(item.wordBankTextWithSlots ?? ''),
    wordBankWords: Array.isArray(item.wordBankWords) ? (item.wordBankWords as string[]).join('\n') : '',
    wordBankCorrectBySlot: Array.isArray(item.wordBankCorrectBySlot)
      ? (item.wordBankCorrectBySlot as string[]).join('\n')
      : '',
    wordBankCaseSensitive: Boolean(item.wordBankCaseSensitive),
    wordSearchGridRows: Array.isArray(item.wordSearchGridRows) ? (item.wordSearchGridRows as string[]).join('\n') : '',
    wordSearchWords: Array.isArray(item.wordSearchWords) ? (item.wordSearchWords as string[]).join('\n') : '',
    wordSearchCaseSensitive: Boolean(item.wordSearchCaseSensitive),
    dictationTitle: String(item.dictationTitle ?? ''),
    dictationAudioSrc: String(item.dictationAudioSrc ?? ''),
    dictationPlaybackRates: Array.isArray(item.dictationPlaybackRates)
      ? (item.dictationPlaybackRates as number[]).join(', ')
      : '0.75, 1, 1.25, 1.5',
    dictationText: String(item.dictationText ?? ''),
    dictationCaseSensitive: Boolean(item.dictationCaseSensitive),
    dictationIgnorePunctuation: Boolean(item.dictationIgnorePunctuation),
    orthographyRepairText: String(item.orthographyRepairText ?? ''),
    orthographyRepairMode:
      (item.orthographyRepairMode as 'click_then_choose' | 'click_then_type' | undefined) ??
      'click_then_choose',
    orthographyRepairTargets: Array.isArray(item.orthographyRepairTargets)
      ? (item.orthographyRepairTargets as Array<{
          id: string;
          surface: string;
          replacement: string;
          type: 'word' | 'span';
          options?: string[];
          occurrence?: number;
        }>)
          .map((target) =>
            [
              target.id,
              target.surface,
              target.replacement,
              target.type,
              (target.options ?? []).join(', '),
              target.occurrence ?? '',
            ].join(' | '),
          )
          .join('\n')
      : '',
    orthographyRepairHints: Array.isArray(item.orthographyRepairHints)
      ? (item.orthographyRepairHints as string[]).join('\n')
      : '',
    orthographyRepairRepairs: Array.isArray(item.orthographyRepairRepairs)
      ? (item.orthographyRepairRepairs as Array<{ targetId: string; correct: string }>)
          .map((repair) => `${repair.targetId} | ${repair.correct}`)
          .join('\n')
      : '',
    orthographyRepairCorrectText: String(item.orthographyRepairCorrectText ?? ''),
    orderFragments: Array.isArray(item.orderFragments)
      ? (item.orderFragments as Array<{ id: string; text: string }>).map((fragment) => `${fragment.id} | ${fragment.text}`).join('\n')
      : '',
    orderCorrectOrder: Array.isArray(item.orderCorrectOrder) ? (item.orderCorrectOrder as string[]).join(', ') : '',
    punctuationTokens: Array.isArray(item.punctuationTokens) ? (item.punctuationTokens as string[]).join(' | ') : '',
    punctuationAllowedMarks: Array.isArray(item.punctuationAllowedMarks)
      ? (item.punctuationAllowedMarks as string[]).join(', ')
      : ',',
    punctuationMarks: Array.isArray(item.punctuationMarks)
      ? (item.punctuationMarks as Array<{ afterTokenIndex: number; mark: string }>)
          .map((mark) => `${mark.afterTokenIndex}:${mark.mark}`)
          .join(', ')
      : '',
    punctuationConstructorTokens: Array.isArray(item.punctuationConstructorTokens)
      ? (item.punctuationConstructorTokens as string[]).join(' | ')
      : '',
    punctuationConstructorMarkBank: Array.isArray(item.punctuationConstructorMarkBank)
      ? (item.punctuationConstructorMarkBank as string[]).join(', ')
      : 'comma, colon, dash',
    punctuationConstructorHints: Array.isArray(item.punctuationConstructorHints)
      ? (item.punctuationConstructorHints as string[]).join('\n')
      : '',
    punctuationConstructorGuidedSteps: Array.isArray(item.punctuationConstructorGuidedSteps)
      ? (item.punctuationConstructorGuidedSteps as Array<{
          id: string;
          title: string;
          slotIndex: number;
          marks?: string[];
        }>)
          .map((step) => `${step.id} | ${step.title} | ${step.slotIndex} | ${(step.marks ?? []).join(',')}`)
          .join('\n')
      : '',
    punctuationConstructorSegments: Array.isArray(item.punctuationConstructorSegments)
      ? (item.punctuationConstructorSegments as Array<{
          label: string;
          tokenStart: number;
          tokenEnd: number;
          kind: string;
        }>)
          .map((segment) => `${segment.label} | ${segment.tokenStart} | ${segment.tokenEnd} | ${segment.kind}`)
          .join('\n')
      : '',
    punctuationConstructorPlacements: Array.isArray(item.punctuationConstructorPlacements)
      ? (item.punctuationConstructorPlacements as Array<{ slotIndex: number; mark: string }>)
          .map((placement) => `${placement.slotIndex}:${placement.mark}`)
          .join(', ')
      : '',
    punctuationConstructorSlotExplanations: Array.isArray(item.punctuationConstructorSlotExplanations)
      ? (item.punctuationConstructorSlotExplanations as Array<{
          slotIndex: number;
          marks?: string[];
          text: string;
        }>)
          .map((slotExplanation) => `${slotExplanation.slotIndex} | ${(slotExplanation.marks ?? []).join(',')} | ${slotExplanation.text}`)
          .join('\n')
      : '',
    ege20TextWithSlots: String(item.ege20TextWithSlots ?? ''),
    ege20Slots: Array.isArray(item.ege20Slots) ? (item.ege20Slots as number[]).join(', ') : '',
    ege20TargetSet: Array.isArray(item.ege20TargetSet) ? (item.ege20TargetSet as number[]).join(', ') : '',
    ege21TargetPunctuation: ((item.ege21TargetPunctuation as
      | 'comma'
      | 'dash'
      | 'colon'
      | 'semicolon'
      | undefined) ?? 'comma'),
    ege21Sentences: Array.isArray(item.ege21Sentences)
      ? (item.ege21Sentences as Array<{ index: number; text: string }>)
          .map((sentence) => `${sentence.index}. ${sentence.text}`)
          .join('\n')
      : '',
    ege21TargetSet: Array.isArray(item.ege21TargetSet) ? (item.ege21TargetSet as number[]).join(', ') : '',
  };
}

export function buildPayloadFromForm(source: Form): ExerciseEditorInput {
  const skillTags = source.skillTags.split(',').map((value) => value.trim()).filter(Boolean);
  const steps = source.algorithmSteps.split('\n').map((value) => value.trim()).filter(Boolean);
  return {
    id: source.id,
    type: source.type,
    seedKey: source.seedKey || undefined,
    category: source.category,
    difficulty: source.difficulty,
    qualityStatus: source.qualityStatus,
    prompt: source.prompt,
    explanation: source.explanation,
    skillTags,
    sourceAlignment: source.sourceAlignment || undefined,
    typicalMistake: source.typicalMistake || undefined,
    algorithmSteps: steps,
    isActive: source.isActive,
    options:
      source.type === 'multiple_choice' || source.type === 'ege_multi_select'
        ? source.options
        : undefined,
    correctOptionIndex:
      source.type === 'multiple_choice' ? source.correctOptionIndex : undefined,
    multiCorrectOptionIndexes:
      source.type === 'ege_multi_select'
        ? source.multiCorrectOptionIndexes
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value > 0)
        : undefined,
    fillBefore: source.type === 'fill_blank' ? source.fillBefore : undefined,
    fillAfter: source.type === 'fill_blank' ? source.fillAfter : undefined,
    fillAccepted:
      source.type === 'fill_blank'
        ? skillTags.includes('ege.18')
          ? [normalizeNumberAnswerSignature(source.fillAccepted)].filter(Boolean)
          : source.fillAccepted.split(',').map((value) => value.trim()).filter(Boolean)
        : undefined,
    fillCaseSensitive:
      source.type === 'fill_blank' ? source.fillCaseSensitive : undefined,
    wordBankTextWithSlots:
      source.type === 'word_bank_cloze' ? source.wordBankTextWithSlots : undefined,
    wordBankWords:
      source.type === 'word_bank_cloze'
        ? source.wordBankWords.split('\n').map((value) => value.trim()).filter(Boolean)
        : undefined,
    wordBankCorrectBySlot:
      source.type === 'word_bank_cloze'
        ? source.wordBankCorrectBySlot
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
    wordBankCaseSensitive:
      source.type === 'word_bank_cloze' ? source.wordBankCaseSensitive : undefined,
    wordSearchGridRows:
      source.type === 'word_search'
        ? source.wordSearchGridRows.split('\n').map((value) => value.trim()).filter(Boolean)
        : undefined,
    wordSearchWords:
      source.type === 'word_search'
        ? source.wordSearchWords.split('\n').map((value) => value.trim()).filter(Boolean)
        : undefined,
    wordSearchCaseSensitive:
      source.type === 'word_search' ? source.wordSearchCaseSensitive : undefined,
    dictationTitle:
      source.type === 'dictation' ? source.dictationTitle : undefined,
    dictationAudioSrc:
      source.type === 'dictation' ? source.dictationAudioSrc : undefined,
    dictationPlaybackRates:
      source.type === 'dictation'
        ? source.dictationPlaybackRates
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value) && value > 0)
        : undefined,
    dictationText:
      source.type === 'dictation' ? source.dictationText : undefined,
    dictationCaseSensitive:
      source.type === 'dictation' ? source.dictationCaseSensitive : undefined,
    dictationIgnorePunctuation:
      source.type === 'dictation' ? source.dictationIgnorePunctuation : undefined,
    orthographyRepairText:
      source.type === 'orthography_repair' ? source.orthographyRepairText : undefined,
    orthographyRepairMode:
      source.type === 'orthography_repair' ? source.orthographyRepairMode : undefined,
    orthographyRepairTargets:
      source.type === 'orthography_repair'
        ? parseOrthographyRepairTargets(source.orthographyRepairTargets)
        : undefined,
    orthographyRepairHints:
      source.type === 'orthography_repair'
        ? source.orthographyRepairHints.split('\n').map((value) => value.trim()).filter(Boolean)
        : undefined,
    orthographyRepairRepairs:
      source.type === 'orthography_repair'
        ? parseOrthographyRepairRepairs(source.orthographyRepairRepairs)
        : undefined,
    orthographyRepairCorrectText:
      source.type === 'orthography_repair'
        ? source.orthographyRepairCorrectText
        : undefined,
    orderFragments:
      source.type === 'order_fragments'
        ? source.orderFragments
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => {
              const match = line.match(/^([^|]+)\|(.+)$/);
              if (match) return { id: match[1].trim(), text: match[2].trim() };
              return { id: `f${index + 1}`, text: line };
            })
            .filter((fragment) => fragment.id.length > 0 && fragment.text.length > 0)
        : undefined,
    orderCorrectOrder:
      source.type === 'order_fragments'
        ? source.orderCorrectOrder
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
    punctuationTokens:
      source.type === 'punctuation_insert'
        ? source.punctuationTokens.split('|').map((value) => value.trim()).filter(Boolean)
        : undefined,
    punctuationAllowedMarks:
      source.type === 'punctuation_insert'
        ? (source.punctuationAllowedMarks
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean) as PMark[])
        : undefined,
    punctuationMarks:
      source.type === 'punctuation_insert'
        ? parsePunctuationMarks(source.punctuationMarks)
        : undefined,
    punctuationConstructorTokens:
      source.type === 'punctuation_constructor'
        ? source.punctuationConstructorTokens.split('|').map((value) => value.trim()).filter(Boolean)
        : undefined,
    punctuationConstructorMarkBank:
      source.type === 'punctuation_constructor'
        ? parsePunctuationConstructorMarkBank(source.punctuationConstructorMarkBank)
        : undefined,
    punctuationConstructorHints:
      source.type === 'punctuation_constructor'
        ? source.punctuationConstructorHints.split('\n').map((value) => value.trim()).filter(Boolean)
        : undefined,
    punctuationConstructorGuidedSteps:
      source.type === 'punctuation_constructor'
        ? parsePunctuationConstructorGuidedSteps(source.punctuationConstructorGuidedSteps)
        : undefined,
    punctuationConstructorSegments:
      source.type === 'punctuation_constructor'
        ? parsePunctuationConstructorSegments(source.punctuationConstructorSegments)
        : undefined,
    punctuationConstructorPlacements:
      source.type === 'punctuation_constructor'
        ? parsePunctuationConstructorPlacements(source.punctuationConstructorPlacements)
        : undefined,
    punctuationConstructorSlotExplanations:
      source.type === 'punctuation_constructor'
        ? parsePunctuationConstructorSlotExplanations(source.punctuationConstructorSlotExplanations)
        : undefined,
    ege20TextWithSlots:
      source.type === 'ege20_complex_sentence_punctuation'
        ? source.ege20TextWithSlots
        : undefined,
    ege20Slots:
      source.type === 'ege20_complex_sentence_punctuation'
        ? parseIndexCsv(source.ege20Slots)
        : undefined,
    ege20TargetSet:
      source.type === 'ege20_complex_sentence_punctuation'
        ? parseIndexCsv(source.ege20TargetSet)
        : undefined,
    ege21TargetPunctuation:
      source.type === 'ege21_punctuation_analysis'
        ? source.ege21TargetPunctuation
        : undefined,
    ege21Sentences:
      source.type === 'ege21_punctuation_analysis'
        ? parseEge21SentencesText(source.ege21Sentences)
        : undefined,
    ege21TargetSet:
      source.type === 'ege21_punctuation_analysis'
        ? parseIndexCsv(source.ege21TargetSet)
        : undefined,
  };
}
