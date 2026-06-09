import type { ExerciseEditorInput } from './admin-types';

export type AdminExercisePayloadBase = {
  type: ExerciseEditorInput['type'];
  seedKey: string | null;
  category: ExerciseEditorInput['category'];
  difficulty: ExerciseEditorInput['difficulty'];
  skillTags: string[];
  prompt: string;
  explanation: string;
  sourceAlignment?: { reference: string };
  typicalMistake?: string;
  algorithmSteps?: Array<{ id: string; title: string; required: boolean }>;
  qualityStatus: ExerciseEditorInput['qualityStatus'];
  isActive: boolean;
};
