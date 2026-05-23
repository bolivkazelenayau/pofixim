import Link from 'next/link';
import { desc } from 'drizzle-orm';
import AdminForm from '@/components/AdminForm';
import { db } from '@/db';
import { exercises } from '@/db/schema';

export default async function AdminPage() {
  const rows = await db
    .select({
      id: exercises.id,
      type: exercises.type,
      skillTags: exercises.skillTags,
      seedKey: exercises.seedKey,
      prompt: exercises.prompt,
      qualityStatus: exercises.qualityStatus,
      updatedAt: exercises.updatedAt,
      isActive: exercises.isActive,
    })
    .from(exercises)
    .orderBy(desc(exercises.updatedAt))
    .limit(150);

  const initialItems = rows.map((row) => ({
    id: row.id,
    type: row.type,
    skillTags: row.skillTags,
    seedKey: row.seedKey,
    prompt: row.prompt,
    qualityStatus: row.qualityStatus,
    updatedAt: row.updatedAt.toISOString(),
    isActive: row.isActive,
  }));

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto mb-5 flex w-full max-w-[1400px] items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Панель администратора</h1>
          <p className="mt-1 text-sm text-slate-600">
            Конструктор заданий и проверка по требованиям ФИПИ
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Назад к боту
        </Link>
      </div>

      <AdminForm initialItems={initialItems} />
    </div>
  );
}
