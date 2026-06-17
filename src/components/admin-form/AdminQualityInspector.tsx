'use client';

import { AlertCircle, CheckCircle2, CircleDot, Copy, Info } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { buildEge13QuickCards } from '@/features/exercises/ege13Quick';
import { buildEge9BlitzCards } from '@/features/exercises/ege9Blitz';
import { buildEge15QuickDiagnostics } from '@/features/exercises/ege15Quick';
import { buildStructuredFeedbackDiagnostics } from '@/features/exercises/checkers/structuredFeedback';
import type { Exercise } from '@/features/exercises/schemas';
import { copyTextToClipboard } from '@/lib/clipboard';
import CompactMarkdown from './markdown/CompactMarkdown';
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
  const ege9Diagnostics = buildEge9Diagnostics(preview.exercise);
  const ege13Diagnostics = buildEge13Diagnostics(preview.exercise);
  const ege15Diagnostics = buildEge15Diagnostics(preview.exercise);
  const structuredFeedbackDiagnostics = buildStructuredFeedbackDiagnostics(preview.exercise);
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
    <section className="rounded-3xl border border-stroke bg-surface-strong p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quality inspector</h3>
          <p className="mt-0.5 text-pretty text-xs leading-5 text-foreground/70">
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
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-500/25 dark:bg-amber-500/10">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Есть скрытые символы в тексте
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-amber-800/75 dark:text-amber-100/70">
            Можно убрать soft hyphen и zero-width без изменения видимого текста.
          </p>
          <button
            type="button"
            onClick={normalizeHiddenCharacters}
            className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:border-amber-400/30 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-400/10"
          >
            Normalize hidden chars
          </button>
        </div>
      ) : null}

      {ege9Diagnostics ? (
        <div className="mt-4 border-t border-stroke pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground">ЕГЭ 9 blitz parse</h4>
              <p className="mt-0.5 text-[11px] text-foreground/70">
                {ege9Diagnostics.cards.length} cards · {ege9Diagnostics.exactCount} exact ·{' '}
                {ege9Diagnostics.fuzzyCount} fuzzy
              </p>
            </div>
            <span className="rounded-md border border-stroke bg-surface px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground/70">
              max d={ege9Diagnostics.maxDistance}
            </span>
          </div>
          {ege9Diagnostics.suspiciousCards.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-stroke bg-surface">
              {ege9Diagnostics.suspiciousCards.map((card) => {
                const command = buildEge9QuickSeedCommand(card);
                return (
                  <div
                    key={card.id}
                    className="grid grid-cols-[minmax(0,1fr)_2rem] items-start gap-2 border-b border-stroke px-2.5 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">
                        row {card.rowIndex} · word {card.wordIndex} · d={card.resolution.distance}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-foreground/70">
                        {card.resolution.displayMaskedWord} -&gt; {card.resolution.donorWord}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyTextToClipboard(command)}
                      className="inline-flex size-7 items-center justify-center justify-self-end rounded-lg text-foreground/45 transition-[background-color,color,transform] duration-150 ease-out hover:bg-stroke hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]"
                      aria-label={`Скопировать qseed для ряда ${card.rowIndex}, слова ${card.wordIndex}`}
                      title={command}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stroke px-3 py-2 text-xs text-foreground/70">
              Подозрительных fuzzy-карточек нет.
            </p>
          )}
        </div>
      ) : null}

      {ege13Diagnostics ? (
        <div className="mt-4 border-t border-stroke pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground">ЕГЭ 13 quick parse</h4>
              <p className="mt-0.5 text-[11px] text-foreground/70">
                {ege13Diagnostics.cards.length} cards · {ege13Diagnostics.rowCount} row ·{' '}
                {ege13Diagnostics.fallbackCount} fallback
              </p>
            </div>
            <span className="rounded-md border border-stroke bg-surface px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground/70">
              {ege13Diagnostics.mediumCount} medium
            </span>
          </div>
          {ege13Diagnostics.fallbackCards.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-stroke bg-surface">
              {ege13Diagnostics.fallbackCards.map((card) => {
                const command = buildEge13QuickSeedCommand(card);
                return (
                  <div
                    key={card.id}
                    className="grid grid-cols-[minmax(0,1fr)_2rem] items-start gap-2 border-b border-stroke px-2.5 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">
                        row {card.rowIndex} · {card.resolution.kind}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-foreground/70">
                        {card.token} · {card.correctChoice === 'joined' ? 'слитно' : 'раздельно'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyTextToClipboard(command)}
                      className="inline-flex size-7 items-center justify-center justify-self-end rounded-lg text-foreground/45 transition-[background-color,color,transform] duration-150 ease-out hover:bg-stroke hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]"
                      aria-label={`Скопировать qseed для ЕГЭ 13, ряда ${card.rowIndex}`}
                      title={command}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stroke px-3 py-2 text-xs text-foreground/70">
              Fallback-карточек нет.
            </p>
          )}
        </div>
      ) : null}

      {ege15Diagnostics ? (
        <div className="mt-4 border-t border-stroke pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground">ЕГЭ 15 quick parse</h4>
              <p className="mt-0.5 text-[11px] text-foreground/70">
                {ege15Diagnostics.cards.length} cards · {ege15Diagnostics.numberedCount} numbered ·{' '}
                {ege15Diagnostics.simpleCount} simple
              </p>
            </div>
            <span className="rounded-md border border-stroke bg-surface px-1.5 py-0.5 font-mono text-[11px] text-foreground/70">
              {ege15Diagnostics.promptKind ? `prompt ${ege15Diagnostics.promptKind}` : 'no prompt'}
            </span>
          </div>
          {ege15Diagnostics.skippedReasons.length > 0 ? (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-mono text-[11px] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
              {ege15Diagnostics.skippedReasons.join(' · ')}
            </p>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-1.5 text-[11px] text-foreground/65">
            <span className="rounded-md border border-stroke bg-surface px-1.5 py-0.5">
              positions {ege15Diagnostics.positions.join(', ') || '-'}
            </span>
            <span className="rounded-md border border-stroke bg-surface px-1.5 py-0.5">
              accepted {ege15Diagnostics.accepted || 'empty'}
            </span>
          </div>
          {ege15Diagnostics.cards.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-stroke bg-surface">
              {ege15Diagnostics.cards.map((card) => (
                <div
                  key={card.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] items-start gap-2 border-b border-stroke px-2.5 py-2 last:border-b-0"
                >
                  <span className="font-mono text-[11px] text-foreground/70">
                    {card.positionIndex ?? '-'}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {card.before}
                      <span className="mx-0.5 text-primary">?</span>
                      {card.after}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-foreground/55">
                      {card.resolution.kind}
                      {card.resolution.kind === 'numbered_gap'
                        ? ` · prompt ${card.resolution.promptKind}`
                        : ' · direct'}
                    </div>
                    {card.explanationSnippet ? (
                      <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-foreground/70">
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
            <p className="rounded-lg border border-dashed border-stroke px-3 py-2 text-xs text-foreground/70">
              Quick-карточки не собираются из текущего preview.
            </p>
          )}
        </div>
      ) : null}

      {structuredFeedbackDiagnostics ? (
        <div className="mt-4 border-t border-stroke pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground">Structured feedback</h4>
              <p className="mt-0.5 text-[11px] text-foreground/70">
                {structuredFeedbackDiagnostics.source} ·{' '}
                {structuredFeedbackDiagnostics.correctAnswerLines.length} answer lines ·{' '}
                {structuredFeedbackDiagnostics.detailedExplanationLines.length} explanation lines
              </p>
            </div>
            <span
              className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${
                structuredFeedbackDiagnostics.warnings.length > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100'
                  : 'border-stroke bg-surface text-foreground/70'
              }`}
            >
              {structuredFeedbackDiagnostics.warnings.length > 0
                ? `${structuredFeedbackDiagnostics.warnings.length} warn`
                : 'ok'}
            </span>
          </div>
          {structuredFeedbackDiagnostics.warnings.length > 0 ? (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-mono text-[11px] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
              {structuredFeedbackDiagnostics.warnings.join(' · ')}
            </p>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-1.5 text-[11px] text-foreground/65">
            {structuredFeedbackDiagnostics.targetIndexes.length > 0 ? (
              <span className="rounded-md border border-stroke bg-surface px-1.5 py-0.5">
                target {structuredFeedbackDiagnostics.targetIndexes.join(', ')}
              </span>
            ) : null}
            {structuredFeedbackDiagnostics.extractedRowIndexes.length > 0 ? (
              <span className="rounded-md border border-stroke bg-surface px-1.5 py-0.5">
                rows {structuredFeedbackDiagnostics.extractedRowIndexes.join(', ')}
              </span>
            ) : null}
            {structuredFeedbackDiagnostics.missingTargetRows.length > 0 ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
                missing {structuredFeedbackDiagnostics.missingTargetRows.join(', ')}
              </span>
            ) : null}
          </div>
          {structuredFeedbackDiagnostics.correctAnswerLines.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-stroke bg-surface">
              {structuredFeedbackDiagnostics.correctAnswerLines.slice(0, 5).map((line, index) => (
                <div
                  key={`${index}:${line}`}
                  className="border-b border-stroke px-2.5 py-2 text-xs leading-5 text-foreground/78 last:border-b-0"
                >
                  <CompactMarkdown>{line}</CompactMarkdown>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stroke px-3 py-2 text-xs text-foreground/70">
              Structured feedback не собирается из текущего preview.
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
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 rounded-lg px-1 py-1 text-xs leading-5 transition-colors duration-150 ease-out hover:bg-stroke/70 dark:hover:bg-stroke/70">
      <Icon className={`mt-0.5 h-3.5 w-3.5 ${levelColor(check.level)}`} />
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-foreground/82">{check.label}</div>
          {check.targetId ? (
            <button
              type="button"
              onClick={() => onOpenTarget(check.targetId!)}
              className="shrink-0 rounded-md border border-stroke px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70 transition-[background-color,color,transform] duration-150 ease-out hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
            >
              Open
            </button>
          ) : null}
        </div>
        {check.detail ? <div className="text-pretty text-foreground/70">{check.detail}</div> : null}
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

  const structuredFeedbackDiagnostics = buildStructuredFeedbackDiagnostics(preview.exercise);
  if (structuredFeedbackDiagnostics && structuredFeedbackDiagnostics.source !== 'none') {
    checks.push({
      level: structuredFeedbackDiagnostics.warnings.length > 0 ? 'warning' : 'ok',
      label: 'Structured feedback',
      detail:
        structuredFeedbackDiagnostics.warnings.length > 0
          ? structuredFeedbackDiagnostics.warnings.join(' · ')
          : `${structuredFeedbackDiagnostics.correctAnswerLines.length} answer lines · ${structuredFeedbackDiagnostics.detailedExplanationLines.length} explanation lines.`,
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

  if (isEge9MultiSelect(form)) {
    const diagnostics = buildEge9Diagnostics(preview.exercise);
    if (!diagnostics || diagnostics.cards.length === 0) {
      checks.push({
        level: 'warning',
        label: 'ЕГЭ 9: blitz-карточки не собираются',
        detail: 'Проверь options и строки объяснения.',
      });
    } else {
      checks.push({
        level: diagnostics.suspiciousCards.length > 0 ? 'warning' : 'ok',
        label: 'ЕГЭ 9 blitz parse',
        detail: `${diagnostics.cards.length} cards · ${diagnostics.exactCount} exact · ${diagnostics.fuzzyCount} fuzzy.`,
      });
      if (diagnostics.suspiciousCards.length > 0) {
        checks.push({
          level: 'warning',
          label: 'ЕГЭ 9: есть подозрительные fuzzy-карточки',
          detail: diagnostics.suspiciousCards
            .slice(0, 3)
            .map(
              (card) =>
                `row ${card.rowIndex} word ${card.wordIndex}: ${card.resolution.displayMaskedWord} -> ${card.resolution.donorWord}, d=${card.resolution.distance}`,
            )
            .join(' · '),
        });
      }
    }
  }

  if (isEge13MultiSelect(form)) {
    const diagnostics = buildEge13Diagnostics(preview.exercise);
    if (!diagnostics || diagnostics.cards.length === 0) {
      checks.push({
        level: 'warning',
        label: 'ЕГЭ 13: quick-карточки не собираются',
        detail: 'Проверь options с (НЕ)/(НИ) и строки объяснения.',
      });
    } else {
      checks.push({
        level: diagnostics.fallbackCards.length > 0 ? 'warning' : 'ok',
        label: 'ЕГЭ 13 quick parse',
        detail: `${diagnostics.cards.length} cards · ${diagnostics.rowCount} row · ${diagnostics.fallbackCount} fallback.`,
      });
      if (diagnostics.fallbackCards.length > 0) {
        checks.push({
          level: 'warning',
          label: 'ЕГЭ 13: есть fallback-карточки',
          detail: diagnostics.fallbackCards
            .slice(0, 3)
            .map((card) => `row ${card.rowIndex}: ${card.token}, ${card.resolution.kind}`)
            .join(' · '),
        });
      }
    }
  }

  return checks;
}

function buildEge9Diagnostics(exercise: Exercise | null) {
  if (!exercise || exercise.type !== 'ege_multi_select' || !exercise.skillTags.includes('ege.9')) {
    return null;
  }

  const cards = buildEge9BlitzCards(exercise);
  const exactCount = cards.filter((card) => card.resolution.kind === 'exact').length;
  const fuzzyCount = cards.length - exactCount;
  const suspiciousCards = cards.filter(
    (card) => card.resolution.kind === 'fuzzy' && card.resolution.distance >= 2,
  );

  return {
    cards,
    exactCount,
    fuzzyCount,
    suspiciousCards,
    maxDistance: cards.reduce(
      (maxDistance, card) => Math.max(maxDistance, card.resolution.distance),
      0,
    ),
  };
}

function buildEge13Diagnostics(exercise: Exercise | null) {
  if (!exercise || exercise.type !== 'ege_multi_select' || !exercise.skillTags.includes('ege.13')) {
    return null;
  }

  const cards = buildEge13QuickCards(exercise);
  const fallbackCards = cards.filter((card) => card.resolution.source === 'fallback');
  const rowCount = cards.length - fallbackCards.length;

  return {
    cards,
    fallbackCards,
    rowCount,
    fallbackCount: fallbackCards.length,
    mediumCount: cards.filter((card) => card.resolution.confidence === 'medium').length,
  };
}

function buildEge15Diagnostics(exercise: Exercise | null) {
  if (!exercise || exercise.type !== 'fill_blank' || !exercise.skillTags.includes('ege.15')) {
    return null;
  }

  const diagnostics = buildEge15QuickDiagnostics(exercise);
  return {
    ...diagnostics,
    accepted: exercise.answer.accepted.join(', '),
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

function isEge9MultiSelect(form: Form) {
  return form.type === 'ege_multi_select' && parseCsv(form.skillTags).includes('ege.9');
}

function isEge13MultiSelect(form: Form) {
  return form.type === 'ege_multi_select' && parseCsv(form.skillTags).includes('ege.13');
}

function buildEge9QuickSeedCommand(
  card: ReturnType<typeof buildEge9BlitzCards>[number],
) {
  return `/qseed blitz ${card.seedKey ?? ''} row=${card.rowIndex} word=${card.wordIndex}`;
}

function buildEge13QuickSeedCommand(
  card: ReturnType<typeof buildEge13QuickCards>[number],
) {
  return `/qseed ege13 ${card.seedKey ?? ''} row=${card.rowIndex}`;
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
