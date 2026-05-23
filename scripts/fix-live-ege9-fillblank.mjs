import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sql = postgres(connectionString);

function normalizeSpaces(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function dehyphenate(value) {
  return String(value ?? '').replace(/\u00ad/g, '');
}

function parseOptionsFromPrompt(prompt) {
  const clean = normalizeSpaces(dehyphenate(prompt));
  const strictMatches = [...clean.matchAll(/([1-5])\)\s*([^]+?)(?=(?:\s*[1-5]\)\s*)|$)/g)];
  if (strictMatches.length >= 5) {
    return strictMatches.slice(0, 5).map((m) => normalizeSpaces(m[2]));
  }

  const chunks = clean.split(/\s*([1-5])\)\s*/g);
  const options = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const idx = chunks[i];
    const text = chunks[i + 1];
    if (!idx || !text) continue;
    options.push(normalizeSpaces(text));
    if (options.length === 5) break;
  }
  return options;
}

function parseTargetSet(answer) {
  const accepted = Array.isArray(answer?.accepted) ? answer.accepted.map(String) : [];
  const raw = accepted[0] ?? '';
  const digits = [...raw.replace(/[^\d]/g, '')]
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return [...new Set(digits)].sort((a, b) => a - b);
}

function toMultiSelectPayload(row) {
  const options = parseOptionsFromPrompt(row.prompt);
  if (options.length !== 5) return null;

  const targetSet = parseTargetSet(row.answer);
  if (!targetSet.length) return null;
  const signature = targetSet.join('');

  return {
    type: 'ege_multi_select',
    prompt:
      'Укажите варианты ответов, в которых во всех словах одного ряда пропущена **одна и та же буква**. Запишите номера ответов.',
    payload: { options },
    answer: {
      rawAnswerText: signature,
      acceptedAnswers: [signature],
      targetSet,
    },
  };
}

async function main() {
  const rows = await sql`
    select id, seed_key, type, prompt, payload, answer, skill_tags
    from exercises
    where type = 'fill_blank'
      and skill_tags @> array['ege.9']::text[]
      and skill_tags @> array['live.harvested']::text[]
  `;

  const fixes = [];
  const failed = [];
  for (const row of rows) {
    const converted = toMultiSelectPayload(row);
    if (!converted) {
      failed.push({ id: row.id, seedKey: row.seed_key });
      continue;
    }
    fixes.push({ id: row.id, seedKey: row.seed_key, ...converted });
  }

  console.log(`Candidates: ${rows.length}`);
  console.log(`Convertible: ${fixes.length}`);
  console.log(`Failed parse: ${failed.length}`);
  if (failed.length) {
    console.log('Failed sample:', JSON.stringify(failed.slice(0, 10), null, 2));
  }

  if (!APPLY) {
    console.log('Dry run complete. Add --apply to write changes.');
    return;
  }

  for (const item of fixes) {
    await sql`
      update exercises
      set
        type = ${item.type},
        prompt = ${item.prompt},
        payload = ${sql.json(item.payload)},
        answer = ${sql.json(item.answer)},
        updated_at = now()
      where id = ${item.id}
    `;
  }

  console.log('Done.');
}

try {
  await main();
} finally {
  await sql.end();
}
