import type { ExerciseEditorInput } from './admin-types';
import {
  buildFillBlankPayload,
  buildMultipleChoicePayload,
  buildOrderFragmentsPayload,
  buildPunctuationInsertPayload,
  buildWordBankClozePayload,
  buildWordSearchPayload,
} from './admin-payload-basic';
import { buildDictationPayload } from './admin-payload-dictation';
import {
  buildEge20PunctuationPayload,
  buildEge21PunctuationPayload,
} from './admin-payload-ege-punctuation';
import { buildOrthographyRepairPayload } from './admin-payload-orthography';
import { buildPunctuationConstructorPayload } from './admin-payload-punctuation-constructor';
import { buildEgeMultiSelectPayload } from './admin-payload-ege-multiselect';
import type { AdminExercisePayloadBase } from './admin-payload-types';

function normalizeAlgorithmSteps(steps?: string[]) {
  const normalized =
    steps
      ?.map((title) => title.trim())
      .filter((title) => title.length > 0)
      .map((title, index) => ({ id: `admin_${index + 1}`, title, required: true })) ?? [];
  return normalized.length > 0 ? normalized : undefined;
}
export function buildExercisePayload(input: ExerciseEditorInput) {
  const base: AdminExercisePayloadBase = {
    type: input.type,
    seedKey: input.seedKey?.trim() || null,
    category: input.category,
    difficulty: input.difficulty,
    skillTags: input.skillTags.filter(Boolean),
    prompt: input.prompt.trim(),
    explanation: input.explanation.trim(),
    sourceAlignment: input.sourceAlignment?.trim()
      ? { reference: input.sourceAlignment.trim() }
      : undefined,
    typicalMistake: input.typicalMistake?.trim() || undefined,
    algorithmSteps: normalizeAlgorithmSteps(input.algorithmSteps),
    qualityStatus: input.qualityStatus,
    isActive: input.isActive ?? true,
  };

  if (input.type === 'multiple_choice') {
    return buildMultipleChoicePayload(input, base);
  }

  if (input.type === 'ege_multi_select') {
    return buildEgeMultiSelectPayload(input, base);
  }

  if (input.type === 'fill_blank') {
    return buildFillBlankPayload(input, base);
  }

  if (input.type === 'word_bank_cloze') {
    return buildWordBankClozePayload(input, base);
  }

  if (input.type === 'word_search') {
    return buildWordSearchPayload(input, base);
  }

  if (input.type === 'dictation') {
    return buildDictationPayload(input, base);
  }

  if (input.type === 'orthography_repair') {
    return buildOrthographyRepairPayload(input, base);
  }

  if (input.type === 'order_fragments') {
    return buildOrderFragmentsPayload(input, base);
  }

  if (input.type === 'punctuation_constructor') {
    return buildPunctuationConstructorPayload(input, base);
  }

  if (input.type === 'ege20_complex_sentence_punctuation') {
    return buildEge20PunctuationPayload(input, base);
  }

  if (input.type === 'ege21_punctuation_analysis') {
    return buildEge21PunctuationPayload(input, base);
  }

  return buildPunctuationInsertPayload(input, base);
}
