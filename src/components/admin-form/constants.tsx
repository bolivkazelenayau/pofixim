import type { ExerciseCategory } from '@/features/exercises/types';
import type { ReactNode } from 'react';

export const categories: ExerciseCategory[] = ['orthography', 'punctuation', 'mixed'];

export const qualityStatuses = ['draft', 'review', 'approved', 'archived'] as const;

export const inputClass =
  'w-full rounded-lg border border-stroke bg-surface-strong px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export function Field({
  id,
  label,
  children,
  className = '',
}: {
  id?: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const controlId = id ? `${id}-control` : undefined;
  return (
    <div id={id} className={`block ${className}`}>
      <label htmlFor={controlId} className="mb-1 block text-sm font-medium text-foreground/80 ">{label}</label>
      {children}
    </div>
  );
}
