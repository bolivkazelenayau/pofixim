import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DELETE_INCOMPLETE = process.argv.includes('--delete-incomplete');
const sql = postgres(connectionString);

function normalizeSpaces(value) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+,/g, ',')
    .trim();
}

function hasBrokenExplanation(text) {
  if (!text || text.length < 50) return true;
  const badTail = /(https?:\/\/\S*$)|(\*\*\d+\.\s*Тип\s*9\s*№?\s*\[?$)/i.test(text);
  const brokenLink = /\[[^\]]*$/.test(text);
  return badTail || brokenLink;
}

function boldMissingLetter(explanationLine) {
  return explanationLine.replace(/([А-Яа-яЁёA-Za-z])\s*\*\*(.)\*\*([А-Яа-яЁёA-Za-z])/g, '$1**$2**$3');
}

function normalizePrompt(prompt) {
  const hasQuestion = /\?/u.test(prompt ?? '');
  if (hasQuestion) {
    return 'Укажите варианты ответов, в которых во всех словах одного ряда пропущена **одна и та же буква**. Запишите номера ответов.';
  }
  let out = normalizeSpaces(prompt);
  out = out.replace(/\*{3,}/g, '**');
  return out;
}

function normalizeOptions(options) {
  const firstFive = Array.isArray(options) ? options.slice(0, 5) : [];
  return firstFive.map((o) => normalizeSpaces(String(o)));
}

function expandAbbreviations(text) {
  return text.replace(
    /(^|[^\u0400-\u04FF])(\u041f\u0413|\u041d\u0413|\u0427\u0413)(?=[^\u0400-\u04FF]|$)/gu,
    (full, lead, abbr) => {
      if (abbr === '\u041f\u0413') return `${lead}проверяемая гласная`;
      if (abbr === '\u041d\u0413') return `${lead}непроверяемая гласная`;
      return `${lead}чередующаяся гласная`;
    },
  );
}

function normalizeExplanation(explanation) {
  let out = explanation ?? '';
  out = out.replace(/^\s*\*\*\s*/u, '');
  out = out.replace(/^\s*Пояснение\.\s*/iu, '');
  out = out.replace(/^\s*Вставим пропущенные буквы\.\s*/iu, '');
  out = normalizeSpaces(out);
  out = out.replace(/\s*Ответ:\s*[\d,.\s]+.*$/iu, '');
  out = out.replace(/\s*Источники?:\s*.*$/iu, '');
  out = out.replace(/\s*Правило:\s*.*$/iu, '');
  out = out.replace(/\s+([1-5]\))/g, '\n$1');
  out = out.replace(/([.;])\s+([1-5]\))/g, '$1\n$2');
  out = out.replace(/\*{3,}/g, '**');
  out = out.replace(/\s*—\s*/g, ' — ');
  out = out
    .split('\n')
    .map((line) => boldMissingLetter(normalizeSpaces(line)))
    .filter(Boolean)
    .join('\n');
  out = expandAbbreviations(out);
  if (!/^Привед[её]м верное написание/i.test(out)) {
    out = `Приведём верное написание:\n${out}`;
  }
  return out;
}

function isType9(row) {
  if (!row?.skill_tags) return false;
  return row.skill_tags.includes('ege.9');
}

async function main() {
  const rows = await sql`
    select id, seed_key, prompt, payload, explanation, skill_tags, is_active
    from exercises
    where type = 'ege_multi_select'
  `;

  const target = rows.filter(isType9);
  const changes = [];
  const incompletes = [];

  for (const row of target) {
    const prompt = normalizePrompt(row.prompt ?? '');
    const payload = row.payload ?? {};
    const options = normalizeOptions(payload.options ?? []);
    const explanation = normalizeExplanation(row.explanation ?? '');
    const broken = hasBrokenExplanation(explanation);
    const nextActive = broken ? false : row.is_active;

    const changed =
      prompt !== row.prompt ||
      JSON.stringify(options) !== JSON.stringify(payload.options ?? []) ||
      explanation !== row.explanation ||
      nextActive !== row.is_active;

    if (!changed) continue;

    const nextPayload = { ...payload, options };
    changes.push({
      id: row.id,
      seedKey: row.seed_key,
      prompt,
      payload: nextPayload,
      explanation,
      isActive: nextActive,
      broken,
    });
    if (broken) incompletes.push({ id: row.id, seedKey: row.seed_key });
  }

  console.log(`Type-9 rows scanned: ${target.length}`);
  console.log(`Rows to change: ${changes.length}`);
  console.log(`Incomplete explanations: ${incompletes.length}`);

  if (!APPLY) {
    console.log('Dry run complete. Add --apply to write changes.');
    return;
  }

  for (const item of changes) {
    await sql`
      update exercises
      set
        prompt = ${item.prompt},
        payload = ${sql.json(item.payload)},
        explanation = ${item.explanation},
        is_active = ${item.isActive},
        updated_at = now()
      where id = ${item.id}
    `;
  }

  if (DELETE_INCOMPLETE && incompletes.length > 0) {
    const ids = incompletes.map((x) => x.id);
    await sql`delete from exercises where id = any(${ids})`;
    console.log(`Deleted incomplete rows: ${ids.length}`);
  }

  console.log('Done.');
}

try {
  await main();
} finally {
  await sql.end();
}
