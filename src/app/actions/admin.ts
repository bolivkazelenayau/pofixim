'use server';

import type { ListExercisesParams } from './admin-list-types';
import type { ExerciseEditorInput } from './admin-types';
import {
  createExercise,
  updateExercise,
} from './admin-exercise-crud';
import { deleteExercise } from './admin-exercise-delete';
import { getExerciseById } from './admin-exercise-get';
import { getExerciseTypeOptions, listExercises } from './admin-exercise-list';
import { batchUpdateExercisesMeta } from './admin-exercise-meta';
import {
  deleteExerciseRevision,
  getExerciseRevisionDetail,
  listExerciseRevisions,
  restoreExerciseRevision,
} from './admin-exercise-revisions';

export async function createExerciseAction(input: ExerciseEditorInput) {
  return createExercise(input);
}

export async function updateExerciseAction(input: ExerciseEditorInput & { id: number }) {
  return updateExercise(input);
}

export async function deleteExerciseAction(id: number) {
  return deleteExercise(id);
}

export async function batchUpdateExercisesMetaAction(input: {
  ids: number[];
  qualityStatus?: ExerciseEditorInput['qualityStatus'];
  isActive?: boolean;
}) {
  return batchUpdateExercisesMeta(input);
}

export async function getExerciseTypeOptionsAction() {
  return getExerciseTypeOptions();
}

export async function listExercisesAction(params: ListExercisesParams = {}) {
  return listExercises(params);
}

export async function getExerciseByIdAction(id: number) {
  return getExerciseById(id);
}

export async function listExerciseRevisionsAction(id: number, limit?: number) {
  return listExerciseRevisions(id, limit);
}

export async function getExerciseRevisionDetailAction(id: number, revisionId: number) {
  return getExerciseRevisionDetail(id, revisionId);
}

export async function restoreExerciseRevisionAction(id: number, revisionId: number) {
  return restoreExerciseRevision(id, revisionId);
}

export async function deleteExerciseRevisionAction(id: number, revisionId: number) {
  return deleteExerciseRevision(id, revisionId);
}
