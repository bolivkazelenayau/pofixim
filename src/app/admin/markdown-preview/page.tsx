import Link from 'next/link';
import { requireAdminPageSession } from '@/lib/admin-auth';
import ThemeToggle from '@/components/ThemeToggle';
import AdminMarkdownPreview from '@/components/AdminMarkdownPreview';

export default async function AdminMarkdownPreviewPage() {
  await requireAdminPageSession();

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto mb-5 flex w-full max-w-[1400px] items-center justify-between rounded-2xl border border-stroke bg-surface-strong px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Markdown-превью</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Отдельный раздел админки для проверки рендера `.md`-файлов.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/admin"
            className="rounded-lg border border-stroke bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:bg-stroke"
          >
            К админке
          </Link>
        </div>
      </div>

      <AdminMarkdownPreview />
    </div>
  );
}
