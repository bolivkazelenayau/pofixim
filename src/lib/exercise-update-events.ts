'use client';

const EXERCISE_UPDATE_CHANNEL = 'exercise-updates';
const EXERCISE_UPDATED_EVENT = 'exercise-updated';

type ExerciseUpdatedMessage = {
  type: typeof EXERCISE_UPDATED_EVENT;
  exerciseId: number;
};

function isExerciseUpdatedMessage(value: unknown): value is ExerciseUpdatedMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ExerciseUpdatedMessage>;
  return message.type === EXERCISE_UPDATED_EVENT && typeof message.exerciseId === 'number';
}

export function publishExerciseUpdated(exerciseId: number) {
  if (typeof window === 'undefined') return;

  const message: ExerciseUpdatedMessage = {
    type: EXERCISE_UPDATED_EVENT,
    exerciseId,
  };

  window.dispatchEvent(new CustomEvent(EXERCISE_UPDATED_EVENT, { detail: message }));

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(EXERCISE_UPDATE_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
}

export function subscribeToExerciseUpdates(onExerciseUpdated: (exerciseId: number) => void) {
  if (typeof window === 'undefined') return () => {};

  const handleWindowEvent = (event: Event) => {
    if (event instanceof CustomEvent && isExerciseUpdatedMessage(event.detail)) {
      onExerciseUpdated(event.detail.exerciseId);
    }
  };

  window.addEventListener(EXERCISE_UPDATED_EVENT, handleWindowEvent);

  let channel: BroadcastChannel | null = null;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(EXERCISE_UPDATE_CHANNEL);
    channel.onmessage = (event) => {
      if (isExerciseUpdatedMessage(event.data)) {
        onExerciseUpdated(event.data.exerciseId);
      }
    };
  }

  return () => {
    window.removeEventListener(EXERCISE_UPDATED_EVENT, handleWindowEvent);
    channel?.close();
  };
}
