import { getExerciseByIdAction } from '@/app/actions/admin';

export const dynamic = 'force-dynamic';

type ExerciseRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ExerciseRouteContext) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ success: false, error: 'Invalid exercise id' }, { status: 400 });
  }

  const result = await getExerciseByIdAction(id);
  const status = result.success
    ? 200
    : result.error === 'Unauthorized'
      ? 401
      : result.error === 'Exercise not found'
        ? 404
        : 500;
  return Response.json(result, { status });
}
