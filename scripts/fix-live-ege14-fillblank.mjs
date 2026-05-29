import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sql = postgres(connectionString);

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\u00ad/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function pickSourceText(row) {
  const prompt = String(row.prompt ?? '');
  const before = String(row.payload?.before ?? '');
  return before.length > prompt.length ? before : prompt;
}

function extractPrompt(fullText) {
  const clean = normalizeWhitespace(fullText);
  const match = clean.match(/^(.*?)(?=\s*1(?:\)|(?=\s*\())\s*)/u);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, ' ');
}

function extractOptions(fullText) {
  const clean = normalizeWhitespace(fullText)
    .replace(/\s*Пояснение\b.*$/u, '')
    .replace(/\s*Ответ:\s*.*$/u, '');
  const matches = [
    ...clean.matchAll(
      /(?:^|\s)([1-5])(?:\)|(?=\s*\())\s*([\s\S]*?)(?=(?:\s[1-5](?:\)|(?=\s*\())\s*)|$)/gu,
    ),
  ];

  if (matches.length < 5) return null;

  const firstFive = matches.slice(0, 5);
  const numbers = firstFive.map((match) => Number(match[1]));
  const expected = [1, 2, 3, 4, 5];
  const validOrder = numbers.length === expected.length &&
    numbers.every((value, index) => value === expected[index]);
  if (!validOrder) return null;

  const options = firstFive.map((match) => normalizeWhitespace(match[2]));
  if (options.some((option) => option.length === 0)) return null;
  return options;
}

function normalizeAcceptedAnswers(answer) {
  const accepted = Array.isArray(answer?.accepted)
    ? answer.accepted.map((value) => normalizeWhitespace(String(value)))
    : [];

  const normalized = [];
  for (const value of accepted) {
    const digitsOnly = value.replace(/[^\d]/g, '');
    if (!digitsOnly) continue;
    if (!normalized.includes(digitsOnly)) normalized.push(digitsOnly);
  }
  return normalized;
}

function parseTargetSet(acceptedAnswers) {
  const mergedDigits = acceptedAnswers[0] ?? '';
  const digits = [...mergedDigits]
    .map((char) => Number(char))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
  return [...new Set(digits)].sort((a, b) => a - b);
}

function isSameSetAcrossAccepted(acceptedAnswers, targetSet) {
  const signature = targetSet.join(',');
  return acceptedAnswers.every((value) => {
    const normalized = [...new Set(
      [...value]
        .map((char) => Number(char))
        .filter((num) => Number.isInteger(num) && num >= 1 && num <= 5),
    )].sort((a, b) => a - b);
    return normalized.join(',') === signature;
  });
}

function convertRow(row) {
  const sourceText = pickSourceText(row);
  const prompt = extractPrompt(sourceText);
  if (!prompt) return { error: 'prompt_not_found' };

  const options = extractOptions(sourceText);
  if (!options || options.length !== 5) return { error: 'options_not_found' };

  const acceptedAnswers = normalizeAcceptedAnswers(row.answer);
  if (!acceptedAnswers.length) return { error: 'accepted_answers_not_found' };

  const targetSet = parseTargetSet(acceptedAnswers);
  if (!targetSet.length) return { error: 'target_set_not_found' };
  if (!isSameSetAcrossAccepted(acceptedAnswers, targetSet)) {
    return { error: 'accepted_answers_conflict' };
  }

  const rawAnswerText = `${acceptedAnswers[0]}.`;
  return {
    prompt,
    payload: { options },
    answer: {
      rawAnswerText,
      acceptedAnswers,
      targetSet,
    },
  };
}

async function main() {
  const rows = await sql`
    select id, seed_key, type, prompt, payload, answer, skill_tags
    from exercises
    where type = 'fill_blank'
      and skill_tags @> array['ege.14']::text[]
  `;

  const convertible = [];
  const failed = [];

  for (const row of rows) {
    const converted = convertRow(row);
    if ('error' in converted) {
      failed.push({ id: row.id, seedKey: row.seed_key, reason: converted.error });
      continue;
    }

    convertible.push({
      id: row.id,
      seedKey: row.seed_key,
      type: 'ege_multi_select',
      prompt: converted.prompt,
      payload: converted.payload,
      answer: converted.answer,
    });
  }

  console.log(`EGE-14 fill_blank scanned: ${rows.length}`);
  console.log(`Convertible: ${convertible.length}`);
  console.log(`Failed parse: ${failed.length}`);

  if (convertible.length) {
    console.log('Convertible sample:');
    console.log(
      JSON.stringify(
        convertible.slice(0, 5).map((item) => ({
          id: item.id,
          seedKey: item.seedKey,
          prompt: item.prompt,
          targetSet: item.answer.targetSet,
          acceptedAnswers: item.answer.acceptedAnswers,
          optionsCount: item.payload.options.length,
          firstOption: item.payload.options[0],
        })),
        null,
        2,
      ),
    );
  }

  if (failed.length) {
    console.log('Failed sample:');
    console.log(JSON.stringify(failed.slice(0, 10), null, 2));
  }

  if (!APPLY) {
    console.log('Dry run complete. Add --apply to write changes.');
    return;
  }

  for (const item of convertible) {
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
