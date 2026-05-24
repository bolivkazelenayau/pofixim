import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import AdminForm from '@/components/AdminForm';
import ThemeToggle from '@/components/ThemeToggle';
import { getExerciseByIdAction } from '@/app/actions/admin';
import { db } from '@/db';
import { exercises } from '@/db/schema';

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const getAdminInitialListCached = unstable_cache(
  async () =>
    db
      .select({
        id: exercises.id,
        type: exercises.type,
        skillTags: exercises.skillTags,
        seedKey: exercises.seedKey,
        prompt: exercises.prompt,
        explanation: exercises.explanation,
        qualityStatus: exercises.qualityStatus,
        updatedAt: exercises.updatedAt,
        isActive: exercises.isActive,
      })
      .from(exercises)
      .orderBy(desc(exercises.id))
      .limit(150),
  ['admin-initial-list-v1'],
  {
    revalidate: 10,
    tags: ['admin:list'],
  },
);

const getAdminTotalCountCached = unstable_cache(
  async () => {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(exercises);
    return Number(rows[0]?.count ?? 0);
  },
  ['admin-total-count-v1'],
  {
    revalidate: 30,
    tags: ['admin:list'],
  },
);

async function fetchAdminInitialListDirect() {
  return db
    .select({
      id: exercises.id,
      type: exercises.type,
      skillTags: exercises.skillTags,
      seedKey: exercises.seedKey,
      prompt: exercises.prompt,
      explanation: exercises.explanation,
      qualityStatus: exercises.qualityStatus,
      updatedAt: exercises.updatedAt,
      isActive: exercises.isActive,
    })
    .from(exercises)
    .orderBy(desc(exercises.id))
    .limit(150);
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolved = searchParams ? await searchParams : {};
  const rawId = (Array.isArray(resolved.id) ? resolved.id[0] : resolved.id)
    ?? (Array.isArray(resolved.exerciseId) ? resolved.exerciseId[0] : resolved.exerciseId);
  const selectedId = Number(rawId ?? NaN);
  const initialSelectedId = Number.isInteger(selectedId) && selectedId > 0 ? selectedId : null;

  let rows: Array<{
    id: number;
    type: string;
    skillTags: string[];
    seedKey: string | null;
    prompt: string;
    explanation: string;
    qualityStatus: string;
    updatedAt: Date | string;
    isActive: boolean;
  }> = [];
  let totalItems = 0;
  let initialSelectedExercise: Record<string, unknown> | null = null;

  try {
    const [rowsResult, totalCount, selectedResult] = await Promise.all([
      getAdminInitialListCached(),
      getAdminTotalCountCached(),
      initialSelectedId ? getExerciseByIdAction(initialSelectedId) : Promise.resolve(null),
    ]);

    rows = rowsResult.length > 0 ? rowsResult : await fetchAdminInitialListDirect();
    totalItems = totalCount > 0 ? totalCount : rows.length;
    initialSelectedExercise = selectedResult?.item ?? null;
  } catch (error) {
    console.error('AdminPage data load failed:', error);
  }

  const initialItems = rows.map((row) => ({
    id: row.id,
    type: row.type,
    skillTags: row.skillTags,
    seedKey: row.seedKey,
    prompt: row.prompt,
    explanation: row.explanation,
    qualityStatus: row.qualityStatus,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
    isActive: row.isActive,
  }));

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto mb-5 flex w-full max-w-[1400px] items-center justify-between rounded-2xl border border-stroke bg-surface-strong px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Панель администратора</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Конструктор заданий и проверка по требованиям ФИПИ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/"
            className="rounded-lg border border-stroke bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:bg-stroke"
          >
            Назад к боту
          </Link>
        </div>
      </div>

      <AdminForm
        initialItems={initialItems}
        initialTotalItems={totalItems}
        initialSelectedId={initialSelectedId}
        initialSelectedExercise={initialSelectedExercise}
      />
    </div>
  );
}



