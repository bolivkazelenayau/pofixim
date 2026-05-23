import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sql = postgres(connectionString);

function cleanText(value) {
  return String(value ?? '')
    .replace(/[\p{Cf}]/gu, '')
    .replace(/[\u2011\u2012\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\.\s+\./g, '..')
    .replace(/\s+/g, ' ')
    .replace(/([А-Яа-яЁёA-Za-z])\s*\.\.\s*([А-Яа-яЁёA-Za-z])/g, '$1..$2')
    .replace(/\s*([,;:!?()])\s*/g, '$1 ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .replace(/\. \./g, '..')
    .trim();
}

async function main() {
  const rows = await sql`
    select id, seed_key, prompt, payload, explanation
    from exercises
    where type='ege_multi_select'
      and skill_tags @> array['ege.9']::text[]
      and skill_tags @> array['live.harvested']::text[]
  `;

  const changes = [];
  for (const row of rows) {
    const payload = row.payload ?? {};
    const options = Array.isArray(payload.options)
      ? payload.options.map((o) => cleanText(o))
      : [];
    const nextPrompt = cleanText(row.prompt);
    const nextExplanation = cleanText(row.explanation);
    const nextPayload = { ...payload, options };

    const changed =
      nextPrompt !== row.prompt ||
      nextExplanation !== row.explanation ||
      JSON.stringify(nextPayload) !== JSON.stringify(payload);
    if (!changed) continue;

    changes.push({
      id: row.id,
      prompt: nextPrompt,
      explanation: nextExplanation,
      payload: nextPayload,
    });
  }

  console.log(`Scanned: ${rows.length}`);
  console.log(`To change: ${changes.length}`);
  if (!APPLY) {
    console.log('Dry run complete. Add --apply to write changes.');
    return;
  }

  for (const item of changes) {
    await sql`
      update exercises
      set
        prompt = ${item.prompt},
        explanation = ${item.explanation},
        payload = ${sql.json(item.payload)},
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
