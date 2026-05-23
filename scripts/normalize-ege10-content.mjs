import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sql = postgres(connectionString);
const rulesPath = path.resolve(process.cwd(), 'scripts', 'rules', 'ege-orthography-2026.type10.json');
const rules = JSON.parse(await readFile(rulesPath, 'utf8'));

function normalizeSpaces(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+,/g, ',')
    .trim();
}

function normalizePrompt(prompt) {
  let out = normalizeSpaces(prompt);
  out = out.replace(/одна и та же буква/gi, '**одна и та же буква**');
  return out;
}

function normalizeOptions(options) {
  const firstFive = Array.isArray(options) ? options.slice(0, 5) : [];
  return firstFive.map((o) => normalizeSpaces(String(o)));
}

function normalizeExplanation(text) {
  let out = String(text ?? '');
  out = out.replace(/^\s*\*\*\s*/u, '');
  out = out.replace(/^\s*Пояснение\.\s*/iu, '');
  out = out.replace(/\s*Ответ:\s*[\d,.\s]+.*$/iu, '');
  out = out.replace(/\s*Источники?:\s*.*$/iu, '');
  out = out.replace(/\s*Правило:\s*.*$/iu, '');
  out = out.replace(/[_]+/g, '');
  out = normalizeSpaces(out);
  out = out.replace(/\s+([1-5]\))/g, '\n$1');
  out = out.replace(/([.;])\s+([1-5]\))/g, '$1\n$2');
  if (!/^Привед[её]м верное написание/i.test(out)) {
    out = `Приведём верное написание:\n${out}`;
  }
  return out;
}

function validateType10ByRulePack(ex, rulePack) {
  const issues = [];
  const options = ex.payload?.options ?? [];
  const prompt = String(ex.prompt ?? '').toLowerCase();
  const explanation = String(ex.explanation ?? '').toLowerCase();

  if (options.length !== rulePack.constraints.expectedOptionsCount) {
    issues.push(`wrong_options_count:${options.length}`);
  }
  if (prompt.length < rulePack.constraints.minPromptLength) {
    issues.push('short_prompt');
  }
  if (explanation.length < rulePack.constraints.minExplanationLength) {
    issues.push('short_explanation');
  }

  const merged = `${prompt} ${explanation}`;
  const hasRequiredTheme = rulePack.requiredThemePatterns.some((token) => merged.includes(token));
  if (!hasRequiredTheme) issues.push('missing_type10_theme');

  const lowerOptions = options.map((o) => String(o).toLowerCase());
  for (const token of rulePack.forbiddenOptionPatterns) {
    if (lowerOptions.some((o) => o.includes(token))) {
      issues.push(`forbidden_option_token:${token}`);
      break;
    }
  }
  return issues;
}

async function main() {
  const rows = await sql`
    select id, seed_key, prompt, payload, explanation, source_alignment
    from exercises
    where type = 'ege_multi_select'
      and skill_tags @> array['ege.10']::text[]
  `;

  const changes = [];
  let approved = 0;
  let rejected = 0;

  for (const row of rows) {
    const prompt = normalizePrompt(row.prompt);
    const payload = row.payload ?? {};
    const options = normalizeOptions(payload.options ?? []);
    const explanation = normalizeExplanation(row.explanation);
    const candidate = { prompt, payload: { ...payload, options }, explanation };
    const issues = validateType10ByRulePack(candidate, rules);
    const isRejected = issues.length > 0;

    if (isRejected) rejected += 1;
    else approved += 1;

    const nextSourceAlignment = {
      ...(row.source_alignment ?? {}),
      validation: {
        type: 'type10-rule-pack',
        source: rules.source,
        issues,
      },
    };

    const changed =
      prompt !== row.prompt ||
      JSON.stringify(options) !== JSON.stringify(payload.options ?? []) ||
      explanation !== row.explanation ||
      JSON.stringify((row.source_alignment ?? {}).validation?.issues ?? []) !== JSON.stringify(issues);

    if (!changed) continue;
    changes.push({
      id: row.id,
      prompt,
      payload: { ...payload, options },
      explanation,
      qualityStatus: isRejected ? 'rejected' : 'review',
      isActive: !isRejected,
      sourceAlignment: nextSourceAlignment,
    });
  }

  console.log(`Type-10 rows scanned: ${rows.length}`);
  console.log(`Rows to change: ${changes.length}`);
  console.log(`Will be active(review): ${approved}`);
  console.log(`Will be rejected(inactive): ${rejected}`);

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
        quality_status = ${item.qualityStatus},
        is_active = ${item.isActive},
        source_alignment = ${sql.json(item.sourceAlignment)},
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

