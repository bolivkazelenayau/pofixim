import type { ExerciseEditorInput } from './admin-types';
import {
  mapEgeMultiSelectItem,
  mapFillBlankItem,
  mapMultipleChoiceItem,
  mapOrderFragmentsItem,
  mapPunctuationInsertItem,
  mapWordBankClozeItem,
  mapWordSearchItem,
} from './admin-exercise-mapper-basic';
import {
  mapDictationItem,
  mapOrthographyRepairItem,
} from './admin-exercise-mapper-audio-repair';
import {
  mapEge20PunctuationItem,
  mapEge21PunctuationItem,
  mapPunctuationConstructorItem,
} from './admin-exercise-mapper-punctuation';
import type { ExerciseRow, MapperRecord } from './admin-exercise-mapper-types';

export function mapExerciseRowToEditorResult(row: ExerciseRow): {
  success: true;
  item: Record<string, unknown>;
} {
  const payload = (row.payload ?? {}) as MapperRecord;
  const answer = (row.answer ?? {}) as MapperRecord;
  const sourceAlignment = (row.sourceAlignment ?? {}) as MapperRecord;
  const algorithmSteps = Array.isArray(row.algorithmSteps) ? row.algorithmSteps : [];

  const base = {
    id: row.id,
    type: row.type,
    seedKey: row.seedKey ?? '',
    category: row.category,
    difficulty: row.difficulty as 1 | 2,
    qualityStatus: row.qualityStatus as ExerciseEditorInput['qualityStatus'],
    prompt: row.prompt,
    explanation: row.explanation,
    skillTags: row.skillTags,
    sourceAlignment: typeof sourceAlignment.reference === 'string' ? sourceAlignment.reference : '',
    typicalMistake: row.typicalMistake ?? '',
    algorithmSteps: algorithmSteps
      .map((s) => (typeof (s as Record<string, unknown>).title === 'string' ? (s as Record<string, unknown>).title as string : ''))
      .filter(Boolean),
    isActive: row.isActive,
  };

  const args = { row, base, payload, answer };

  if (row.type === 'multiple_choice') {
    return { success: true, item: mapMultipleChoiceItem(args) };
  }

  if (row.type === 'ege_multi_select') {
    return { success: true, item: mapEgeMultiSelectItem(args) };
  }

  if (row.type === 'fill_blank') {
    return { success: true, item: mapFillBlankItem(args) };
  }

  if (row.type === 'word_bank_cloze') {
    return { success: true, item: mapWordBankClozeItem(args) };
  }

  if (row.type === 'word_search') {
    return { success: true, item: mapWordSearchItem(args) };
  }

  if (row.type === 'orthography_repair') {
    return { success: true, item: mapOrthographyRepairItem(args) };
  }

  if (row.type === 'dictation') {
    return { success: true, item: mapDictationItem(args) };
  }

  if (row.type === 'order_fragments') {
    return { success: true, item: mapOrderFragmentsItem(args) };
  }

  if (row.type === 'punctuation_constructor') {
    return { success: true, item: mapPunctuationConstructorItem(args) };
  }

  if (row.type === 'ege20_complex_sentence_punctuation') {
    return { success: true, item: mapEge20PunctuationItem(args) };
  }

  if (row.type === 'ege21_punctuation_analysis') {
    return { success: true, item: mapEge21PunctuationItem(args) };
  }

  return { success: true, item: mapPunctuationInsertItem(args) };
}
