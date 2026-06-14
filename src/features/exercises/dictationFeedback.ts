type DictationDiffItem =
  | { kind: 'equal'; expected: string; actual: string }
  | { kind: 'missing'; expected: string }
  | { kind: 'extra'; actual: string }
  | { kind: 'replace'; expected: string; actual: string };

type DictationDisplayItem =
  | { kind: 'equal'; label: string }
  | { kind: 'missing'; label: string }
  | { kind: 'missing_punctuation'; label: string }
  | { kind: 'extra'; label: string }
  | { kind: 'replace'; label: string; expected: string }
  | { kind: 'replace_phrase'; label: string; expected: string };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function needsLeadingSpace(previous: string | null, current: string) {
  if (!previous) return false;
  if (/^[.,!?;:)]$/u.test(current)) return false;
  if (/^[(]$/u.test(previous)) return false;
  return true;
}

function isPunctuationToken(value: string) {
  return /^[.,!?;:"()]$/u.test(value);
}

function joinDictationTokens(tokens: string[]) {
  return tokens.reduce((result, token) => {
    if (!result) return token;
    return needsLeadingSpace(result.at(-1) ?? null, token)
      ? `${result} ${token}`
      : `${result}${token}`;
  }, '');
}

function expectedToken(item: DictationDiffItem) {
  return item.kind === 'extra' ? null : item.expected;
}

function actualToken(item: DictationDiffItem) {
  return item.kind === 'missing' ? null : item.actual;
}

function buildDisplayItems(diff: DictationDiffItem[]): DictationDisplayItem[] {
  const items: DictationDisplayItem[] = [];

  for (let index = 0; index < diff.length; index += 1) {
    const item = diff[index];
    if (!item || item.kind === 'equal') {
      if (item?.kind === 'equal') items.push({ kind: 'equal', label: item.expected });
      continue;
    }

    const run: DictationDiffItem[] = [];
    while (index < diff.length && diff[index]?.kind !== 'equal') {
      run.push(diff[index]);
      index += 1;
    }
    index -= 1;

    if (run.length === 1) {
      const [single] = run;
      if (single.kind === 'missing') {
        items.push({
          kind: isPunctuationToken(single.expected) ? 'missing_punctuation' : 'missing',
          label: single.expected,
        });
      } else if (single.kind === 'extra') {
        items.push({ kind: 'extra', label: single.actual });
      } else {
        items.push({
          kind: 'replace',
          label: single.actual,
          expected: single.expected,
        });
      }
      continue;
    }

    const actual = joinDictationTokens(
      run.map(actualToken).filter((token): token is string => Boolean(token)),
    );
    const expected = joinDictationTokens(
      run.map(expectedToken).filter((token): token is string => Boolean(token)),
    );

    if (!actual && expected) {
      items.push({
        kind: expected.split('').every(isPunctuationToken) ? 'missing_punctuation' : 'missing',
        label: expected,
      });
    } else if (actual && !expected) {
      items.push({ kind: 'extra', label: actual });
    } else if (actual && expected) {
      items.push({ kind: 'replace_phrase', label: actual, expected });
    }
  }

  return items;
}

function formatDictationExplanation(explanation: string | undefined) {
  const trimmed = explanation?.trim();
  if (!trimmed) return '';

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');

  return `<div class="dictation-feedback__explanation"><div class="dictation-feedback__explanation-title">Разбор</div>${paragraphs}</div>`;
}

export function buildDictationFeedbackText(
  normalizedAnswer: unknown,
  explanation?: string,
) {
  const diff = (
    normalizedAnswer &&
    typeof normalizedAnswer === 'object' &&
    Array.isArray((normalizedAnswer as { diff?: unknown }).diff)
      ? (normalizedAnswer as { diff: DictationDiffItem[] }).diff
      : []
  ).filter((item) => item && typeof item.kind === 'string');
  const displayItems = buildDisplayItems(diff);
  const mistakeCount = displayItems.filter((item) => item.kind !== 'equal').length;

  if (mistakeCount === 0) return 'Верно.';

  const body = displayItems
    .map((item, index) => {
      const label = item.label;
      const previous = index > 0 ? displayItems[index - 1]?.label ?? null : null;
      const space = needsLeadingSpace(previous, label) ? ' ' : '';
      if (item.kind === 'equal') return `${space}${escapeHtml(label)}`;
      if (item.kind === 'missing') {
        return `${space}<span class="dictation-diff__token dictation-diff__token--missing">${escapeHtml(label)}</span>`;
      }
      if (item.kind === 'missing_punctuation') {
        return `${space}<span class="dictation-diff__punctuation-missing" title="Пропущен знак: ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
      }
      if (item.kind === 'extra') {
        return `${space}<span class="dictation-diff__token dictation-diff__token--extra">${escapeHtml(label)}</span>`;
      }
      if (item.kind === 'replace_phrase') {
        return `${space}<span class="dictation-diff__token dictation-diff__token--replace-phrase" title="Должно быть: ${escapeHtml(item.expected)}">${escapeHtml(label)}</span>`;
      }
      return `${space}<span class="dictation-diff__token dictation-diff__token--replace" title="Должно быть: ${escapeHtml(item.expected)}">${escapeHtml(label)}</span>`;
    })
    .join('');

  return `<div class="dictation-feedback"><div class="dictation-diff"><div class="dictation-diff__title">Ошибок: ${mistakeCount}</div>${body}</div>${formatDictationExplanation(explanation)}</div>`;
}
