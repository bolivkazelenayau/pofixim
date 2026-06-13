import { stripEge18PromptFromFillBefore } from '@/lib/exercise-type-conversion';
import {
  extractNumberedExplanationRows,
  normalizeMorphemeMarkdownSpacing,
  shouldNormalizeEge10Form,
  shouldStripEge18FillBeforePrompt,
  splitEge10FeedbackRows,
} from './feedback';
import { isAdminDebugEnabled } from './debug';
import type { Form } from './types';

type StoredDraftEnvelope = {
  sessionId: string | null;
  savedAt: string;
  form: Form;
};

export function normalizeFormForEditor(form: Form): Form {
  const nextForm = shouldStripEge18FillBeforePrompt(form)
    ? {
        ...form,
        fillBefore: stripEge18PromptFromFillBefore(form.fillBefore, form.prompt),
      }
    : form;

  if (!shouldNormalizeEge10Form(nextForm)) return nextForm;
  const explanationRows = extractNumberedExplanationRows(nextForm.explanation).map(
    normalizeMorphemeMarkdownSpacing,
  );
  const rows = splitEge10FeedbackRows(explanationRows, nextForm.options.length);
  return {
    ...nextForm,
    explanation: rows.explanationRows.length
      ? rows.explanationRows.join('\n')
      : normalizeMorphemeMarkdownSpacing(nextForm.explanation),
  };
}

export function getDraftKey(id?: number | string | null) {
  return id ? `admin_form_draft_${id}` : 'admin_form_draft_new';
}

function randomDraftSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

export function getDraftSessionId() {
  if (typeof window === 'undefined') return null;
  const key = 'admin_draft_session_id';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const nextValue = randomDraftSessionId();
  window.sessionStorage.setItem(key, nextValue);
  return nextValue;
}

export function logDraftRecoveryDebug(event: string, details?: Record<string, unknown>) {
  if (!isAdminDebugEnabled()) return;
  console.info(`[admin-draft] ${event}`, details ?? {});
}

function parseStoredDraft(raw: string, targetId: number | null) {
  try {
    const parsed = JSON.parse(raw) as Form | StoredDraftEnvelope;
    if (!parsed || typeof parsed !== 'object') return null;

    if ('form' in parsed) {
      const form = parsed.form;
      if (!form || typeof form !== 'object') return null;
      if (targetId !== null && form.id !== targetId) return null;
      return {
        form: normalizeFormForEditor(form),
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      };
    }

    if (targetId !== null && parsed.id !== targetId) return null;
    return {
      form: normalizeFormForEditor(parsed as Form),
      sessionId: null,
    };
  } catch {
    return null;
  }
}

export function writeStoredDraft(targetId: number | null, form: Form) {
  if (typeof window === 'undefined') return;
  const sessionId = getDraftSessionId();
  const envelope: StoredDraftEnvelope = {
    sessionId,
    savedAt: new Date().toISOString(),
    form,
  };
  window.localStorage.setItem(getDraftKey(targetId), JSON.stringify(envelope));
  logDraftRecoveryDebug('writeStoredDraft', {
    targetId,
    formId: form.id ?? null,
    sessionId,
    type: form.type,
  });
}

export function loadFormState(targetId: number | null, baseForm: Form) {
  if (targetId != null) {
    return normalizeFormForEditor(baseForm);
  }
  const key = getDraftKey(targetId);
  const draft = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  if (draft) {
    try {
      const parsed = parseStoredDraft(draft, targetId);
      if (parsed) {
        return parsed.form;
      }
    } catch (error) {
      console.error(`Failed to parse ${key}`, error);
    }
  }
  return normalizeFormForEditor(baseForm);
}

export function readStoredDraft(targetId: number | null) {
  const raw = typeof window !== 'undefined' ? localStorage.getItem(getDraftKey(targetId)) : null;
  if (!raw) return null;
  try {
    const parsed = parseStoredDraft(raw, targetId);
    return parsed;
  } catch (error) {
    console.error(`Failed to parse ${getDraftKey(targetId)}`, error);
    return null;
  }
}
