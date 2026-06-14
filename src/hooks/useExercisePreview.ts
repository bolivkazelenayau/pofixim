'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { PreviewCheckResult, Form } from '@/components/admin-form/types';
import { buildPreviewExercise } from '@/components/admin-form/previewModel';
import { splitFeedbackSections } from '@/components/admin-form/feedback';
import { buildDictationFeedbackText } from '@/features/exercises/dictationFeedback';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';

function correctAnswerFeedbackPrefix() {
  return 'Верно. ';
}

export function useExercisePreview(form: Form) {
  const [previewCheckState, setPreviewCheckState] = useState<{
    form: Form;
    result: PreviewCheckResult | null;
  } | null>(null);
  const [previewDictationState, setPreviewDictationState] = useState<{
    form: Form;
    text: string;
  } | null>(null);
  const [previewFillBlankState, setPreviewFillBlankState] = useState<{
    form: Form;
    text: string;
  } | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const previewCheckResult = previewCheckState?.form === form ? previewCheckState.result : null;
  const previewDictationText = previewDictationState?.form === form ? previewDictationState.text : '';
  const previewFillBlankText = previewFillBlankState?.form === form ? previewFillBlankState.text : '';

  const parsedSkillTags = useMemo(
    () => form.skillTags.split(',').map((v) => v.trim()).filter(Boolean),
    [form.skillTags],
  );
  const parsedSteps = useMemo(
    () => form.algorithmSteps.split('\n').map((v) => v.trim()).filter(Boolean),
    [form.algorithmSteps],
  );
  const preview = useMemo(
    () => buildPreviewExercise({ form, parsedSkillTags, parsedSteps }),
    [form, parsedSkillTags, parsedSteps],
  );
  const previewFeedbackSections = useMemo(() => {
    if (!previewCheckResult) return null;
    if (previewCheckResult.correctAnswer && previewCheckResult.detailedExplanation) {
      return {
        lead: '',
        correctAnswer: previewCheckResult.correctAnswer,
        explanation: previewCheckResult.detailedExplanation,
      };
    }
    const previewOptions = form.options.map((v) => v.trim()).filter(Boolean);
    return splitFeedbackSections(previewCheckResult.text, previewOptions);
  }, [previewCheckResult, form.options]);

  function handlePreviewSubmit(answer: SubmittedAnswer) {
    if (!preview.exercise) return;
    const result = checkExerciseAnswer(preview.exercise, answer, { streak: 0 });
    if (preview.exercise.type === 'dictation') {
      setPreviewCheckState({
        form,
        result: {
          isCorrect: result.isCorrect,
          text: buildDictationFeedbackText(result.normalizedAnswer, result.feedback.explanation),
        },
      });
      return;
    }
    const previewFeedback =
      preview.exercise.type === 'ege_multi_select'
        ? preview.exercise.payload.feedback
        : undefined;
    const computedCorrectAnswer = result.feedback.correctAnswer?.trim();
    const fallbackCorrectAnswer = previewFeedback?.correctAnswer.join('\n\n');
    const prefix = result.isCorrect ? correctAnswerFeedbackPrefix() : '';
    const prefixText = prefix ? `${prefix}\n\n` : '';
    setPreviewCheckState({
      form,
      result: {
        isCorrect: result.isCorrect,
        text: `${prefixText}${result.feedback.explanation}`,
        correctAnswer: computedCorrectAnswer || fallbackCorrectAnswer,
        detailedExplanation:
          previewFeedback?.explanation.join('\n') ?? result.feedback.detailedExplanation,
      },
    });
  }

  function handlePreviewDictationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = previewDictationText.trim();
    if (!text) return;
    handlePreviewSubmit({ type: 'dictation', text });
  }

  function handlePreviewDictationTextChange(text: string) {
    setPreviewDictationState({ form, text });
    setPreviewCheckState({ form, result: null });
  }

  function handlePreviewFillBlankSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = previewFillBlankText.trim();
    if (!text) return;
    handlePreviewSubmit({ type: 'fill_blank', value: text });
  }

  function handlePreviewFillBlankTextChange(text: string) {
    setPreviewFillBlankState({ form, text });
    setPreviewCheckState({ form, result: null });
  }

  function resetPreview() {
    setPreviewCheckState({ form, result: null });
    setPreviewDictationState({ form, text: '' });
    setPreviewFillBlankState({ form, text: '' });
  }

  return {
    previewMode,
    setPreviewMode,
    previewCheckResult,
    previewDictationText,
    previewFillBlankText,
    preview,
    previewFeedbackSections,
    handlePreviewSubmit,
    handlePreviewDictationSubmit,
    handlePreviewDictationTextChange,
    handlePreviewFillBlankSubmit,
    handlePreviewFillBlankTextChange,
    resetPreview,
  };
}
