import Link from 'next/link';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { cookies } from 'next/headers';
import AdminFormClient from '@/components/admin-form/AdminFormClient';
import ThemeToggle from '@/components/ThemeToggle';
import QueryProvider from '@/components/query-provider';
import { getExerciseByIdAction, listExercisesAction } from '@/app/actions/admin';
import { logoutAdminAction } from '@/app/admin/login/actions';
import { adminExerciseKeys, type AdminExerciseListFilters } from '@/components/admin-form/queryKeys';
import type { ExerciseListResponse } from '@/components/admin-form/types';
import { requireAdminPageSession } from '@/lib/admin-auth';
import { EXERCISE_TYPES } from '@/features/exercises/types';

const ADMIN_INITIAL_LIST_LIMIT = 15;

type AdminExerciseListPageParam = {
  offset: number;
  cursorId: number | null;
  cursorUpdatedAt: string | null;
};

const ADMIN_FIRST_PAGE_PARAM: AdminExerciseListPageParam = {
  offset: 0,
  cursorId: null,
  cursorUpdatedAt: null,
};

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdminPageSession();

  const resolved = searchParams ? await searchParams : {};
  const rawId = (Array.isArray(resolved.exercise) ? resolved.exercise[0] : resolved.exercise)
    ?? (Array.isArray(resolved.id) ? resolved.id[0] : resolved.id)
    ?? (Array.isArray(resolved.exerciseId) ? resolved.exerciseId[0] : resolved.exerciseId);
  const selectedId = Number(rawId ?? NaN);
  const initialSelectedId = Number.isInteger(selectedId) && selectedId > 0 ? selectedId : null;
  const cookieStore = await cookies();
  const initialListFilters = {
    query: '',
    type: parseAdminTypeFilter(cookieStore.get('admin_list_type_filter')?.value),
    qualityStatus: parseAdminStatusFilter(cookieStore.get('admin_list_status_filter')?.value),
    examType: parseAdminExamTypeFilter(cookieStore.get('admin_list_exam_type_filter')?.value),
    sortBy: parseAdminListSortBy(cookieStore.get('admin_list_sort_by')?.value),
    sortDir: parseAdminListSortDir(cookieStore.get('admin_list_sort_dir')?.value),
  } satisfies AdminExerciseListFilters;
  const queryClient = new QueryClient();
  const [, initialSelectedResult] = await Promise.all([
    queryClient.prefetchInfiniteQuery({
      queryKey: adminExerciseKeys.list(initialListFilters),
      initialPageParam: ADMIN_FIRST_PAGE_PARAM,
      queryFn: () =>
        listExercisesAction({
          ...initialListFilters,
          limit: ADMIN_INITIAL_LIST_LIMIT,
          offset: 0,
          includeTotal: true,
        }),
      getNextPageParam: (lastPage: ExerciseListResponse) =>
        lastPage.success && lastPage.hasMore
          ? {
              offset: lastPage.nextOffset ?? 0,
              cursorId: lastPage.nextCursorId ?? null,
              cursorUpdatedAt: lastPage.nextCursorUpdatedAt ?? null,
            }
          : undefined,
    }),
    initialSelectedId ? getExerciseByIdAction(initialSelectedId) : Promise.resolve(null),
  ]);

  const initialSelectedExercise =
    initialSelectedResult?.success && initialSelectedResult.item
      ? initialSelectedResult.item
      : null;

  return (
    <main className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto mb-5 flex w-full max-w-[1400px] items-center justify-between rounded-[28px] border border-stroke bg-surface-strong px-5 py-4 shadow-sm">
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
            className="inline-flex h-10 items-center rounded-lg border border-stroke bg-surface px-3 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Назад к боту
          </Link>
          <form action={logoutAdminAction}>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg border border-stroke bg-surface px-3 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              Выйти
            </button>
          </form>
        </div>
      </div>

      <QueryProvider devtools={false}>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <AdminFormClient
            initialSelectedId={initialSelectedId}
            initialSelectedExercise={initialSelectedExercise}
            initialTypeFilter={initialListFilters.type}
            initialStatusFilter={initialListFilters.qualityStatus}
            initialExamTypeFilter={initialListFilters.examType}
            initialSortBy={initialListFilters.sortBy}
            initialSortDir={initialListFilters.sortDir}
          />
        </HydrationBoundary>
      </QueryProvider>
    </main>
  );
}

function parseAdminListSortBy(value: string | undefined) {
  if (value === 'updatedAt' || value === 'type' || value === 'status') return value;
  return 'id';
}

function parseAdminListSortDir(value: string | undefined) {
  return value === 'asc' ? 'asc' : 'desc';
}

function parseAdminTypeFilter(value: string | undefined) {
  if (!value || value === 'all') return 'all';
  return (EXERCISE_TYPES as readonly string[]).includes(value) ? value : 'all';
}

function parseAdminStatusFilter(value: string | undefined) {
  if (value === 'draft' || value === 'review' || value === 'approved' || value === 'archived') {
    return value;
  }
  return 'all';
}

function parseAdminExamTypeFilter(value: string | undefined) {
  if (!value || value === 'all') return 'all';
  return /^(?:9|1[0-9]|2[01])$/.test(value) ? value : 'all';
}



