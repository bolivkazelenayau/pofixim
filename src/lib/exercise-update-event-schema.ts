import { z } from 'zod';

export const EXERCISE_UPDATE_CHANNEL = 'exercise_updates';
export const EXERCISE_UPDATED_EVENT = 'exercise-updated';

export const exerciseUpdatedEventSchema = z.object({
  exerciseId: z.coerce.number().int().positive(),
  updatedAt: z.string().min(1),
});

export type ExerciseUpdatedEvent = z.infer<typeof exerciseUpdatedEventSchema>;
