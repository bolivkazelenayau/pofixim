import { listExercisesAction } from '@/app/actions/admin';
import { isAdminAuthenticated } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

function optionalInteger(params: URLSearchParams, name: string) {
  const raw = params.get(name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

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
    sortBy: params.get('sortBy') === 'updatedAt' ? 'updatedAt' : 'id',
    sortDir: params.get('sortDir') === 'asc' ? 'asc' : 'desc',
    includeTotal: params.get('includeTotal') === 'true',
  });

  return Response.json(result, { status: result.success ? 200 : 500 });
}
