import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function normalizeTextChars(value) {
  return String(value ?? '')
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ');
}

function normalizeInlineText(value) {
  return normalizeTextChars(value)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function normalizeBlockText(value) {
  return normalizeTextChars(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\n([a-zа-яё])/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

function normalizeSpaces(value) {
  return normalizeInlineText(value);
}

async function detectLatestParsedDir(rootDir) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(rootDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.resolve(rootDir, e.name));
  if (!dirs.length) {
    throw new Error(`No parsed directories found in ${rootDir}`);
  }
  const sorted = dirs.sort((a, b) => (a < b ? 1 : -1));
  return sorted[0];
}

function mapCategory(type) {
  if (type >= 16) return 'punctuation';
  return 'orthography';
}

function buildSeedKey(row) {
  const cleanType = Number(row.type);
  const cleanProblem = String(row.problemId ?? '').trim();
  if (Number.isInteger(cleanType) && cleanProblem) {
    return `live-ege${cleanType}-${cleanProblem}`;
  }
  return `live-ege-variant${row.variantId}-idx${row.index}`;
}

function toExercise(row) {
  const typeNum = Number(row.type);
  const accepted = Array.isArray(row.acceptedAnswers)
    ? row.acceptedAnswers.map((a) => String(a).trim()).filter(Boolean)
    : [];
  const fallbackAccepted = accepted.length
    ? accepted
    : (String(row.answerText ?? '').match(/[0-9]+/g) ?? []).map((a) => a.trim()).filter(Boolean);

  return {
    seedKey: buildSeedKey(row),
    type: 'fill_blank',
    category: mapCategory(typeNum),
    difficulty: 2,
    skillTags: [`ege.${typeNum}`, 'live.harvested'],
    prompt: normalizeBlockText(row.prompt || `ЕГЭ задание ${typeNum}`),
    payload: {
      before: normalizeBlockText(row.prompt || ''),
      after: '',
      placeholderLabel: 'Введите ответ',
    },
    answer: {
      accepted: fallbackAccepted.length ? fallbackAccepted : ['1'],
      caseSensitive: false,
    },
    explanation: normalizeBlockText(row.explanation || 'Объяснение отсутствует.'),
    sourceAlignment: {
      reference: row.problemId ? `sdamgia:${row.problemId}` : `variant:${row.variantId}:${row.index}`,
      variantUrl: row.variantUrl,
      wordUrl: row.wordUrl,
      task: Number.isInteger(typeNum) ? `ЕГЭ русский, задание ${typeNum}` : 'ЕГЭ русский',
    },
    typicalMistake: 'Ответ записан в неверном формате или с пропуском номера.',
    algorithmSteps: [
      { id: 'read', title: 'Прочитай условие целиком', required: true },
      { id: 'rule', title: 'Определи правило и проверь все фрагменты', required: true },
      { id: 'write', title: 'Запиши ответ без лишних символов', required: true },
    ],
    qualityStatus: 'review',
    isActive: true,
  };
}

function validateExercise(ex) {
  if (!ex.seedKey) return 'empty_seed_key';
  if (!ex.prompt) return 'empty_prompt';
  if (!Array.isArray(ex.answer.accepted) || ex.answer.accepted.length < 1) return 'empty_accepted_answers';
  return null;
}

function fingerprint(ex) {
  const answerSig = [...ex.answer.accepted].sort().join('|');
  return `${ex.type}::${normalizeSpaces(ex.prompt).toLowerCase()}::${answerSig}`;
}

async function upsertExercise(sql, ex) {
  await sql`
    insert into exercises (
      seed_key, type, category, difficulty, skill_tags, prompt, payload, answer, explanation,
      source_alignment, typical_mistake, algorithm_steps, quality_status, is_active
    ) values (
      ${ex.seedKey},
      ${ex.type},
      ${ex.category},
      ${ex.difficulty},
      ${ex.skillTags},
      ${ex.prompt},
      ${sql.json(ex.payload)},
      ${sql.json(ex.answer)},
      ${ex.explanation},
      ${sql.json(ex.sourceAlignment)},
      ${ex.typicalMistake},
      ${sql.json(ex.algorithmSteps)},
      ${ex.qualityStatus},
      ${ex.isActive}
    )
    on conflict (seed_key) do update set
      type = excluded.type,
      category = excluded.category,
      difficulty = excluded.difficulty,
      skill_tags = excluded.skill_tags,
      prompt = excluded.prompt,
      payload = excluded.payload,
      answer = excluded.answer,
      explanation = excluded.explanation,
      source_alignment = excluded.source_alignment,
      typical_mistake = excluded.typical_mistake,
      algorithm_steps = excluded.algorithm_steps,
      quality_status = excluded.quality_status,
      is_active = excluded.is_active,
      updated_at = now()
  `;
}

async function main() {
  const args = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }
  const sql = postgres(connectionString);

  try {
    const parsedRoot = path.resolve(process.cwd(), 'test_sources', 'parsed_live');
    const parsedDir = args.parsedDir
      ? path.resolve(args.parsedDir)
      : await detectLatestParsedDir(parsedRoot);
    const inputPath = path.resolve(parsedDir, 'validated.jsonl');
    const raw = await readFile(inputPath, 'utf8');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => JSON.parse(line));

    const seen = new Set();
    let upserted = 0;
    let skippedDupBatch = 0;
    let failed = 0;

    for (const row of rows) {
      const ex = toExercise(row);
      const err = validateExercise(ex);
      if (err) {
        failed += 1;
        continue;
      }
      const fp = fingerprint(ex);
      if (seen.has(fp)) {
        skippedDupBatch += 1;
        continue;
      }
      seen.add(fp);
      await upsertExercise(sql, ex);
      upserted += 1;
    }

    console.log(`Seed source: ${inputPath}`);
    console.log(`Rows: ${rows.length}, upserted: ${upserted}, skippedDupInBatch: ${skippedDupBatch}, failed: ${failed}`);
  } finally {
    await sql.end();
  }
}

await main();
