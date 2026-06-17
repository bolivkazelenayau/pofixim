'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, RotateCw } from 'lucide-react';
import { listExerciseRevisionsAction } from '@/app/actions/admin';
import { adminExerciseKeys } from '@/components/admin-form/queryKeys';

type RevisionSnapshot = Record<string, unknown> | null;

type RevisionItem = {
  id: number;
  exerciseId: number;
  action: string;
  actorLabel: string;
  changedFields: string[];
  snapshotBefore: RevisionSnapshot;
  snapshotAfter: RevisionSnapshot;
  createdAt: string;
};

type AdminExerciseHistoryProps = {
  exerciseId: number | null | undefined;
};

const ACTION_LABELS: Record<string, string> = {
  create: 'создание',
  update: 'сохранение',
  delete: 'удаление',
  batch_update: 'batch',
};

const FIELD_LABELS: Record<string, string> = {
  answer: 'answer',
  category: 'category',
  difficulty: 'difficulty',
  explanation: 'explanation',
  isActive: 'active',
  payload: 'payload',
  prompt: 'prompt',
  qualityStatus: 'quality',
  seedKey: 'seed',
  skillTags: 'tags',
  sourceAlignment: 'source',
  type: 'type',
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return value || 'empty';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return 'empty';
  const json = JSON.stringify(value);
  if (!json) return String(value);
  return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

function getFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field;
}

function RevisionDiff({ item }: { item: RevisionItem }) {
  const fields = item.changedFields.slice(0, 5);
  if (fields.length === 0) {
    return <p className="text-xs leading-5 text-foreground/60">Изменений в snapshot нет.</p>;
  }

  return (
    <div className="mt-2 space-y-1.5">
      {fields.map((field) => (
        <div key={field} className="rounded-lg border border-stroke bg-surface px-2 py-1.5">
          <div className="mb-1 text-[11px] font-semibold text-foreground/70">{getFieldLabel(field)}</div>
          <div className="grid gap-1 text-[11px] leading-4 text-foreground/70">
            <div>
              <span className="text-foreground/45">before:</span>{' '}
              <span className="break-words">{formatValue(item.snapshotBefore?.[field])}</span>
            </div>
            <div>
              <span className="text-foreground/45">after:</span>{' '}
              <span className="break-words">{formatValue(item.snapshotAfter?.[field])}</span>
            </div>
          </div>
        </div>
      ))}
      {item.changedFields.length > fields.length ? (
        <div className="text-[11px] text-foreground/50">
          +{item.changedFields.length - fields.length} fields
        </div>
      ) : null}
    </div>
  );
}

export default function AdminExerciseHistory({ exerciseId }: AdminExerciseHistoryProps) {
  const enabled = Number.isInteger(exerciseId) && Number(exerciseId) > 0;
  const query = useQuery({
    queryKey: enabled
      ? adminExerciseKeys.revisions(Number(exerciseId))
      : [...adminExerciseKeys.all, 'revisions', 'empty'],
    queryFn: () => listExerciseRevisionsAction(Number(exerciseId), 20),
    enabled,
    staleTime: 15_000,
  });

  const revisions = useMemo<RevisionItem[]>(() => {
    if (!query.data?.success) return [];
    return query.data.items as RevisionItem[];
  }, [query.data]);

  return (
    <section className="rounded-3xl border border-stroke bg-surface-strong p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <History className="h-4 w-4 text-foreground/60" aria-hidden="true" />
            История
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-foreground/70">
            Последние сохранения и batch-изменения.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={!enabled || query.isFetching}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stroke bg-surface text-foreground/70 transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Обновить историю"
        >
          <RotateCw
            className={`h-4 w-4 ${query.isFetching ? 'motion-safe:animate-spin' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {!enabled ? (
        <div className="rounded-xl border border-dashed border-stroke bg-surface px-3 py-3 text-xs leading-5 text-foreground/60">
          История появится после первого сохранения задания.
        </div>
      ) : query.isPending ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-14 rounded-xl bg-foreground/10 motion-safe:animate-pulse" />
          <div className="h-14 rounded-xl bg-foreground/10 motion-safe:animate-pulse" />
        </div>
      ) : query.data && !query.data.success ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {query.data.error || 'Историю не удалось загрузить.'}
        </div>
      ) : revisions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke bg-surface px-3 py-3 text-xs leading-5 text-foreground/60">
          Ревизий пока нет.
        </div>
      ) : (
        <div className="space-y-2">
          {revisions.map((item) => (
            <details
              key={item.id}
              className="group rounded-xl border border-stroke bg-surface p-3 open:bg-surface-strong"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">
                    {ACTION_LABELS[item.action] ?? item.action}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.changedFields.slice(0, 4).map((field) => (
                      <span
                        key={field}
                        className="rounded-md border border-stroke bg-surface-muted px-1.5 py-0.5 text-[11px] text-foreground/70"
                      >
                        {getFieldLabel(field)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] leading-4 text-foreground/50">
                  <div>{formatDate(item.createdAt)}</div>
                  <div>{item.actorLabel}</div>
                </div>
              </summary>
              <RevisionDiff item={item} />
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
