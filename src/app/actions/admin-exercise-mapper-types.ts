import type { exercises } from '@/db/schema';

export type ExerciseRow = Omit<typeof exercises.$inferSelect, 'updatedAt'> & {
  updatedAt: Date | string;
};

export type MapperRecord = Record<string, unknown>;

export type ExerciseMapperArgs = {
  row: ExerciseRow;
  base: MapperRecord;
  payload: MapperRecord;
  answer: MapperRecord;
};
