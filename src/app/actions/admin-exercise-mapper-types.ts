import type { exercises } from '@/db/schema';

export type ExerciseRow = typeof exercises.$inferSelect;

export type MapperRecord = Record<string, unknown>;

export type ExerciseMapperArgs = {
  row: ExerciseRow;
  base: MapperRecord;
  payload: MapperRecord;
  answer: MapperRecord;
};
