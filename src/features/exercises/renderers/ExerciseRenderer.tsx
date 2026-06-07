'use client';

import type { Exercise, SubmittedAnswer } from '../schemas';
import MultipleChoiceCard from './MultipleChoiceCard';
import FillBlankCard from './FillBlankCard';
import PunctuationInsertCard from './PunctuationInsertCard';
import PunctuationConstructorCard from './PunctuationConstructorCard';
import Ege21PunctuationAnalysisCard from './Ege21PunctuationAnalysisCard';
import Ege20ComplexSentenceCard from './Ege20ComplexSentenceCard';
import EgeMultiSelectCard from './EgeMultiSelectCard';
import OrderFragmentsCard from './OrderFragmentsCard';
import WordBankClozeCard from './WordBankClozeCard';
import WordSearchCard from './WordSearchCard';

type ExerciseRendererProps = {
  exercise: Exercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
  previewMode?: boolean;
};

export default function ExerciseRenderer({
  exercise,
  disabled,
  onSubmit,
  previewMode,
}: ExerciseRendererProps) {
  let content: React.ReactNode;

  switch (exercise.type) {
    case 'multiple_choice':
      content = (
        <MultipleChoiceCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'fill_blank':
      content = (
        <FillBlankCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'word_bank_cloze':
      content = (
        <WordBankClozeCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'order_fragments':
      content = (
        <OrderFragmentsCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'word_search':
      content = (
        <WordSearchCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'ege_multi_select':
      content = (
        <EgeMultiSelectCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'punctuation_insert':
      content = (
        <PunctuationInsertCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'punctuation_constructor':
      content = (
        <PunctuationConstructorCard
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
          previewMode={previewMode}
        />
      );
      break;
    case 'ege21_punctuation_analysis':
      content = (
        <Ege21PunctuationAnalysisCard
          key={exercise.id ?? `e21-${exercise.seedKey ?? 'unknown'}`}
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'ege20_complex_sentence_punctuation':
      content = (
        <Ege20ComplexSentenceCard
          key={exercise.id ?? `e20-${exercise.seedKey ?? 'unknown'}`}
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    default:
      content = null;
  }

  return (
    <div>
      {content}
      <p className="-mt-1 mb-2 text-[11px] text-foreground/60">
        seed: <span className="font-mono select-all">{exercise.seedKey ?? `id:${exercise.id ?? 'n/a'}`}</span>
      </p>
    </div>
  );
}
