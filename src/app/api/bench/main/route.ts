import {
  getBlitzPoolAction,
  getEge13QuickPoolAction,
  getEge15QuickPoolAction,
  getNextExerciseAction,
} from '@/app/actions/exercises';
import { assertAdminAuthorized } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

type BenchCase = 'next' | 'next-seen' | 'blitz' | 'ege13' | 'ege15';

function parseBenchCase(value: string | null): BenchCase {
  if (value === 'next-seen' || value === 'blitz' || value === 'ege13' || value === 'ege15') {
    return value;
  }
  return 'next';
}

function parseLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSeenIds(value: string | null) {
  return (value ?? '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 300);
}

export async function GET(request: Request) {
  const startedAt = performance.now();

  try {
    await assertAdminAuthorized();

    const params = new URL(request.url).searchParams;
    const benchCase = parseBenchCase(params.get('case'));
    const limit = parseLimit(params.get('limit'), benchCase === 'ege15' ? 100 : 80);
    const seenExerciseIds = parseSeenIds(params.get('seen'));

    if (benchCase === 'blitz') {
      const result = await getBlitzPoolAction({ limit, seenExerciseIds });
      return Response.json({
        success: result.success,
        case: benchCase,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        cards: result.cards.length,
        error: result.success ? undefined : result.error,
      });
    }

    if (benchCase === 'ege13') {
      const result = await getEge13QuickPoolAction({ limit, seenExerciseIds });
      return Response.json({
        success: result.success,
        case: benchCase,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        cards: result.cards.length,
        error: result.success ? undefined : result.error,
      });
    }

    if (benchCase === 'ege15') {
      const result = await getEge15QuickPoolAction({ limit, seenExerciseIds });
      return Response.json({
        success: result.success,
        case: benchCase,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        cards: result.cards.length,
        error: result.success ? undefined : result.error,
      });
    }

    const result = await getNextExerciseAction({
      sessionId: 'bench-main-session',
      seenExerciseIds: benchCase === 'next-seen' ? seenExerciseIds : [],
    });
    return Response.json({
      success: result.success,
      case: benchCase,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      exerciseId: result.success && 'exercise' in result ? result.exercise?.id ?? null : null,
      exerciseType: result.success && 'exercise' in result ? result.exercise?.type ?? null : null,
      noMoreExercises: result.success && 'noMoreExercises' in result
        ? result.noMoreExercises
        : undefined,
      error: result.success ? undefined : result.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return Response.json(
      {
        success: false,
        error: message,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
      },
      { status: message === 'Unauthorized' ? 401 : 500 },
    );
  }
}
