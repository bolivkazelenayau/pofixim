import type {
  ExerciseDetailResponse,
  ExerciseListRequest,
  ExerciseListResponse,
} from './types';

async function readJsonResponse<T extends { success: boolean; error?: string }>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  const text = (await response.text()).trim();
  const error = text
    ? `${fallbackError} HTTP ${response.status}: ${text.slice(0, 160)}`
    : `${fallbackError} HTTP ${response.status}`;

  return {
    success: false,
    error,
  } as T;
}

export async function fetchExerciseList(
  input: ExerciseListRequest,
): Promise<ExerciseListResponse> {
  const params = new URLSearchParams({
    limit: String(input.limit),
    offset: String(input.offset),
    query: input.query,
    type: input.type,
    qualityStatus: input.qualityStatus,
    examType: input.examType,
    sortBy: input.sortBy,
    sortDir: input.sortDir,
    includeTotal: String(input.includeTotal),
  });
  if (input.cursorId) params.set('cursorId', String(input.cursorId));
  if (input.cursorUpdatedAt) params.set('cursorUpdatedAt', input.cursorUpdatedAt);

  const response = await fetch(`/api/admin/exercises?${params.toString()}`, {
    cache: 'no-store',
    signal: input.signal,
  });
  const result = await readJsonResponse<ExerciseListResponse>(
    response,
    'Ошибка загрузки списка.',
  );
  if (response.status === 401) {
    return {
      ...result,
      error: 'Сессия администратора истекла. Обновите страницу и войдите снова.',
    };
  }
  return result;
}

export async function fetchExerciseById(id: number): Promise<ExerciseDetailResponse> {
  const response = await fetch(`/api/admin/exercises/${id}`, { cache: 'no-store' });
  const result = await readJsonResponse<ExerciseDetailResponse>(
    response,
    'Ошибка загрузки задания.',
  );
  if (response.status === 401) {
    return {
      ...result,
      error: 'Сессия администратора истекла. Обновите страницу и войдите снова.',
    };
  }
  return result;
}

export function getExerciseIdFromHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const id = Number(params.get('exercise') ?? NaN);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function getExerciseIdFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const id = Number(params.get('exercise') ?? params.get('id') ?? params.get('exerciseId') ?? NaN);
  return Number.isInteger(id) && id > 0 ? id : null;
}
