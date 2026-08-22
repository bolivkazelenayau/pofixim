import type { SubmittedAnswer } from '@/features/exercises/schemas';

export type ExerciseSubmissionPayload = {
  sessionId: string;
  exerciseId: number;
  submittedAnswer: SubmittedAnswer;
};

export type PendingExerciseSubmissionStatus =
  | 'in-flight'
  | 'uncertain'
  | 'failed'
  | 'applied';

export type PendingExerciseSubmission = {
  submissionId: string;
  fingerprint: string;
  payload: ExerciseSubmissionPayload;
  status: PendingExerciseSubmissionStatus;
  updatedAt: number;
};

export type SubmissionReservation =
  | {
      kind: 'submit';
      isRetry: boolean;
      submission: PendingExerciseSubmission;
    }
  | {
      kind: 'blocked';
      reason: 'in-flight' | 'uncertain-payload' | 'applied';
      message: string;
    };

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${canonicalize(nestedValue)}`)
    .join(',')}}`;
}

export function submissionFingerprint(payload: ExerciseSubmissionPayload) {
  return canonicalize(payload);
}

export function normalizePendingExerciseSubmissions(
  value: unknown,
): Record<string, PendingExerciseSubmission> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([exerciseMessageId, raw]) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      const candidate = raw as Partial<PendingExerciseSubmission>;
      const payload = candidate.payload;
      if (
        typeof candidate.submissionId !== 'string' ||
        typeof candidate.fingerprint !== 'string' ||
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.sessionId !== 'string' ||
        !Number.isInteger(payload.exerciseId) ||
        !payload.submittedAnswer ||
        typeof payload.submittedAnswer !== 'object' ||
        !['in-flight', 'uncertain', 'failed', 'applied'].includes(String(candidate.status))
      ) {
        return [];
      }

      return [[
        exerciseMessageId,
        {
          submissionId: candidate.submissionId,
          fingerprint: candidate.fingerprint,
          payload: payload as ExerciseSubmissionPayload,
          status: candidate.status === 'in-flight'
            ? 'uncertain'
            : candidate.status as PendingExerciseSubmissionStatus,
          updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
        },
      ]];
    }),
  );
}

export function reserveExerciseSubmission(
  existing: PendingExerciseSubmission | undefined,
  payload: ExerciseSubmissionPayload,
  options: { now?: number; createSubmissionId?: () => string } = {},
): SubmissionReservation {
  const now = options.now ?? Date.now();
  const createSubmissionId = options.createSubmissionId ?? (() => crypto.randomUUID());
  const fingerprint = submissionFingerprint(payload);

  if (existing?.status === 'in-flight') {
    return {
      kind: 'blocked',
      reason: 'in-flight',
      message: 'Этот ответ уже отправляется.',
    };
  }

  if (existing?.status === 'applied') {
    return {
      kind: 'blocked',
      reason: 'applied',
      message: 'Этот ответ уже сохранён.',
    };
  }

  if (existing?.status === 'uncertain') {
    if (existing.fingerprint !== fingerprint) {
      return {
        kind: 'blocked',
        reason: 'uncertain-payload',
        message: 'Предыдущая отправка ещё не подтверждена. Повторите исходный ответ или разрешите его статус.',
      };
    }

    return {
      kind: 'submit',
      isRetry: true,
      submission: {
        ...existing,
        payload: existing.payload,
        status: 'in-flight',
        updatedAt: now,
      },
    };
  }

  return {
    kind: 'submit',
    isRetry: false,
    submission: {
      submissionId: createSubmissionId(),
      fingerprint,
      payload,
      status: 'in-flight',
      updatedAt: now,
    },
  };
}

export function setExerciseSubmissionStatus(
  submission: PendingExerciseSubmission,
  status: PendingExerciseSubmissionStatus,
  now = Date.now(),
): PendingExerciseSubmission {
  return { ...submission, status, updatedAt: now };
}
