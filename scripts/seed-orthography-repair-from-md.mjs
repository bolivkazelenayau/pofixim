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

function normalizeOptions(options) {
  const seen = new Set();
  return (Array.isArray(options) ? options : [])
    .map((option) => String(option ?? '').trim())
    .filter((option) => {
      const key = option.replace(/\s+/g, ' ').toLowerCase();
      if (!option || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeExercise(ex) {
  return {
    seedKey: ex.seedKey,
    type: 'orthography_repair',
    category: ex.category ?? 'orthography',
    difficulty: ex.difficulty ?? 1,
    skillTags: Array.isArray(ex.skillTags) ? ex.skillTags : ['orthography.repair'],
    prompt: ex.prompt ?? 'Найдите и исправьте орфографическую ошибку.',
    payload: {
      text: ex.payload.text,
      mode: ex.payload.mode ?? 'click_then_choose',
      targets: ex.payload.targets.map((target) => ({
        id: target.id,
        surface: target.surface,
        replacement: target.replacement,
        type: target.type === 'span' ? 'span' : 'word',
        options: normalizeOptions(target.options),
        ...(Number.isInteger(target.occurrence) ? { occurrence: target.occurrence } : {}),
      })),
      ...(Array.isArray(ex.payload.hints) && ex.payload.hints.length
        ? { hints: ex.payload.hints.map((hint) => String(hint).trim()).filter(Boolean) }
        : {}),
    },
    answer: {
      repairs: ex.answer.repairs.map((repair) => ({
        targetId: repair.targetId,
        correct: repair.correct,
      })),
      ...(ex.answer.correctText ? { correctText: ex.answer.correctText } : {}),
    },
    explanation: ex.explanation || 'Объяснение отсутствует.',
    sourceAlignment: ex.sourceAlignment ?? {
      source: 'orthography_repair_33_codex_prompt.md',
    },
    typicalMistake: ex.typicalMistake ?? null,
    algorithmSteps: ex.algorithmSteps ?? [
      { id: 'find_target', title: 'Найди фрагмент с ошибкой', required: true },
      { id: 'choose_repair', title: 'Выбери нормативное написание', required: true },
    ],
    qualityStatus: ex.qualityStatus ?? 'draft',
    isActive: ex.isActive ?? true,
    transferGroup: ex.transferGroup ?? null,
  };
}

function validateExercise(ex) {
  if (!ex.seedKey || ex.seedKey.includes('-N-')) return 'template_or_empty_seed';
  if (!ex.payload?.text) return 'empty_text';
  if (!Array.isArray(ex.payload?.targets) || ex.payload.targets.length < 1) {
    return 'empty_targets';
  }
  if (!Array.isArray(ex.answer?.repairs) || ex.answer.repairs.length < 1) {
    return 'empty_repairs';
  }
  return null;
}

async function upsertExercise(sql, ex) {
  await sql`
    insert into exercises (
      seed_key, type, category, difficulty, skill_tags, prompt, payload, answer, explanation,
      source_alignment, typical_mistake, algorithm_steps, transfer_group, quality_status, is_active
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
      ${ex.transferGroup},
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
      transfer_group = excluded.transfer_group,
      quality_status = excluded.quality_status,
      is_active = excluded.is_active,
      updated_at = now()
  `;
}

const args = parseArgs(process.argv);
const file = path.resolve(
  args.file ?? 'C:/Users/Breeze/Downloads/orthography_repair_33_codex_prompt.md',
);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const text = await readFile(file, 'utf8');
const rawBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => match[1]);
const exercises = rawBlocks
  .map((block) => JSON.parse(block))
  .filter((ex) => ex.type === 'orthography_repair' && !String(ex.seedKey).includes('-N-'))
  .map(normalizeExercise);

const invalid = exercises
  .map((ex) => ({ seedKey: ex.seedKey, error: validateExercise(ex) }))
  .filter((item) => item.error);

if (invalid.length) {
  console.error(JSON.stringify(invalid, null, 2));
  throw new Error(`Invalid orthography_repair exercises: ${invalid.length}`);
}

const sql = postgres(process.env.DATABASE_URL);
try {
  for (const ex of exercises) {
    await upsertExercise(sql, ex);
  }
  console.log(`OK: upserted ${exercises.length} orthography_repair exercises`);
} finally {
  await sql.end();
}
