import ThemeToggle from '@/components/ThemeToggle';
import { loginAdminAction } from './actions';
import { Database, LockKeyhole } from 'lucide-react';

type AdminLoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Decorative blurred background blobs */}
      <div className="absolute -left-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px] dark:bg-primary/15" />
      <div className="absolute -right-[10%] bottom-[10%] h-[500px] w-[500px] rounded-full bg-purple-500/20 blur-[120px] dark:bg-purple-600/15" />
      
      <div className="absolute right-5 top-5 z-50">
        <ThemeToggle />
      </div>

      <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-stroke/60 bg-surface-strong/80 p-8 shadow-2xl backdrop-blur-xl dark:border-stroke/30 dark:bg-surface-strong/60">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-lg shadow-primary/30">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Secure Gateway
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Панель управления</h1>
          </div>
        </div>

        <p className="mb-8 text-sm leading-relaxed text-foreground/70">
          Войдите, чтобы управлять заданиями, искать по базе и запускать служебные операции.
        </p>

        <form action={loginAdminAction} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-foreground/60">
              Мастер-пароль
            </span>
            <div className="relative group">
              <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground/40 transition-colors group-focus-within:text-primary" />
              <input
                autoComplete="current-password"
                autoFocus
                name="password"
                required
                type="password"
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-stroke/80 bg-surface/50 py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-foreground/30 outline-none transition-all hover:bg-surface focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/10 dark:focus:ring-primary/20"
              />
            </div>
          </label>

          {error === '1' ? (
            <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-red-200/50 bg-red-50/50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
              <span className="font-semibold">Ошибка доступа.</span> Неверный пароль.
            </div>
          ) : null}

          {error === 'rate-limit' ? (
            <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
              <span className="font-semibold">Слишком много попыток.</span> Попробуйте войти снова через 10 минут.
            </div>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-primary to-primary-strong px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 active:translate-y-0"
          >
            Войти в систему
          </button>
        </form>
      </section>
    </main>
  );
}
