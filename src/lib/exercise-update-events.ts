'use client';

import {
  EXERCISE_UPDATED_EVENT,
  type ExerciseUpdatedEvent,
  exerciseUpdatedEventSchema,
} from './exercise-update-event-schema';

const LOCAL_EXERCISE_UPDATE_CHANNEL = 'exercise-updates';

type ExerciseUpdatedMessage = {
  type: typeof EXERCISE_UPDATED_EVENT;
  exerciseId: number;
  updatedAt?: string;
};

type ExerciseUpdateSubscriber = (event: ExerciseUpdatedEvent) => void;

type BrowserExerciseUpdateHub = {
  subscribers: Set<ExerciseUpdateSubscriber>;
  eventSource: EventSource | null;
  channel: BroadcastChannel | null;
  windowHandler: ((event: Event) => void) | null;
};

const hub: BrowserExerciseUpdateHub = {
  subscribers: new Set(),
  eventSource: null,
  channel: null,
  windowHandler: null,
};

function isExerciseUpdatedMessage(value: unknown): value is ExerciseUpdatedMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ExerciseUpdatedMessage>;
  return message.type === EXERCISE_UPDATED_EVENT && typeof message.exerciseId === 'number';
}

export function publishExerciseUpdated(exerciseId: number, updatedAt?: string | null) {
  if (typeof window === 'undefined') return;

  const message: ExerciseUpdatedMessage = {
    type: EXERCISE_UPDATED_EVENT,
    exerciseId,
    ...(updatedAt ? { updatedAt } : {}),
  };

  window.dispatchEvent(new CustomEvent(EXERCISE_UPDATED_EVENT, { detail: message }));

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(LOCAL_EXERCISE_UPDATE_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
}

function emitToSubscribers(event: ExerciseUpdatedEvent) {
  for (const subscriber of hub.subscribers) {
    subscriber(event);
  }
}

function safeParseSseEvent(data: string) {
  try {
    return exerciseUpdatedEventSchema.safeParse(JSON.parse(data));
  } catch {
    return { success: false as const };
  }
}

function startBrowserHub() {
  if (typeof window === 'undefined') return () => {};

  const emit = (message: ExerciseUpdatedMessage) => {
    emitToSubscribers({
      exerciseId: message.exerciseId,
      updatedAt: message.updatedAt ?? new Date().toISOString(),
    });
  };

  if (!hub.windowHandler) {
    hub.windowHandler = (event: Event) => {
      if (event instanceof CustomEvent && isExerciseUpdatedMessage(event.detail)) {
        emit(event.detail);
      }
    };
    window.addEventListener(EXERCISE_UPDATED_EVENT, hub.windowHandler);
  }

  if (!hub.channel && 'BroadcastChannel' in window) {
    hub.channel = new BroadcastChannel(LOCAL_EXERCISE_UPDATE_CHANNEL);
    hub.channel.onmessage = (event) => {
      if (isExerciseUpdatedMessage(event.data)) {
        emit(event.data);
      }
    };
  }

  if (!hub.eventSource) {
    hub.eventSource = new EventSource('/api/exercise-events');
    hub.eventSource.addEventListener(EXERCISE_UPDATED_EVENT, (event) => {
      const parsed = safeParseSseEvent(event.data);
      if (parsed.success) {
        emitToSubscribers(parsed.data);
      }
    });
  }
}

function stopBrowserHubIfIdle() {
  if (hub.subscribers.size > 0) return;

  if (hub.windowHandler) {
    window.removeEventListener(EXERCISE_UPDATED_EVENT, hub.windowHandler);
    hub.windowHandler = null;
  }
  hub.channel?.close();
  hub.channel = null;
  hub.eventSource?.close();
  hub.eventSource = null;
}

export function subscribeToExerciseUpdates(onExerciseUpdated: ExerciseUpdateSubscriber) {
  if (typeof window === 'undefined') return () => {};

  hub.subscribers.add(onExerciseUpdated);
  startBrowserHub();

  return () => {
    hub.subscribers.delete(onExerciseUpdated);
    stopBrowserHubIfIdle();
  };
}

export function handleExerciseUpdatedSseMessage(
  data: string,
  onExerciseUpdated: ExerciseUpdateSubscriber,
) {
  const parsed = safeParseSseEvent(data);
  if (parsed.success) {
    onExerciseUpdated(parsed.data);
  }
}
