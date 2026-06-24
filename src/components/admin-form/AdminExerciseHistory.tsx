'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Braces, Eye, FileText, History, RotateCw, X } from 'lucide-react';
import { getExerciseRevisionDetailAction, listExerciseRevisionsAction } from '@/app/actions/admin';
import { adminExerciseKeys } from '@/components/admin-form/queryKeys';

type RevisionSnapshot = Record<string, unknown> | null;

type RevisionItem = {
  id: number;
  exerciseId: number;
  version: number;
  source: string;
  actorLabel: string | null;
  batchId: string | null;
  changedFields: string[];
  summary: string | null;
  createdAt: string;
};

type RevisionDetail = RevisionItem & {
  snapshot: RevisionSnapshot;
  previousSnapshot: RevisionSnapshot;
};

type AdminExerciseHistoryProps = {
  exerciseId: number | null | undefined;
};

const SOURCE_LABELS: Record<string, string> = {
  baseline: 'baseline',
  create: 'создание',
  manual: 'сохранение',
  autosave: 'autosave',
  delete: 'удаление',
  batch: 'batch',
  import: 'import',
  generator: 'generator',
};

const FIELD_LABELS: Record<string, string> = {
  algorithmSteps: 'Шаги алгоритма',
  answer: 'Ответ',
  category: 'Категория',
  difficulty: 'Сложность',
  explanation: 'Объяснение',
  isActive: 'Активно',
  payload: 'Payload',
  prompt: 'Формулировка',
  qualityStatus: 'Статус',
  seedKey: 'Seed key',
  skillTags: 'Теги',
  sourceAlignment: 'Source alignment',
  mistakeModel: 'Модель ошибки',
  transferGroup: 'Группа переноса',
  typicalMistake: 'Типичная ошибка',
  type: 'Тип',
  visualHint: 'Визуальная подсказка',
};

type FieldGroup = {
  title: string;
  fields: string[];
};

const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'Контент',
    fields: ['prompt', 'explanation', 'answer', 'payload', 'algorithmSteps'],
  },
  {
    title: 'Метаданные',
    fields: ['seedKey', 'type', 'category', 'difficulty', 'skillTags', 'qualityStatus', 'isActive'],
  },
  {
    title: 'Диагностика',
    fields: ['sourceAlignment', 'typicalMistake', 'mistakeModel', 'transferGroup', 'visualHint'],
  },
];

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
  if (typeof value === 'string') return value || 'пусто';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return 'пусто';
  const json = JSON.stringify(value, null, 2);
  if (!json) return String(value);
  return json;
}

function getFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field;
}

function isEmptyValue(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function isStructuredValue(value: unknown) {
  return Boolean(value) && typeof value === 'object';
}

function groupChangedFields(fields: string[]) {
  const remaining = new Set(fields);
  const groups = FIELD_GROUPS
    .map((group) => {
      const groupFields = group.fields.filter((field) => remaining.delete(field));
      return { title: group.title, fields: groupFields };
    })
    .filter((group) => group.fields.length > 0);

  if (remaining.size > 0) {
    groups.push({
      title: 'Прочее',
      fields: Array.from(remaining).sort((left, right) => left.localeCompare(right)),
    });
  }

  return groups;
}

function ValueBlock({ value, tone = 'neutral' }: { value: unknown; tone?: 'neutral' | 'before' | 'after' }) {
  const structured = isStructuredValue(value);
  const empty = isEmptyValue(value);
  const toneClass = {
    neutral: 'border-stroke bg-surface text-foreground/78',
    before: 'border-red-200/70 bg-red-50/60 text-red-950 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100',
    after: 'border-emerald-200/70 bg-emerald-50/70 text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100',
  }[tone];

  if (empty) {
    return (
      <div className={`rounded-md border px-2 py-1.5 text-[11px] italic leading-5 text-foreground/45 ${toneClass}`}>
        пусто
      </div>
    );
  }

  return (
    <div className={`max-h-52 overflow-auto rounded-md border px-2 py-1.5 ${toneClass}`}>
      {structured ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4">
          {formatValue(value)}
        </pre>
      ) : (
        <div className="whitespace-pre-wrap break-words text-xs leading-5">
          {formatValue(value)}
        </div>
      )}
    </div>
  );
}

