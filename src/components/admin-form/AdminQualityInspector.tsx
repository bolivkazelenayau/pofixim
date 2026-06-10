'use client';

import { AlertCircle, CheckCircle2, CircleDot, Info } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { buildEge15QuickCards } from '@/features/exercises/ege15Quick';
import type { Exercise } from '@/features/exercises/schemas';
import type { Form } from './types';

type AdminQualityInspectorProps = {
  form: Form;
  setForm: Dispatch<SetStateAction<Form>>;
  preview: { exercise: Exercise | null; error: string };
};

type CheckLevel = 'error' | 'warning' | 'ok' | 'info';

type QualityCheck = {
  level: CheckLevel;
  label: string;
  detail?: string;
  targetId?: string;
};

const INVISIBLE_TEXT_RE = /[\u00ad\u200b\u200c\u200d\ufeff]/u;
const INVISIBLE_TEXT_RE_GLOBAL = /[\u00ad\u200b\u200c\u200d\ufeff]/gu;
const NUMBERED_POSITION_RE = /\((\d+)\)/gu;

export default function AdminQualityInspector({
  form,
  setForm,
  preview,
}: AdminQualityInspectorProps) {
  const checks = buildQualityChecks(form, preview);
  const ege15Diagnostics = buildEge15Diagnostics(preview.exercise);
  const hasInvisibleText = containsInvisibleText(form);
  const errorCount = checks.filter((check) => check.level === 'error').length;
  const warningCount = checks.filter((check) => check.level === 'warning').length;
  const ready = errorCount === 0 && warningCount === 0;

  function normalizeHiddenCharacters() {
    setForm((current) => ({
      ...current,
      prompt: stripInvisibleText(current.prompt),
      explanation: stripInvisibleText(current.explanation),
      fillBefore: stripInvisibleText(current.fillBefore),
      fillAfter: stripInvisibleText(current.fillAfter),
      options: current.options.map(stripInvisibleText),
      wordBankTextWithSlots: stripInvisibleText(current.wordBankTextWithSlots),
      orthographyRepairText: stripInvisibleText(current.orthographyRepairText),
      ege20TextWithSlots: stripInvisibleText(current.ege20TextWithSlots),
      ege21Sentences: stripInvisibleText(current.ege21Sentences),
    }));
  }

  return (
    <section className="rounded-xl border border-stroke bg-surface-strong p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quality inspector</h3>
          <p className="mt-0.5 text-xs leading-5 text-foreground/55">
            Блокеры, предупреждения и разбор quick-слоя.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${
            ready
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200'
              : errorCount > 0
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200'
          }`}
        >
          {ready ? 'ready' : `${errorCount} errors · ${warningCount} warnings`}
        </span>
      </div>

      <div className="space-y-1.5">
        {checks.map((check) => (
          <QualityCheckRow
            key={`${check.level}:${check.label}`}
            check={check}
            onOpenTarget={openInspectorTarget}
          />
        ))}
      </div>

      {hasInvisibleText ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-500/25 dark:bg-amber-500/10">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Есть скрытые символы в тексте
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-amber-800/75 dark:text-amber-100/70">
            Можно убрать soft hyphen и zero-width без изменения видимого текста.
          </p>
          <button
            type="button"
            onClick={normalizeHiddenCharacters}
            className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/30 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-400/10"
          >
            Normalize hidden chars
          </button>
        </div>
      ) : null}

      {ege15Diagnostics ? (
        <div className="mt-4 border-t border-stroke pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground">ЕГЭ 15 quick parse</h4>
              <p className="mt-0.5 text-[11px] text-foreground/50">
                {ege15Diagnostics.cards.length} cards · accepted {ege15Diagnostics.accepted || 'empty'}
              </p>
            </div>
            <span className="font-mono text-[11px] text-foreground/45">
              {ege15Diagnostics.positions.join(', ') || 'no positions'}
            </span>
          </div>
          {ege15Diagnostics.cards.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-stroke bg-surface">
              {ege15Diagnostics.cards.map((card) => (
                <div
                  key={card.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] items-start gap-2 border-b border-stroke px-2.5 py-2 last:border-b-0"
                >
                  <span className="font-mono text-[11px] text-foreground/45">
                    {card.positionIndex ?? '-'}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {card.before}
                      <span className="mx-0.5 text-primary">?</span>
                      {card.after}
                    </div>
                    {card.explanationSnippet ? (
                      <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-foreground/55">
                        {card.explanationSnippet}
                      </div>
                    ) : null}
                  </div>
                  <span className="justify-self-end rounded-md border border-stroke bg-surface-strong px-1.5 py-0.5 text-[11px] font-semibold text-foreground/70">
                    {card.correctChoice === 'n' ? 'Н' : 'НН'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stroke px-3 py-2 text-xs text-foreground/55">
              Quick-карточки не собираются из текущего preview.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function QualityCheckRow({
  check,
  onOpenTarget,
}: {
  check: QualityCheck;
  onOpenTarget: (targetId: string) => void;
}) {
  const Icon =
    check.level === 'error'
      ? AlertCircle
      : check.level === 'warning'
        ? CircleDot
        : check.level === 'ok'
          ? CheckCircle2
          : Info;

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 text-xs leading-5">
      <Icon className={`mt-0.5 h-3.5 w-3.5 ${levelColor(check.level)}`} />
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-foreground/82">{check.label}</div>
          {check.targetId ? (
            <button
              type="button"
              onClick={() => onOpenTarget(check.targetId!)}
              className="shrink-0 rounded-md border border-stroke px-1.5 py-0.5 text-[10px] font-semibold text-foreground/55 transition hover:bg-surface hover:text-foreground"
            >
              Open
            </button>
          ) : null}
        </div>
        {check.detail ? <div className="text-foreground/50">{check.detail}</div> : null}
      </div>
    </div>
  );
}

function buildQualityChecks(
  form: Form,
  preview: { exercise: Exercise | null; error: string },
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const skillTags = parseCsv(form.skillTags);
  const approved = form.qualityStatus === 'approved';

  pushCheck(
    checks,
    Boolean(form.seedKey.trim()),
    'Seed key заполнен',
    'Seed нужен для стабильной очереди и дедупликации.',
    'admin-field-seed-key',
  );
  pushCheck(checks, Boolean(form.prompt.trim()), 'Формулировка заполнена', undefined, 'admin-field-prompt');
  pushCheck(checks, Boolean(form.explanation.trim()), 'Объяснение заполнено', undefined, 'admin-field-explanation');
  pushCheck(checks, skillTags.length > 0, 'Skill tags заданы', undefined, 'admin-field-skill-tags');
  pushCheck(checks, !preview.error, 'Preview собирается', preview.error || undefined);

  if (approved) {
    pushCheck(
      checks,
      Boolean(form.sourceAlignment.trim()),
      'Source alignment для approved',
      undefined,
      'admin-field-source-alignment',
    );
    pushCheck(
      checks,
      Boolean(form.typicalMistake.trim()),
      'Типичная ошибка для approved',
      undefined,
      'admin-field-typical-mistake',
    );
    pushCheck(
      checks,
      Boolean(form.algorithmSteps.trim()),
      'Algorithm steps для approved',
      undefined,
      'admin-field-algorithm-steps',
    );
  } else {
    checks.push({
      level: 'info',
      label: 'Approved gate не активен',
      detail: 'Полный чеклист включится при статусе approved.',
    });
  }

  if (containsInvisibleText(form)) {
    checks.push({
      level: 'warning',
      label: 'Найдены скрытые символы',
      detail: 'Soft hyphen или zero-width могут ломать quick-парсинг.',
    });
  }

  if (isEge15FillBlank(form)) {
    const diagnostics = buildEge15Diagnostics(preview.exercise);
    const rawPositions = extractPositions(`${form.fillBefore}${form.fillAfter}`);
    if (rawPositions.length === 0) {
      checks.push({
        level: 'error',
        label: 'ЕГЭ 15: нет нумерованных позиций',
        detail: 'Ожидается формат вроде установле(1)ы.',
        targetId: 'admin-field-fill-before',
      });
    }
    if (!/\d/u.test(form.fillAccepted)) {
      checks.push({
        level: 'error',
        label: 'ЕГЭ 15: accepted должен содержать цифры',
        detail: 'Например 23 или 1,4.',
        targetId: 'admin-field-fill-accepted',
      });
    }
    if (diagnostics && diagnostics.cards.length !== rawPositions.length) {
      checks.push({
        level: 'warning',
        label: 'ЕГЭ 15: quick-карточки не совпали с позициями',
        detail: `${diagnostics.cards.length} cards из ${rawPositions.length} позиций.`,
      });
    }
    if (diagnostics?.cards.length) {
      checks.push({
        level: 'ok',
        label: 'ЕГЭ 15 quick parse готов',
        detail: diagnostics.cards.map((card) => `${card.positionIndex}: ${card.correctWord}`).join(' · '),
      });
    }
  }

  return checks;
}

function buildEge15Diagnostics(exercise: Exercise | null) {
  if (!exercise || exercise.type !== 'fill_blank' || !exercise.skillTags.includes('ege.15')) {
    return null;
  }

  const cards = buildEge15QuickCards(exercise);
  return {
    cards,
    accepted: exercise.answer.accepted.join(', '),
    positions: extractPositions(`${exercise.payload.before}${exercise.payload.after}`),
  };
}

function pushCheck(
  checks: QualityCheck[],
  ok: boolean,
  label: string,
  detail?: string,
  targetId?: string,
) {
  checks.push({
    level: ok ? 'ok' : 'error',
    label,
    detail: ok ? undefined : detail,
    targetId: ok ? undefined : targetId,
  });
}

function parseCsv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function isEge15FillBlank(form: Form) {
  return form.type === 'fill_blank' && parseCsv(form.skillTags).includes('ege.15');
}

function containsInvisibleText(form: Form) {
  return [
    form.prompt,
    form.explanation,
    form.fillBefore,
    form.fillAfter,
    form.options.join('\n'),
  ].some((value) => INVISIBLE_TEXT_RE.test(value));
}

function stripInvisibleText(value: string) {
  return value.replace(INVISIBLE_TEXT_RE_GLOBAL, '');
}

function extractPositions(value: string) {
  return [...value.matchAll(NUMBERED_POSITION_RE)].map((match) => Number(match[1]));
}

function levelColor(level: CheckLevel) {
  switch (level) {
    case 'error':
      return 'text-red-600';
    case 'warning':
      return 'text-amber-600';
    case 'ok':
      return 'text-emerald-600';
    case 'info':
      return 'text-sky-600';
  }
}

function openInspectorTarget(targetId: string) {
  const element = document.getElementById(targetId);
  if (!element) return;

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    const focusable = element.matches('input, textarea, button, [tabindex]')
      ? element
      : element.querySelector('input, textarea, button, [tabindex]');
    if (focusable instanceof HTMLElement) {
      focusable.focus({ preventScroll: true });
    }
  }, 280);
}
