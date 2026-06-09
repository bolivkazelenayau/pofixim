'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { PreviewCheckResult, Form } from '@/components/admin-form/types';
import { buildPreviewExercise } from '@/components/admin-form/previewModel';
import { splitFeedbackSections } from '@/components/admin-form/feedback';
import { buildDictationFeedbackText } from '@/features/exercises/dictationFeedback';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';

function answerFeedbackPrefix(isCorrect: boolean) {
  return isCorrect ? 'Верно. ' : 'Почти, но есть ловушка. ';
}

function buildStepFeedbackText(
  result: ReturnType<typeof checkExerciseAnswer>,
  exerciseType?: Exercise['type'],
) {
  if (
    exerciseType === 'ege_multi_select' ||
    exerciseType === 'punctuation_constructor' ||
    exerciseType === 'orthography_repair'
  ) {
    return '';
  }
  if (!result || result.stepFeedback.length === 0) {
    return '';
  }
  const lines = result.stepFeedback.map((step, index) => `${index + 1}. ${step.message}`);
  return `\n\nРазбор по шагам:\n${lines.join('\n')}\n\nДальше: ${result.nextRecommendation.reason}`;
}

export function useExercisePreview(form: Form) {
  const [previewCheckResult, setPreviewCheckResult] = useState<PreviewCheckResult | null>(null);
  const [previewDictationText, setPreviewDictationText] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    setPreviewCheckResult(null);
    setPreviewDictationText('');
  }, [form]);

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
      setPreviewCheckResult({
        isCorrect: result.isCorrect,
        text: buildDictationFeedbackText(result.normalizedAnswer),
      });
      return;
    }
    const previewFeedback =
      preview.exercise.type === 'ege_multi_select'
        ? preview.exercise.payload.feedback
        : undefined;
    const computedCorrectAnswer = result.feedback.correctAnswer?.trim();
    const fallbackCorrectAnswer = previewFeedback?.correctAnswer.join('\n\n');
    const usesInlineFeedback =
      preview.exercise.type === 'punctuation_constructor' ||
      preview.exercise.type === 'orthography_repair';
    const prefix =
      usesInlineFeedback && !result.isCorrect
        ? ''
        : answerFeedbackPrefix(result.isCorrect);
    const prefixText = prefix ? `${prefix}\n\n` : '';
    setPreviewCheckResult({
      isCorrect: result.isCorrect,
      text: `${prefixText}${result.feedback.explanation}${buildStepFeedbackText(
        result,
        preview.exercise.type,
      )}`,
      correctAnswer: computedCorrectAnswer || fallbackCorrectAnswer,
      detailedExplanation:
        previewFeedback?.explanation.join('\n') ?? result.feedback.detailedExplanation,
    });
  }

  function handlePreviewDictationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = previewDictationText.trim();
    if (!text) return;
    handlePreviewSubmit({ type: 'dictation', text });
  }

  function handlePreviewDictationTextChange(text: string) {
    setPreviewDictationText(text);
    setPreviewCheckResult(null);
  }

  function resetPreview() {
    setPreviewCheckResult(null);
    setPreviewDictationText('');
  }

  return {
    previewMode,
    setPreviewMode,
    previewCheckResult,
    previewDictationText,
    preview,
    previewFeedbackSections,
    handlePreviewSubmit,
    handlePreviewDictationSubmit,
    handlePreviewDictationTextChange,
    resetPreview,
  };
}
