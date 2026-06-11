import { listExercisesAction } from '@/app/actions/admin';
import type { ExerciseListSortBy } from '@/app/actions/admin-list-types';

export const dynamic = 'force-dynamic';

function optionalInteger(params: URLSearchParams, name: string) {
  const raw = params.get(name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await listExercisesAction({
    limit: optionalInteger(params, 'limit'),
    offset: optionalInteger(params, 'offset'),
    cursorId: optionalInteger(params, 'cursorId'),
    cursorUpdatedAt: params.get('cursorUpdatedAt') ?? undefined,
    query: params.get('query') ?? undefined,
    type: params.get('type') ?? undefined,
    qualityStatus: params.get('qualityStatus') ?? undefined,
    examType: params.get('examType') ?? undefined,
    sortBy: parseSortBy(params.get('sortBy')),
    sortDir: params.get('sortDir') === 'asc' ? 'asc' : 'desc',
    includeTotal: params.get('includeTotal') === 'true',
  });

  const error = 'error' in result ? result.error : undefined;
  const status = result.success ? 200 : error === 'Unauthorized' ? 401 : 500;
  return Response.json(result, { status });
}

function parseSortBy(value: string | null): ExerciseListSortBy {
  if (value === 'updatedAt' || value === 'type' || value === 'status') return value;
  return 'id';
}
