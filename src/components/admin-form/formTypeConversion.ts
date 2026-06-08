import {
  buildFillBlankQuestionText,
  describeAnswerTransfer,
  extractOptionsFromQuestionText,
  extractPromptFromQuestionText,
  parseFillAcceptedSignature,
  serializeMultiAnswerForFillBlank,
} from '@/lib/exercise-type-conversion';
import type { Form } from './types';

export function seedPrefixForType(type: Form['type']) {
  switch (type) {
    case 'ege21_punctuation_analysis':
      return 'ege21';
    case 'ege20_complex_sentence_punctuation':
      return 'ege20';
    case 'ege_multi_select':
      return 'ege-ms';
    case 'fill_blank':
      return 'fill';
    case 'word_bank_cloze':
      return 'wbc';
    case 'word_search':
      return 'ws';
    case 'dictation':
      return 'dict';
    case 'orthography_repair':
      return 'or';
    case 'punctuation_insert':
      return 'punc';
    case 'punctuation_constructor':
      return 'pc';
    default:
      return 'mc';
  }
}

export function convertFormForTypeChange(form: Form, nextType: Form['type']): Form {
  if (form.type === nextType) return form;

  if (form.type === 'ege_multi_select' && nextType === 'fill_blank') {
    const signature = serializeMultiAnswerForFillBlank(form.multiCorrectOptionIndexes);
    const fillBefore =
      form.fillBefore.trim() || buildFillBlankQuestionText(form.prompt, form.options);
    return {
      ...form,
      type: nextType,
      fillBefore,
      fillAfter: form.fillAfter,
      fillAccepted: form.fillAccepted.trim() || signature,
    };
  }

  if (form.type === 'fill_blank' && nextType === 'ege_multi_select') {
    const sourceText = form.fillBefore.trim() || form.prompt.trim();
    const parsedPrompt = extractPromptFromQuestionText(sourceText);
    const parsedOptions = extractOptionsFromQuestionText(sourceText);
    const multiCorrectOptionIndexes =
      form.multiCorrectOptionIndexes.trim() || parseFillAcceptedSignature(form.fillAccepted);
    return {
      ...form,
      type: nextType,
      prompt: parsedPrompt || form.prompt,
      options: parsedOptions.length >= 2 ? parsedOptions : form.options,
      multiCorrectOptionIndexes,
    };
  }

  return {
    ...form,
    type: nextType,
  };
}

export function buildTypeChangeMessage(previousForm: Form, nextForm: Form) {
  if (previousForm.type === nextForm.type) return '';

  if (previousForm.type === 'ege_multi_select' && nextForm.type === 'fill_blank') {
    return describeAnswerTransfer(
      previousForm.type,
      nextForm.type,
      previousForm.multiCorrectOptionIndexes,
      nextForm.fillAccepted,
    );
  }

  if (previousForm.type === 'fill_blank' && nextForm.type === 'ege_multi_select') {
    return describeAnswerTransfer(
      previousForm.type,
      nextForm.type,
      previousForm.fillAccepted,
      nextForm.multiCorrectOptionIndexes,
    );
  }

  return '';
}
