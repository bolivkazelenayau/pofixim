import 'server-only';

import postgres from 'postgres';
import {
  EXERCISE_UPDATE_CHANNEL,
  type ExerciseUpdatedEvent,
  exerciseUpdatedEventSchema,
} from '@/lib/exercise-update-event-schema';

type Subscriber = (event: ExerciseUpdatedEvent) => void;

type ListenerState = {
  sql: ReturnType<typeof postgres>;
  subscribers: Set<Subscriber>;
  startPromise: Promise<void> | null;
  unlisten: (() => Promise<void>) | null;
};

declare global {
  var __exerciseUpdateListener: ListenerState | undefined;
}

function createState(): ListenerState {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for exercise update listener.');
  }

  return {
    sql: postgres(connectionString, {
      max: 1,
      idle_timeout: 0,
      connect_timeout: 10,
    }),
    subscribers: new Set(),
    startPromise: null,
    unlisten: null,
  };
}

function getState() {
  globalThis.__exerciseUpdateListener ??= createState();
  return globalThis.__exerciseUpdateListener;
}

function parseNotificationPayload(payload: string) {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(payload);
  } catch (error) {
    console.warn('Invalid exercise update notification JSON payload', { error });
    return null;
  }

  const parsed = exerciseUpdatedEventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.warn('Invalid exercise update notification payload', {
      issues: parsed.error.issues,
    });
    return null;
  }

  return parsed.data;
}

async function startExerciseUpdateListener() {
  const state = getState();
  if (state.startPromise) return state.startPromise;

  state.startPromise = state.sql
    .listen(
      EXERCISE_UPDATE_CHANNEL,
      (payload) => {
        const event = parseNotificationPayload(payload);
        if (!event) return;

        for (const subscriber of state.subscribers) {
          subscriber(event);
        }
      },
      () => {
        console.info('PostgreSQL exercise update listener started');
      },
    )
    .then((meta) => {
      state.unlisten = meta.unlisten;
    })
    .catch((error) => {
      state.startPromise = null;
      console.error('Failed to start PostgreSQL exercise update listener', error);
      throw error;
    });

  return state.startPromise;
}

export async function subscribeToExerciseUpdateNotifications(subscriber: Subscriber) {
  const state = getState();
  state.subscribers.add(subscriber);
  await startExerciseUpdateListener();

  return () => {
    state.subscribers.delete(subscriber);
  };
}

export const __exerciseUpdateListenerTest = {
  parseNotificationPayload,
};
