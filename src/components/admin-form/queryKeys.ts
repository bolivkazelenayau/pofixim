import type { ExerciseListRequest } from '@/components/admin-form/types';

export type AdminExerciseListFilters = Pick<
  ExerciseListRequest,
  'query' | 'type' | 'qualityStatus' | 'examType' | 'sortBy' | 'sortDir'
>;

export const adminExerciseKeys = {
  all: ['admin', 'exercises'] as const,
  lists: () => [...adminExerciseKeys.all, 'list'] as const,
  list: (filters: AdminExerciseListFilters) => [...adminExerciseKeys.lists(), filters] as const,
  details: () => [...adminExerciseKeys.all, 'detail'] as const,
  detail: (id: number) => [...adminExerciseKeys.details(), id] as const,
  revisions: (id: number) => [...adminExerciseKeys.detail(id), 'revisions'] as const,
};
