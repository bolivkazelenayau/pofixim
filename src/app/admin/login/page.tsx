import ThemeToggle from '@/components/ThemeToggle';
import { loginAdminAction } from './actions';

type AdminLoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -right-24 bottom-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <section className="relative w-full max-w-md overflow-hidden rounded-3xl border border-stroke bg-surface-strong p-7 shadow-xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary font-mono text-sm font-semibold text-white">
            DB
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/50">restricted access</p>
            <h1 className="text-xl font-semibold text-foreground">Панель администратора</h1>
          </div>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-foreground/65">
          Войдите, чтобы управлять заданиями, искать по базе и запускать служебные операции.
        </p>

        <form action={loginAdminAction} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-foreground/55">
              Пароль
            </span>
            <input
              autoComplete="current-password"
              autoFocus
              name="password"
              required
              type="password"
              className="w-full rounded-xl border border-stroke bg-surface px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          {error === '1' ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
              Неверный пароль. Попробуйте ещё раз.
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Войти в админку
          </button>
        </form>
      </section>
    </main>
  );
}
