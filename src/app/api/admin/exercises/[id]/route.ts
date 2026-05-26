import { getExerciseByIdAction } from '@/app/actions/admin';
import { isAdminAuthenticated } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

type ExerciseRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ExerciseRouteContext) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ success: false, error: 'Invalid exercise id' }, { status: 400 });
  }

  const result = await getExerciseByIdAction(id);
  const status = result.success ? 200 : result.error === 'Exercise not found' ? 404 : 500;
  return Response.json(result, { status });
}
