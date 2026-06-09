import Link from 'next/link';
import AdminFormClient from '@/components/admin-form/AdminFormClient';
import ThemeToggle from '@/components/ThemeToggle';
import { logoutAdminAction } from '@/app/admin/login/actions';
import { requireAdminPageSession } from '@/lib/admin-auth';

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
          <form action={logoutAdminAction}>
            <button
              type="submit"
              className="rounded-lg border border-stroke bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:bg-stroke"
            >
              Выйти
            </button>
          </form>
        </div>
      </div>

      <AdminFormClient
        initialItems={[]}
        initialTotalItems={null}
        initialSelectedId={initialSelectedId}
        initialSelectedExercise={null}
      />
    </div>
  );
}



