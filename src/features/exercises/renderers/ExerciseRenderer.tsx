'use client';

import { useEffect, useState } from 'react';
import { Bean } from 'lucide-react';
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
import DictationCard from './DictationCard';
import OrthographyRepairCard from './OrthographyRepairCard';
import { copyTextToClipboard } from '@/lib/clipboard';

type ExerciseRendererProps = {
  exercise: Exercise;
  disabled?: boolean;
  onSubmit: (answer: SubmittedAnswer, answerLabel: string) => void;
  previewMode?: boolean;
  highlight?: boolean;
  highlightId?: string;
};

export default function ExerciseRenderer({
  exercise,
  disabled,
  onSubmit,
  previewMode,
  highlight,
  highlightId,
}: ExerciseRendererProps) {
  const seedLabel = exercise.seedKey ?? `id:${exercise.id ?? 'n/a'}`;
  const [copyToast, setCopyToast] = useState<string | null>(null);
  let content: React.ReactNode;

  async function copySeed() {
    const didCopy = await copyTextToClipboard(seedLabel);
    setCopyToast(didCopy ? 'Seed скопирован' : 'Не удалось скопировать');
  }

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

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
    case 'dictation':
      content = (
        <DictationCard
          key={exercise.id ?? `dictation-${exercise.seedKey ?? 'unknown'}`}
          exercise={exercise}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
      break;
    case 'orthography_repair':
      content = (
        <OrthographyRepairCard
          key={exercise.id ?? `orthography-repair-${exercise.seedKey ?? 'unknown'}`}
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
    <div className="relative">
      <div
        data-exercise-message-id={highlightId}
        data-highlighted={highlight ? 'true' : undefined}
        className="exercise-highlight-shell rounded-[28px]"
      >
        {content}
      </div>
      <p className="-mt-1 mb-2 ml-2 flex items-center gap-1.5 text-[11px] text-foreground/60">
        <Bean className="h-3 w-3" aria-hidden="true" />
        <span>seed:</span>
        <button
          type="button"
          onClick={copySeed}
          className="font-mono transition-colors duration-150 ease-out hover:text-primary focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/30"
          title="Скопировать seed key"
        >
          {seedLabel}
        </button>
      </p>
      {copyToast && (
        <div className="pointer-events-none absolute bottom-8 left-0 z-sticky rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background shadow-lg">
          {copyToast}
        </div>
      )}
    </div>
  );
}
