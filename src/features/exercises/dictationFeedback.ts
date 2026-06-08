type DictationDiffItem =
  | { kind: 'equal'; expected: string; actual: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; actual: string }
  | { kind: 'replace'; expected: string; actual: string };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dictationDisplayToken(item: DictationDiffItem) {
  if (item.kind === 'extra') return item.actual;
  if (item.kind === 'replace') return item.actual;
  return item.expected;
}

function needsLeadingSpace(previous: string | null, current: string) {
  if (!previous) return false;
  if (/^[.,!?;:)]$/u.test(current)) return false;
  if (/^[(]$/u.test(previous)) return false;
  return true;
}

export function buildDictationFeedbackText(normalizedAnswer: unknown) {
  const diff = (
    normalizedAnswer &&
    typeof normalizedAnswer === 'object' &&
    Array.isArray((normalizedAnswer as { diff?: unknown }).diff)
      ? (normalizedAnswer as { diff: DictationDiffItem[] }).diff
      : []
  ).filter((item) => item && typeof item.kind === 'string');
  const mistakeCount = diff.filter((item) => item.kind !== 'equal').length;

  if (mistakeCount === 0) return 'Верно.';

  const body = diff
    .map((item, index) => {
      const label = dictationDisplayToken(item);
      const previous = index > 0 ? dictationDisplayToken(diff[index - 1]) : null;
      const space = needsLeadingSpace(previous, label) ? ' ' : '';
      if (item.kind === 'equal') return `${space}${escapeHtml(label)}`;
      if (item.kind === 'missing') {
        return `${space}<span class="dictation-diff__token dictation-diff__token--missing">[${escapeHtml(item.expected)}]</span>`;
      }
      if (item.kind === 'extra') {
        return `${space}<span class="dictation-diff__token dictation-diff__token--extra">${escapeHtml(item.actual)}</span>`;
      }
      return `${space}<span class="dictation-diff__token dictation-diff__token--replace" title="Должно быть: ${escapeHtml(item.expected)}">${escapeHtml(item.actual)}</span>`;
    })
    .join('');

  return `<div class="dictation-diff"><div class="dictation-diff__title">Ошибок: ${mistakeCount}</div>${body}</div>`;
}
