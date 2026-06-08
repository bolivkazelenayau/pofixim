import type {
  ExerciseDetailResponse,
  ExerciseListRequest,
  ExerciseListResponse,
} from './types';

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
  const result = (await response.json()) as ExerciseListResponse;
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
  const result = (await response.json()) as ExerciseDetailResponse;
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