function SnapshotField({ field, item }: { field: string; item: RevisionDetail }) {
  const before = item.previousSnapshot?.[field];
  const after = item.snapshot?.[field];
  const baseline = !item.previousSnapshot;
  const structured = isStructuredValue(after) || isStructuredValue(before);

  return (
    <div className="rounded-lg border border-stroke bg-surface-strong p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {structured ? (
            <Braces className="h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden="true" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden="true" />
          )}
          <div className="truncate text-xs font-semibold text-foreground">
            {getFieldLabel(field)}
          </div>
        </div>
        <div className="shrink-0 rounded-md bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/45">
          {field}
        </div>
      </div>

      {baseline ? (
        <ValueBlock value={after} />
      ) : (
        <div className="grid gap-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-normal text-foreground/45">
              Было
            </div>
            <ValueBlock value={before} tone="before" />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-normal text-foreground/45">
              Стало
            </div>
            <ValueBlock value={after} tone="after" />
          </div>
        </div>
      )}
    </div>
  );
}

function RevisionSnapshotDiff({ item }: { item: RevisionDetail }) {
  const fields = item.changedFields;
  if (fields.length === 0) {
    return <p className="text-xs leading-5 text-foreground/60">Изменений в snapshot нет.</p>;
  }

  const groups = groupChangedFields(fields);
  const baseline = !item.previousSnapshot;

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-stroke bg-surface px-2.5 py-2">
        <div className="text-xs font-semibold text-foreground">
          {baseline ? 'Снимок версии' : 'Изменения версии'}
        </div>
        <div className="mt-0.5 text-[11px] leading-4 text-foreground/55">
          {baseline
            ? `${fields.length} полей сохранены как стартовое состояние.`
            : `${fields.length} полей изменено относительно предыдущей версии.`}
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-normal text-foreground/50">
            <span>{group.title}</span>
            <span className="tabular-nums">{group.fields.length}</span>
          </div>
          <div className="space-y-2">
            {group.fields.map((field) => (
              <SnapshotField key={field} field={field} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminExerciseHistory({ exerciseId }: AdminExerciseHistoryProps) {
  const enabled = Number.isInteger(exerciseId) && Number(exerciseId) > 0;
  const normalizedExerciseId = enabled ? Number(exerciseId) : null;
  const [openedRevision, setOpenedRevision] = useState<{
    exerciseId: number;
    revisionId: number;
  } | null>(null);
  const openedRevisionId =
    openedRevision?.exerciseId === normalizedExerciseId ? openedRevision.revisionId : null;
  const query = useQuery({
    queryKey: enabled
      ? adminExerciseKeys.revisions(Number(normalizedExerciseId))
      : [...adminExerciseKeys.all, 'revisions', 'empty'],
    queryFn: () => listExerciseRevisionsAction(Number(normalizedExerciseId), 20),
    enabled,
    staleTime: 15_000,
  });
  const detailQuery = useQuery({
    queryKey:
      enabled && openedRevisionId
        ? [...adminExerciseKeys.revisions(Number(normalizedExerciseId)), 'detail', openedRevisionId]
        : [...adminExerciseKeys.all, 'revisions', 'detail', 'empty'],
    queryFn: () => getExerciseRevisionDetailAction(Number(normalizedExerciseId), Number(openedRevisionId)),
    enabled: enabled && Number.isInteger(openedRevisionId) && Number(openedRevisionId) > 0,
    staleTime: 30_000,
  });

  const revisions = useMemo<RevisionItem[]>(() => {
    if (!query.data?.success) return [];
    return query.data.items as RevisionItem[];
  }, [query.data]);

  return (
    <section className="rounded-lg border border-stroke bg-surface-strong p-4">
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
        <div className="flex items-center gap-1.5">
          {openedRevisionId ? (
            <button
              type="button"
              onClick={() => setOpenedRevision(null)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stroke bg-surface text-foreground/70 transition hover:bg-surface-muted"
              aria-label="Закрыть ревизию"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={!enabled || query.isFetching}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stroke bg-surface text-foreground/70 transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Обновить историю"
          >
            <RotateCw
              className={`h-4 w-4 ${query.isFetching ? 'motion-safe:animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-lg border border-dashed border-stroke bg-surface px-3 py-3 text-xs leading-5 text-foreground/60">
          История появится после первого сохранения задания.
        </div>
      ) : query.isPending ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-14 rounded-lg bg-foreground/10 motion-safe:animate-pulse" />
          <div className="h-14 rounded-lg bg-foreground/10 motion-safe:animate-pulse" />
        </div>
      ) : query.data && !query.data.success ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {query.data.error || 'Историю не удалось загрузить.'}
        </div>
      ) : revisions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stroke bg-surface px-3 py-3 text-xs leading-5 text-foreground/60">
          Ревизий пока нет.
        </div>
      ) : (
        <div className="space-y-2">
          {revisions.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border p-3 transition ${
                openedRevisionId === item.id
                  ? 'border-foreground/25 bg-surface-strong'
                  : 'border-stroke bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
                    <span>v{item.version}</span>
                    <span className="text-foreground/35">/</span>
                    <span>{SOURCE_LABELS[item.source] ?? item.source}</span>
                  </div>
                  {item.summary ? (
                    <p className="mt-1 text-xs leading-5 text-foreground/65">{item.summary}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.changedFields.slice(0, 5).map((field) => (
                      <span
                        key={field}
                        className="rounded-md border border-stroke bg-surface-muted px-1.5 py-0.5 text-[11px] leading-4 text-foreground/70"
                      >
                        {getFieldLabel(field)}
                      </span>
                    ))}
                    {item.changedFields.length === 0 ? (
                      <span className="text-[11px] leading-5 text-foreground/45">без diff полей</span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] leading-4 text-foreground/50">
                  <div>{formatDate(item.createdAt)}</div>
                  <div>{item.actorLabel ?? 'system'}</div>
                  <button
                    type="button"
                    onClick={() => setOpenedRevision({ exerciseId: item.exerciseId, revisionId: item.id })}
                    className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-stroke bg-surface px-2 text-[11px] font-medium text-foreground/70 transition hover:bg-surface-muted"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Открыть
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {openedRevisionId ? (
        <div className="mt-3 rounded-lg border border-stroke bg-surface p-3">
          {detailQuery.isPending ? (
            <div className="h-28 rounded-lg bg-foreground/10 motion-safe:animate-pulse" aria-hidden="true" />
          ) : detailQuery.data && !detailQuery.data.success ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
              {detailQuery.data.error || 'Ревизию не удалось загрузить.'}
            </div>
          ) : detailQuery.data?.success ? (
            <div>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Ревизия v{detailQuery.data.item.version}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-4 text-foreground/50">
                    {SOURCE_LABELS[detailQuery.data.item.source] ?? detailQuery.data.item.source}
                    {detailQuery.data.item.batchId ? ` / batch ${detailQuery.data.item.batchId.slice(0, 8)}` : ''}
                  </div>
                </div>
                <div className="text-right text-[11px] leading-4 text-foreground/50">
                  <div>{formatDate(detailQuery.data.item.createdAt)}</div>
                  <div>{detailQuery.data.item.actorLabel ?? 'system'}</div>
                </div>
              </div>
              <RevisionSnapshotDiff item={detailQuery.data.item as RevisionDetail} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
