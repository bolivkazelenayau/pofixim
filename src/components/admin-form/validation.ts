import type { Form } from './types';

export type AdminFieldErrors = Partial<Record<keyof Form, string>>;

export type AdminFormValidation = {
  fieldErrors: AdminFieldErrors;
  summary: string[];
};

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function csv(value: unknown) {
  return text(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function lines(value: unknown) {
  return text(value)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function pipeItems(value: unknown) {
  return text(value)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function setError(errors: AdminFieldErrors, field: keyof Form, message: string) {
  if (!errors[field]) {
    errors[field] = message;
  }
}

export function validateAdminFormValues(form: Form): AdminFormValidation {
  const fieldErrors: AdminFieldErrors = {};

  if (!text(form.seedKey).trim()) {
    setError(fieldErrors, 'seedKey', 'Seed key is required.');
  }
  if (!text(form.prompt).trim()) {
    setError(fieldErrors, 'prompt', 'Prompt is required.');
  }
  if (!text(form.explanation).trim()) {
    setError(fieldErrors, 'explanation', 'Explanation is required.');
  }
  if (csv(form.skillTags).length === 0) {
    setError(fieldErrors, 'skillTags', 'Add at least one skill tag.');
  }

  if (form.qualityStatus === 'approved') {
    if (!text(form.sourceAlignment).trim()) {
      setError(fieldErrors, 'sourceAlignment', 'Source alignment is required for approved exercises.');
    }
    if (!text(form.typicalMistake).trim()) {
      setError(fieldErrors, 'typicalMistake', 'Typical mistake is required for approved exercises.');
    }
    if (!text(form.algorithmSteps).trim()) {
      setError(fieldErrors, 'algorithmSteps', 'Algorithm steps are required for approved exercises.');
    }
  }

  if (form.type === 'multiple_choice') {
    const formOptions = list(form.options);
    const options = formOptions.map((option) => text(option).trim()).filter(Boolean);
    if (options.length < 2) {
      setError(fieldErrors, 'options', 'Add at least two answer options.');
    }
    if (
      !Number.isInteger(form.correctOptionIndex) ||
      form.correctOptionIndex < 0 ||
      form.correctOptionIndex >= formOptions.length
    ) {
      setError(fieldErrors, 'correctOptionIndex', 'Choose a correct option that exists.');
    }
  }

  if (form.type === 'ege_multi_select') {
    const options = list(form.options).map((option) => text(option).trim()).filter(Boolean);
    const targets = csv(form.multiCorrectOptionIndexes)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (options.length < 2) {
      setError(fieldErrors, 'options', 'Add at least two answer options.');
    }
    if (targets.length === 0) {
      setError(fieldErrors, 'multiCorrectOptionIndexes', 'Add correct option numbers.');
    }
  }

  if (form.type === 'fill_blank' && csv(form.fillAccepted).length === 0) {
    setError(fieldErrors, 'fillAccepted', 'Add at least one accepted answer.');
  }

  if (form.type === 'word_bank_cloze') {
    if (!text(form.wordBankTextWithSlots).trim()) {
      setError(fieldErrors, 'wordBankTextWithSlots', 'Text with slots is required.');
    }
    if (lines(form.wordBankWords).length === 0) {
      setError(fieldErrors, 'wordBankWords', 'Add word bank items.');
    }
    if (lines(form.wordBankCorrectBySlot).length === 0) {
      setError(fieldErrors, 'wordBankCorrectBySlot', 'Add correct values by slot.');
    }
  }

  if (form.type === 'word_search') {
    if (lines(form.wordSearchGridRows).length < 2) {
      setError(fieldErrors, 'wordSearchGridRows', 'Add at least two grid rows.');
    }
    if (lines(form.wordSearchWords).length === 0) {
      setError(fieldErrors, 'wordSearchWords', 'Add words to find.');
    }
  }

  if (form.type === 'dictation') {
    if (!text(form.dictationAudioSrc).trim()) {
      setError(fieldErrors, 'dictationAudioSrc', 'Audio source is required.');
    }
    if (!text(form.dictationText).trim()) {
      setError(fieldErrors, 'dictationText', 'Reference dictation text is required.');
    }
  }

  if (form.type === 'orthography_repair') {
    if (!text(form.orthographyRepairText).trim()) {
      setError(fieldErrors, 'orthographyRepairText', 'Repair text is required.');
    }
    if (lines(form.orthographyRepairTargets).length === 0) {
      setError(fieldErrors, 'orthographyRepairTargets', 'Add repair targets.');
    }
    if (lines(form.orthographyRepairRepairs).length === 0) {
      setError(fieldErrors, 'orthographyRepairRepairs', 'Add repair answers.');
    }
  }

  if (form.type === 'order_fragments') {
    if (lines(form.orderFragments).length < 2) {
      setError(fieldErrors, 'orderFragments', 'Add at least two fragments.');
    }
    if (csv(form.orderCorrectOrder).length < 2) {
      setError(fieldErrors, 'orderCorrectOrder', 'Add the correct fragment order.');
    }
  }

  if (form.type === 'punctuation_insert') {
    if (pipeItems(form.punctuationTokens).length < 2) {
      setError(fieldErrors, 'punctuationTokens', 'Add at least two punctuation tokens.');
    }
  }

  if (form.type === 'punctuation_constructor') {
    if (pipeItems(form.punctuationConstructorTokens).length < 2) {
      setError(fieldErrors, 'punctuationConstructorTokens', 'Add at least two constructor tokens.');
    }
    if (csv(form.punctuationConstructorMarkBank).length === 0) {
      setError(fieldErrors, 'punctuationConstructorMarkBank', 'Add mark bank entries.');
    }
  }

  if (form.type === 'ege20_complex_sentence_punctuation') {
    if (!text(form.ege20TextWithSlots).trim()) {
      setError(fieldErrors, 'ege20TextWithSlots', 'Text with slots is required.');
    }
    if (csv(form.ege20Slots).length === 0) {
      setError(fieldErrors, 'ege20Slots', 'Add slot numbers.');
    }
    if (csv(form.ege20TargetSet).length === 0) {
      setError(fieldErrors, 'ege20TargetSet', 'Add target set numbers.');
    }
  }

  if (form.type === 'ege21_punctuation_analysis') {
    if (lines(form.ege21Sentences).length < 2) {
      setError(fieldErrors, 'ege21Sentences', 'Add at least two sentences.');
    }
    if (csv(form.ege21TargetSet).length === 0) {
      setError(fieldErrors, 'ege21TargetSet', 'Add target sentence numbers.');
    }
  }

  return {
    fieldErrors,
    summary: Object.values(fieldErrors),
  };
}
