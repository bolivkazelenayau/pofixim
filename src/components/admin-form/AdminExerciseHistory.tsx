'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Eye, FileText, History, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { toast } from 'sonner';
import {
  deleteExerciseRevisionAction,
  getExerciseRevisionDetailAction,
  listExerciseRevisionsAction,
  restoreExerciseRevisionAction,
} from '@/app/actions/admin';
import { adminExerciseKeys } from '@/components/admin-form/queryKeys';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import CompactMarkdown from '@/components/admin-form/markdown/CompactMarkdown';
import { publishExerciseUpdated } from '@/lib/exercise-update-events';
import { cn } from '@/lib/utils';

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
  onRevisionRestored?: (id: number) => Promise<void> | void;
};

const SOURCE_LABELS: Record<string, string> = {
  baseline: 'снимок',
  create: 'создание',
  manual: 'сохранение',
  autosave: 'автосейв',
  delete: 'удаление',
  batch: 'batch',
  import: 'импорт',
  generator: 'генератор',
  restore: 'восстановление',
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

const TECHNICAL_FIELDS = new Set([
  'createdAt',
  'id',
  'searchBlob',
  'searchBlobNormalized',
  'updatedAt',
]);

const REVISION_CLOSE_HIGHLIGHT_MS = 220;
const DELETABLE_REVISION_SOURCES = new Set(['manual', 'autosave', 'restore']);

type RevisionConfirmation = {
  action: 'restore' | 'delete';
  item: RevisionDetail;
} | null;

function formatDate(value: string) {
  const localTimestamp = value.match(/^\d{4}-\d{2}-\d{2}\s/)
    ? value.replace(' ', 'T')
    : value;
  const date = new Date(localTimestamp);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function getHumanFields(fields: string[]) {
  return fields.filter((field) => !TECHNICAL_FIELDS.has(field));
}

function getVisibleFieldLabels(fields: string[], limit = 3) {
  const humanFields = getHumanFields(fields);
  const labels = humanFields.slice(0, limit).map(getFieldLabel);
  const rest = humanFields.length - labels.length;
  return rest > 0 ? `${labels.join(', ')} +${rest}` : labels.join(', ');
}

function summarizeValue(value: unknown) {
  if (isEmptyValue(value)) return 'пусто';
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
  }
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `${value.length} эл.`;
  if (isRecord(value)) {
    const keys = Object.keys(value);
    return keys.length > 0 ? keys.slice(0, 4).join(', ') : 'пустой объект';
  }
  return String(value);
}

function getFieldChangeSummary(field: string, before: unknown, after: unknown, baseline: boolean) {
  if (baseline) return null;
  if (field === 'payload' || field === 'answer') {
    const beforeKeys = isRecord(before) ? Object.keys(before).length : 0;
    const afterKeys = isRecord(after) ? Object.keys(after).length : 0;
    return beforeKeys === afterKeys ? null : `${beforeKeys} -> ${afterKeys} ключей`;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeLength = Array.isArray(before) ? before.length : 0;
    const afterLength = Array.isArray(after) ? after.length : 0;
    return beforeLength === afterLength ? null : `${beforeLength} -> ${afterLength} эл.`;
  }
  if (areValuesEqual(before, after)) return null;
  return `${summarizeValue(before)} -> ${summarizeValue(after)}`;
}

function areValuesEqual(left: unknown, right: unknown) {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function getNestedStatus(before: unknown, after: unknown, baseline: boolean) {
  if (baseline) return 'snapshot';
  if (before === undefined) return 'added';
  if (after === undefined) return 'removed';
  return areValuesEqual(before, after) ? 'same' : 'changed';
}

function getNestedStatusLabel(status: 'snapshot' | 'added' | 'removed' | 'same' | 'changed') {
  return {
    added: 'добавлено',
    changed: 'изменено',
    removed: 'удалено',
    same: 'без изменений',
    snapshot: 'снимок',
  }[status];
}

function getNestedStatusClass(status: 'snapshot' | 'added' | 'removed' | 'same' | 'changed') {
  return {
    added: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-500/20',
    changed: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/20',
    removed: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-100 dark:ring-red-500/20',
    same: 'bg-transparent text-foreground/38 ring-foreground/10',
    snapshot: 'bg-primary/10 text-primary ring-primary/20',
  }[status];
}

function getNestedEntries(before: unknown, after: unknown) {
  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeArray = Array.isArray(before) ? before : [];
    const afterArray = Array.isArray(after) ? after : [];
    const length = Math.max(beforeArray.length, afterArray.length);
    return Array.from({ length }, (_, index) => ({
      key: String(index + 1),
      label: `#${index + 1}`,
      before: beforeArray[index],
      after: afterArray[index],
    }));
  }

  if (isRecord(before) || isRecord(after)) {
    const keys = Array.from(new Set([
      ...Object.keys(isRecord(before) ? before : {}),
      ...Object.keys(isRecord(after) ? after : {}),
    ])).sort((left, right) => left.localeCompare(right));

    return keys.map((key) => ({
      key,
      label: key,
      before: isRecord(before) ? before[key] : undefined,
      after: isRecord(after) ? after[key] : undefined,
    }));
  }

  return [{
    key: 'value',
    label: 'value',
    before,
    after,
  }];
}

function RawValueBlock({ value, tone = 'neutral' }: { value: unknown; tone?: 'neutral' | 'before' | 'after' }) {
  const empty = isEmptyValue(value);
  const toneClass = {
    neutral: 'border-stroke bg-surface text-foreground/78',
    before: 'border-red-200/70 bg-red-50/60 text-red-950 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100',
    after: 'border-emerald-200/70 bg-emerald-50/70 text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100',
  }[tone];

  if (empty) {
    return (
      <div className={`rounded-[12px] border px-3 py-2 text-[11px] italic leading-5 text-foreground/45 ${toneClass}`}>
        пусто
      </div>
    );
  }

  return (
    <div className={`max-h-72 overflow-auto rounded-[12px] border px-3 py-2 ${toneClass}`}>
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4">
        {formatValue(value)}
      </pre>
    </div>
  );
}

function TextValueBlock({ value, tone = 'neutral' }: { value: unknown; tone?: 'neutral' | 'before' | 'after' }) {
  const empty = isEmptyValue(value);
  const markdown = typeof value === 'string' && !empty;
  const toneClass = {
    neutral: 'border-stroke bg-surface text-foreground/78',
    before: 'border-red-200/70 bg-red-50/50 text-red-950 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100',
    after: 'border-emerald-200/70 bg-emerald-50/60 text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100',
  }[tone];

  return (
    <div className={`max-h-56 overflow-auto rounded-[12px] border px-3 py-2 text-xs leading-5 ${toneClass}`}>
      {markdown ? (
        <CompactMarkdown className="break-words text-pretty">{value}</CompactMarkdown>
      ) : (
        <div className="whitespace-pre-wrap break-words">{formatValue(value)}</div>
      )}
    </div>
  );
}

function KeyValueSummary({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.slice(0, 6).map((item, index) => (
          <div key={index} className="rounded-[10px] border border-stroke bg-surface px-3 py-2 text-xs leading-5 text-foreground/72">
            {isRecord(item) ? (
              <div className="space-y-1">
                {Object.entries(item).slice(0, 4).map(([key, innerValue]) => (
                  <div key={key} className="flex gap-2">
                    <span className="shrink-0 font-mono text-[11px] text-foreground/40">{key}</span>
                    <span className="min-w-0 break-words">{summarizeValue(innerValue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              summarizeValue(item)
            )}
          </div>
        ))}
        {value.length > 6 ? (
          <div className="text-[11px] leading-4 text-foreground/45">+{value.length - 6} элементов в Raw</div>
        ) : null}
      </div>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    return (
      <div className={cn('grid gap-2', entries.length > 1 && 'sm:grid-cols-2')}>
        {entries.slice(0, 10).map(([key, innerValue]) => (
          <div key={key} className="rounded-[12px] border border-stroke bg-surface px-3 py-2">
            <div className="font-mono text-[10px] leading-4 text-foreground/40">{key}</div>
            <div className="break-words text-xs leading-5 text-foreground/75">{summarizeValue(innerValue)}</div>
          </div>
        ))}
        {entries.length > 10 ? (
          <div className="rounded-[12px] border border-dashed border-stroke bg-surface px-3 py-2 text-xs leading-5 text-foreground/45">
            +{entries.length - 10} ключей в Raw
          </div>
        ) : null}
      </div>
    );
  }

  return <TextValueBlock value={value} />;
}

function NestedDiffRows({
  after,
  baseline,
  before,
  depth = 0,
}: {
  after: unknown;
  baseline: boolean;
  before: unknown;
  depth?: number;
}) {
  const entries = getNestedEntries(before, after);

  if (entries.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-stroke bg-surface-strong px-3 py-2 text-xs leading-5 text-foreground/50">
        пусто
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const status = getNestedStatus(entry.before, entry.after, baseline);
        const value = baseline ? entry.after : status === 'removed' ? entry.before : entry.after;
        const canExpandNested = depth < 2 && (isStructuredValue(entry.before) || isStructuredValue(entry.after));
        const rowRadius = depth === 0 ? 'rounded-[16px]' : 'rounded-[12px]';
        if (canExpandNested) {
          return (
            <div
              key={entry.key}
              className={`${rowRadius} border border-stroke bg-surface-strong p-2`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-xs font-semibold leading-5 text-foreground">
                  {entry.label}
                </div>
                {status !== 'snapshot' ? (
                  <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ring-1 ${getNestedStatusClass(status)}`}>
                    {getNestedStatusLabel(status)}
                  </span>
                ) : null}
              </div>
              <NestedDiffRows
                after={entry.after}
                baseline={baseline}
                before={entry.before}
                depth={depth + 1}
              />
            </div>
          );
        }

        if (status === 'changed' && !baseline) {
          return (
            <div
              key={entry.key}
              className={`${rowRadius} grid gap-2 border border-stroke bg-surface-strong p-2 md:grid-cols-[56px_minmax(0,1fr)_auto]`}
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium leading-5 text-foreground/65">{entry.label}</div>
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <div className="grid gap-1 rounded-[8px] bg-red-50/55 px-2 py-2 text-red-950 dark:bg-red-500/10 dark:text-red-100">
                  <span className="text-[10px] font-semibold uppercase leading-3 text-red-700/60 dark:text-red-100/55">
                    Было
                  </span>
                  <span className="break-words text-xs leading-5">{summarizeValue(entry.before)}</span>
                </div>
                <div className="grid gap-1 rounded-[8px] bg-emerald-50/65 px-2 py-2 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100">
                  <span className="text-[10px] font-semibold uppercase leading-3 text-emerald-700/60 dark:text-emerald-100/55">
                    Стало
                  </span>
                  <span className="break-words text-xs leading-5">{summarizeValue(entry.after)}</span>
                </div>
              </div>
            <div className="justify-self-start md:justify-self-end">
                <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ring-1 ${getNestedStatusClass(status)}`}>
                  {getNestedStatusLabel(status)}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div
            key={entry.key}
            className={`${rowRadius} grid gap-2 border border-stroke bg-surface-strong px-3 py-2 md:grid-cols-[56px_minmax(0,1fr)_auto]`}
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-medium leading-5 text-foreground/65">{entry.label}</div>
            </div>
            <div className="min-w-0 text-xs leading-5 text-foreground/75">
              <div className="break-words">{summarizeValue(value)}</div>
            </div>
            {status !== 'snapshot' ? (
              <div className="justify-self-start md:justify-self-end">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ring-1 ${getNestedStatusClass(status)}`}>
                  {getNestedStatusLabel(status)}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function HumanValueBlock({
  field,
  value,
  tone = 'neutral',
}: {
  field: string;
  value: unknown;
  tone?: 'neutral' | 'before' | 'after';
}) {
  if (field === 'prompt' || field === 'explanation') {
    return <TextValueBlock value={value} tone={tone} />;
  }

  if (field === 'answer' || field === 'payload' || field === 'algorithmSteps' || isStructuredValue(value)) {
    return (
      <div className={tone === 'neutral' ? '' : tone === 'before' ? 'rounded-lg bg-red-50/40 p-2 dark:bg-red-500/5' : 'rounded-lg bg-emerald-50/50 p-2 dark:bg-emerald-500/5'}>
        <KeyValueSummary value={value} />
      </div>
    );
  }

  return <TextValueBlock value={value} tone={tone} />;
}

function OverviewFieldValue({
  after,
  baseline,
  before,
  field,
}: {
  after: unknown;
  baseline: boolean;
  before: unknown;
  field: string;
}) {
  const structured = isStructuredValue(after) || isStructuredValue(before);
  if (structured && (field === 'answer' || field === 'payload' || field === 'algorithmSteps')) {
    return <NestedDiffRows after={after} baseline={baseline} before={before} />;
  }

  if (baseline) {
    return <HumanValueBlock field={field} value={after} />;
  }

  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase text-foreground/45">
          Было
        </div>
        <HumanValueBlock field={field} value={before} tone="before" />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase text-foreground/45">
          Стало
        </div>
        <HumanValueBlock field={field} value={after} tone="after" />
      </div>
    </div>
  );
}

function SnapshotField({
  field,
  item,
  mode,
}: {
  field: string;
  item: RevisionDetail;
  mode: 'overview' | 'raw';
}) {
  const before = item.previousSnapshot?.[field];
  const after = item.snapshot?.[field];
  const baseline = !item.previousSnapshot;
  const structured = isStructuredValue(after) || isStructuredValue(before);
  const summary = getFieldChangeSummary(field, before, after, baseline);

  return (
    <div className="rounded-[24px] border border-stroke bg-surface-strong p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {structured ? (
            <Braces className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden="true" />
          ) : (
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/45" aria-hidden="true" />
          )}
          <div>
            <div className="text-xs font-semibold text-foreground">{getFieldLabel(field)}</div>
            {summary ? (
              <div className="mt-0.5 text-[11px] leading-4 text-foreground/45">
                {summary}
              </div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 rounded-md bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] text-foreground/40">
          {field}
        </div>
      </div>

      {baseline ? (
        mode === 'raw' ? (
          <RawValueBlock value={after} />
        ) : (
          <OverviewFieldValue after={after} baseline={baseline} before={before} field={field} />
        )
      ) : (
        mode === 'raw' ? (
          <div className="grid gap-2 lg:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase text-foreground/45">
                Было
              </div>
              <RawValueBlock value={before} tone="before" />
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase text-foreground/45">
                Стало
              </div>
              <RawValueBlock value={after} tone="after" />
            </div>
          </div>
        ) : (
          <OverviewFieldValue after={after} baseline={baseline} before={before} field={field} />
        )
      )}
    </div>
  );
}

function RevisionSnapshotDiff({
  item,
  mode,
}: {
  item: RevisionDetail;
  mode: 'overview' | 'raw';
}) {
  const fields = mode === 'raw' ? item.changedFields : getHumanFields(item.changedFields);
  if (fields.length === 0) {
    return (
      <p className="rounded-[14px] border border-dashed border-stroke bg-surface px-3 py-3 text-xs leading-5 text-foreground/60">
        В обзорных полях изменений нет. Полный технический diff доступен в Raw.
      </p>
    );
  }

  const groups = groupChangedFields(fields);
  const baseline = !item.previousSnapshot;

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-stroke bg-surface px-3 py-2">
        <div className="text-xs font-semibold text-foreground">
          {baseline ? 'Стартовый снимок' : 'Изменения версии'}
        </div>
        <div className="mt-0.5 text-[11px] leading-4 text-foreground/55">
          {baseline
            ? `${fields.length} полей сохранены как стартовое состояние.`
            : `${fields.length} полей изменено относительно предыдущей версии.`}
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-foreground/50">
            <span>{group.title}</span>
            <span className="tabular-nums">{group.fields.length}</span>
          </div>
          <div className="space-y-3">
            {group.fields.map((field) => (
              <SnapshotField key={field} field={field} item={item} mode={mode} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RevisionDetailDialog({
  item,
  isPending,
  error,
  mode,
  isDeleting,
  isRestoring,
  onDeleteRequest,
  onModeChange,
  onRestoreRequest,
}: {
  item: RevisionDetail | null;
  isPending: boolean;
  error: string | null;
  mode: 'overview' | 'raw';
  isDeleting: boolean;
  isRestoring: boolean;
  onDeleteRequest: (item: RevisionDetail) => void;
  onModeChange: (mode: 'overview' | 'raw') => void;
  onRestoreRequest: (item: RevisionDetail) => void;
}) {
  const canDelete = item ? DELETABLE_REVISION_SOURCES.has(item.source) : false;
  const actionDisabled = isPending || isDeleting || isRestoring || !item;

  return (
    <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden rounded-[22px] p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)] duration-200 ease-out sm:max-w-[960px]" showCloseButton>
      <DialogHeader className="border-b border-stroke px-5 py-4">
        <div className="grid gap-4 pr-9 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold leading-6 text-foreground text-balance">
              {item ? `Ревизия v${item.version}` : 'Ревизия'}
            </DialogTitle>
            <DialogDescription className="mt-1 max-w-[48rem] text-xs leading-5 text-foreground/60 text-pretty">
              {item ? getVisibleFieldLabels(item.changedFields, 5) || 'без diff полей' : 'История изменений задания'}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {item ? (
                <>
                  <span className="rounded-md bg-foreground/5 px-2 py-1 text-[11px] font-medium leading-4 text-foreground/60">
                    {SOURCE_LABELS[item.source] ?? item.source}
                  </span>
                  <span className="rounded-md bg-foreground/5 px-2 py-1 text-[11px] leading-4 text-foreground/50">
                    {formatDate(item.createdAt)}
                  </span>
                  <span className="rounded-md bg-foreground/5 px-2 py-1 text-[11px] leading-4 text-foreground/50">
                    {item.actorLabel ?? 'system'}
                  </span>
                </>
              ) : null}
              {item?.batchId ? (
                <span className="rounded-md bg-foreground/5 px-2 py-1 font-mono text-[10px] leading-4 text-foreground/45">
                  batch {item.batchId.slice(0, 8)}
                </span>
              ) : null}
            </div>
            <div className="inline-flex shrink-0 rounded-lg border border-stroke bg-surface p-0.5 shadow-sm">
              <button
                type="button"
                aria-pressed={mode === 'overview'}
                onClick={() => onModeChange('overview')}
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]',
                  mode === 'overview' ? 'bg-primary text-white' : 'text-foreground/60 hover:bg-surface-muted',
                )}
              >
                Обзор
              </button>
              <button
                type="button"
                aria-pressed={mode === 'raw'}
                onClick={() => onModeChange('raw')}
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]',
                  mode === 'raw' ? 'bg-primary text-white' : 'text-foreground/60 hover:bg-surface-muted',
                )}
              >
                Raw
              </button>
            </div>
          </div>
        </div>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isPending ? (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-20 rounded-[14px] bg-foreground/10 motion-safe:animate-pulse" />
            <div className="h-36 rounded-[14px] bg-foreground/10 motion-safe:animate-pulse" />
            <div className="h-24 rounded-[14px] bg-foreground/10 motion-safe:animate-pulse" />
          </div>
        ) : error ? (
          <div className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
            {error}
          </div>
        ) : item ? (
          <RevisionSnapshotDiff item={item} mode={mode} />
        ) : null}
      </div>
      {item ? (
        <div className="flex flex-col-reverse gap-2 border-t border-stroke bg-surface-strong px-5 py-4 sm:flex-row sm:justify-end">
          {canDelete ? (
            <button
              type="button"
              onClick={() => onDeleteRequest(item)}
              disabled={actionDisabled}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200/80 bg-red-50 px-3 text-sm font-semibold text-red-700 transition-[background-color,border-color,transform,opacity] duration-150 ease-out hover:border-red-300 hover:bg-red-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Удалить ревизию
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRestoreRequest(item)}
            disabled={actionDisabled}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary px-3 text-sm font-semibold text-white shadow-sm transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Восстановить
          </button>
        </div>
      ) : null}
    </DialogContent>
  );
}

function RevisionConfirmDialog({
  confirmation,
  isDeleting,
  isRestoring,
  onCancel,
  onConfirm,
}: {
  confirmation: RevisionConfirmation;
  isDeleting: boolean;
  isRestoring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const item = confirmation?.item ?? null;
  const isRestore = confirmation?.action === 'restore';
  const pending = isDeleting || isRestoring;

  return (
    <AlertDialogPrimitive.Root open={Boolean(confirmation)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="admin-modal-overlay" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-modal w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[24px] border border-stroke bg-surface-strong p-5 text-foreground shadow-sm outline-none duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <AlertDialogPrimitive.Title className="text-base font-semibold">
            {isRestore ? `Восстановить v${item?.version ?? ''}?` : `Удалить v${item?.version ?? ''}?`}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-5 text-foreground/75">
            {isRestore
              ? 'Текущее состояние задания будет заменено снимком этой ревизии. Само действие запишется новой ревизией восстановления.'
              : 'Текущее упражнение не изменится. Из истории исчезнет только эта рабочая ревизия.'}
          </AlertDialogPrimitive.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <button
                type="button"
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-stroke bg-surface px-3 text-sm font-medium text-foreground/75 transition-colors duration-150 ease-out hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50"
              >
                Отмена
              </button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
                disabled={pending}
                className={cn(
                  'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
                  isRestore
                    ? 'bg-primary text-white hover:bg-primary/90'
                    : 'border border-red-200/80 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-100',
                )}
              >
                {isRestore ? (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                {pending ? 'Выполняется...' : isRestore ? 'Восстановить' : 'Удалить'}
              </button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export default function AdminExerciseHistory({
  exerciseId,
  onRevisionRestored,
}: AdminExerciseHistoryProps) {
  const queryClient = useQueryClient();
  const enabled = Number.isInteger(exerciseId) && Number(exerciseId) > 0;
  const normalizedExerciseId = enabled ? Number(exerciseId) : null;
  const [openedRevision, setOpenedRevision] = useState<{
    exerciseId: number;
    revisionId: number;
  } | null>(null);
  const [closingHighlightedRevisionId, setClosingHighlightedRevisionId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<RevisionConfirmation>(null);
  const [detailMode, setDetailMode] = useState<'overview' | 'raw'>('overview');
  const closingHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedRevisionId =
    openedRevision?.exerciseId === normalizedExerciseId ? openedRevision.revisionId : null;

  useEffect(() => {
    return () => {
      if (closingHighlightTimerRef.current) {
        clearTimeout(closingHighlightTimerRef.current);
      }
    };
  }, []);
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
  const detailItem = detailQuery.data?.success ? detailQuery.data.item as RevisionDetail : null;
  const detailError = detailQuery.data && !detailQuery.data.success
    ? detailQuery.data.error || 'Ревизию не удалось загрузить.'
    : null;
  const restoreMutation = useMutation({
    mutationFn: (input: { exerciseId: number; revisionId: number }) =>
      restoreExerciseRevisionAction(input.exerciseId, input.revisionId),
  });
  const deleteMutation = useMutation({
    mutationFn: (input: { exerciseId: number; revisionId: number }) =>
      deleteExerciseRevisionAction(input.exerciseId, input.revisionId),
  });

  async function invalidateRevisionQueries(id: number) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminExerciseKeys.revisions(id) }),
      queryClient.invalidateQueries({ queryKey: adminExerciseKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: adminExerciseKeys.lists() }),
    ]);
  }

  async function handleRestoreRevision(item: RevisionDetail) {
    const result = await restoreMutation.mutateAsync({
      exerciseId: item.exerciseId,
      revisionId: item.id,
    });

    if (!result.success) {
      toast.error(result.error || 'Не удалось восстановить ревизию.');
      return;
    }

    setOpenedRevision(null);
    setConfirmation(null);
    await invalidateRevisionQueries(item.exerciseId);
    publishExerciseUpdated(item.exerciseId, result.updatedAt ?? null);
    if (!result.alreadyCurrent) {
      await onRevisionRestored?.(item.exerciseId);
    }
    toast.success(
      result.alreadyCurrent
        ? `Ревизия v${result.restoredVersion} уже актуальна.`
        : `Восстановлена ревизия v${result.restoredVersion}.`,
    );
  }

  async function handleDeleteRevision(item: RevisionDetail) {
    const result = await deleteMutation.mutateAsync({
      exerciseId: item.exerciseId,
      revisionId: item.id,
    });

    if (!result.success) {
      toast.error(result.error || 'Не удалось удалить ревизию.');
      return;
    }

    setOpenedRevision(null);
    setConfirmation(null);
    await queryClient.invalidateQueries({ queryKey: adminExerciseKeys.revisions(item.exerciseId) });
    toast.success(`Ревизия v${result.deletedVersion} удалена.`);
  }

  function handleConfirmRevisionAction() {
    if (!confirmation) return;
    if (confirmation.action === 'restore') {
      void handleRestoreRevision(confirmation.item);
      return;
    }
    void handleDeleteRevision(confirmation.item);
  }

  return (
    <section className="rounded-[28px] border border-stroke bg-surface-strong p-4">
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stroke bg-surface text-foreground/70 transition-colors duration-150 ease-out hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Обновить историю"
        >
          <RotateCw
            className={`h-4 w-4 ${query.isFetching ? 'motion-safe:animate-spin' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {!enabled ? (
        <div className="rounded-[14px] border border-dashed border-stroke bg-surface px-3 py-3 text-xs leading-5 text-foreground/60">
          История появится после первого сохранения задания.
        </div>
      ) : query.isPending ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-14 rounded-[18px] bg-foreground/10 motion-safe:animate-pulse" />
          <div className="h-14 rounded-[18px] bg-foreground/10 motion-safe:animate-pulse" />
        </div>
      ) : query.data && !query.data.success ? (
        <div className="rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          {query.data.error || 'Историю не удалось загрузить.'}
        </div>
      ) : revisions.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-stroke bg-surface px-3 py-3 text-xs leading-5 text-foreground/60">
          Ревизий пока нет.
        </div>
      ) : (
        <div className="space-y-2">
          {revisions.map((item) => {
            const isOpen = openedRevisionId === item.id || closingHighlightedRevisionId === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  if (closingHighlightTimerRef.current) {
                    clearTimeout(closingHighlightTimerRef.current);
                    closingHighlightTimerRef.current = null;
                  }
                  setClosingHighlightedRevisionId(null);
                  setDetailMode('overview');
                  setOpenedRevision({ exerciseId: item.exerciseId, revisionId: item.id });
                }}
                className={`w-full rounded-[18px] border p-3 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  isOpen
                    ? 'border-foreground/30 bg-foreground/5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_10%,transparent)]'
                    : 'border-stroke bg-surface-strong hover:border-stroke hover:bg-foreground/5'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
                      <span className="tabular-nums">v{item.version}</span>
                      <span className="text-foreground/35">/</span>
                      <span>{SOURCE_LABELS[item.source] ?? item.source}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-foreground/65">
                      {item.changedFields.length > 0
                        ? getVisibleFieldLabels(item.changedFields)
                        : item.summary ?? 'без diff полей'}
                    </p>
                    <div className="mt-1 text-[11px] leading-4 text-foreground/45">
                      {formatDate(item.createdAt)} · {item.actorLabel ?? 'system'}
                    </div>
                  </div>
                  <span
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-stroke bg-surface px-2 text-[11px] font-medium text-foreground/65"
                    aria-hidden="true"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Открыть
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(openedRevisionId)}
        onOpenChange={(open) => {
          if (open) return;

          const revisionId = openedRevisionId;
          setOpenedRevision(null);

          if (!revisionId) return;

          if (closingHighlightTimerRef.current) {
            clearTimeout(closingHighlightTimerRef.current);
          }
          setClosingHighlightedRevisionId(revisionId);
          closingHighlightTimerRef.current = setTimeout(() => {
            setClosingHighlightedRevisionId(null);
            closingHighlightTimerRef.current = null;
          }, REVISION_CLOSE_HIGHLIGHT_MS);
        }}
      >
        <RevisionDetailDialog
          error={detailError}
          isDeleting={deleteMutation.isPending}
          isPending={detailQuery.isPending}
          isRestoring={restoreMutation.isPending}
          item={detailItem}
          mode={detailMode}
          onDeleteRequest={(item) => setConfirmation({ action: 'delete', item })}
          onModeChange={setDetailMode}
          onRestoreRequest={(item) => setConfirmation({ action: 'restore', item })}
        />
      </Dialog>
      <RevisionConfirmDialog
        confirmation={confirmation}
        isDeleting={deleteMutation.isPending}
        isRestoring={restoreMutation.isPending}
        onCancel={() => setConfirmation(null)}
        onConfirm={handleConfirmRevisionAction}
      />
    </section>
  );
}
