export type ExerciseListSortBy = 'id' | 'updatedAt' | 'type' | 'status';

export type ListExercisesParams = {
  limit?: number;
  offset?: number;
  cursorId?: number;
  cursorUpdatedAt?: string;
  query?: string;
  type?: string;
  qualityStatus?: string;
  examType?: string;
  sortBy?: ExerciseListSortBy;
  sortDir?: 'asc' | 'desc';
  includeTotal?: boolean;
};

export type ExerciseListItem = {
  id: number;
  type: string;
  skillTags: string[];
  seedKey: string | null;
  prompt: string;
  explanation: string;
  qualityStatus: string;
  updatedAt: string;
  updatedAtCursor: string;
  isActive: boolean;
};
