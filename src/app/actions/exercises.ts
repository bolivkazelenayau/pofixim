'use server';

import * as exerciseActions from './exercises/core';

export async function refreshEge9BlitzCardAction(
  ...args: Parameters<typeof exerciseActions.refreshEge9BlitzCardAction>
) {
  return exerciseActions.refreshEge9BlitzCardAction(...args);
}

export async function refreshEge13QuickCardAction(
  ...args: Parameters<typeof exerciseActions.refreshEge13QuickCardAction>
) {
  return exerciseActions.refreshEge13QuickCardAction(...args);
}

export async function refreshEge15QuickCardAction(
  ...args: Parameters<typeof exerciseActions.refreshEge15QuickCardAction>
) {
  return exerciseActions.refreshEge15QuickCardAction(...args);
}

export async function getNextExerciseAction(
  ...args: Parameters<typeof exerciseActions.getNextExerciseAction>
) {
  return exerciseActions.getNextExerciseAction(...args);
}

export async function getExerciseBySeedKeyAction(
  ...args: Parameters<typeof exerciseActions.getExerciseBySeedKeyAction>
) {
  return exerciseActions.getExerciseBySeedKeyAction(...args);
}

export async function getExercisesByIdsAction(
  ...args: Parameters<typeof exerciseActions.getExercisesByIdsAction>
) {
  return exerciseActions.getExercisesByIdsAction(...args);
}

export async function getExerciseVersionsByIdsAction(
  ...args: Parameters<typeof exerciseActions.getExerciseVersionsByIdsAction>
) {
  return exerciseActions.getExerciseVersionsByIdsAction(...args);
}

export async function getQuickCardsBySeedAction(
  ...args: Parameters<typeof exerciseActions.getQuickCardsBySeedAction>
) {
  return exerciseActions.getQuickCardsBySeedAction(...args);
}

export async function submitExerciseAnswerAction(
  ...args: Parameters<typeof exerciseActions.submitExerciseAnswerAction>
) {
  return exerciseActions.submitExerciseAnswerAction(...args);
}

export async function getBlitzPoolAction(
  ...args: Parameters<typeof exerciseActions.getBlitzPoolAction>
) {
  return exerciseActions.getBlitzPoolAction(...args);
}

export async function getEge13QuickPoolAction(
  ...args: Parameters<typeof exerciseActions.getEge13QuickPoolAction>
) {
  return exerciseActions.getEge13QuickPoolAction(...args);
}

export async function getEge15QuickPoolAction(
  ...args: Parameters<typeof exerciseActions.getEge15QuickPoolAction>
) {
  return exerciseActions.getEge15QuickPoolAction(...args);
}
