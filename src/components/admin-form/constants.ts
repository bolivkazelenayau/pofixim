import type { ExerciseCategory } from '@/features/exercises/types';

export const categories: ExerciseCategory[] = ['orthography', 'punctuation', 'mixed'];

export const qualityStatuses = ['draft', 'review', 'approved', 'archived'] as const;

export const inputClass =
  'w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
