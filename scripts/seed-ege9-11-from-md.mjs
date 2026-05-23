import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { TextDecoder } from 'node:util';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const sql = postgres(connectionString);
const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, 'test_sources');
const OUT_DIR = path.resolve(SRC_DIR, 'parsed');
const RULES_DIR = path.resolve(ROOT, 'scripts', 'rules');

const FILES = [
  { type: 9, name: 'Тип 9.md', taskCode: 'ege.9' },
  { type: 10, name: 'Тип 10.md', taskCode: 'ege.10' },
  { type: 11, name: 'Тип 11.md', taskCode: 'ege.11' },
];

const enabledTypes = new Set(
  (process.env.EGE_TYPES ?? '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v)),
);
const type10Rules = JSON.parse(
  await readFile(path.resolve(RULES_DIR, 'ege-orthography-2026.type10.json'), 'utf8'),
);

function normalizeSpaces(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeBestEffort(buffer) {
  const utf8 = buffer.toString('utf8');
  const cp1251 = new TextDecoder('windows-1251').decode(buffer);
  const utf8Score = (utf8.match(/problem\?id=\d+/g) ?? []).length + (utf8.match(/Ответ:/g) ?? []).length;
  const cp1251Score = (cp1251.match(/problem\?id=\d+/g) ?? []).length + (cp1251.match(/Ответ:/g) ?? []).length;
  return cp1251Score > utf8Score ? cp1251 : utf8;
}

function splitBlocks(content) {
  const headerRe = /problem\?id=(\d+)\)/gmu;
  const matches = [...content.matchAll(headerRe)];
  const blocks = [];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = content.lastIndexOf('\n', current.index ?? 0);
    const blockStart = start === -1 ? 0 : start + 1;
    const blockEnd = next?.index ?? content.length;
    blocks.push({
      problemId: current[1],
      sourceUrl: `https://rus-ege.sdamgia.ru/problem?id=${current[1]}`,
      text: content.slice(blockStart, blockEnd),
    });
  }
  return blocks;
}

function parseAnswerSet(raw) {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const variants = [];
  const commaGroups = compact.match(/\d(?:\s*,\s*\d)+/g) ?? [];
  for (const group of commaGroups) variants.push(group.replace(/[^\d]/g, ''));
  const pipeGroups = compact.match(/\d+(?:\|\d+)+/g) ?? [];
  for (const group of pipeGroups) {
    for (const part of group.split('|')) variants.push(part);
  }
  const plainGroups = compact.match(/\d{1,9}/g) ?? [];
  for (const group of plainGroups) variants.push(group);

  const unique = [...new Set(variants)];
  const sets = unique
    .map((v) => [...new Set([...v].filter((c) => /\d/.test(c)).map((c) => Number(c)))].sort((a, b) => a - b))
    .filter((arr) => arr.length > 0);

  const acceptedAnswers = [...new Set(sets.map((arr) => arr.join('')))];
  const targetSet = sets[0] ?? [];
  return { acceptedAnswers, targetSet };
}

function parseOptions(blockText) {
  const optionRe = /^\s*(\d)[\).]\s*(.+?)(?=\n\s*\d[\).]\s*|\n\s*\*\*Пояснение\.|$)/gms;
  const options = [];
  for (const match of blockText.matchAll(optionRe)) {
    options.push(normalizeSpaces(match[2]));
  }
  return options;
}

function parseBlock(block, meta) {
  const lines = block.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const prompt =
    lines.find((l) => l.includes('Укажите') || l.includes('Найдите')) ??
    `Задание ${meta.type}`;

  const taskTextStart = lines.findIndex((l) => l === prompt);
  const explainIdx = lines.findIndex((l) => /^Пояснение\./i.test(l));
  const taskLines =
    taskTextStart >= 0
      ? lines.slice(taskTextStart + 1, explainIdx > taskTextStart ? explainIdx : undefined)
      : [];
  const taskText = normalizeSpaces(taskLines.join(' '));
  const options = parseOptions(block.text);

  const answerLine = lines.find((l) => /^Ответ:/i.test(l) && /\d/.test(l)) ?? '';
  const rawAnswerText = normalizeSpaces(answerLine.replace(/^Ответ:\s*/i, ''));
  const { acceptedAnswers, targetSet } = parseAnswerSet(rawAnswerText);

  const explanationMatch = block.text.match(/Пояснение\.\s*([\s\S]*?)(?=\n\s*Ответ:|$)/u);
  const explanation = normalizeSpaces(explanationMatch?.[1] ?? 'Объяснение к орфографическому заданию.');

  return {
    seedKey: `ege${meta.type}-bank-${block.problemId}`,
    problemId: block.problemId,
    examTask: meta.type,
    prompt,
    taskText,
    options,
    rawAnswerText,
    acceptedAnswers,
    targetSet,
    explanation,
    sourceUrl: block.sourceUrl,
  };
}

function toMultiSelectExercise(item) {
  const options = item.options.length ? item.options : [item.taskText];
  const targetSet = item.targetSet.length ? item.targetSet : [1];
  const signature = targetSet.join('');
  const acceptedAnswers = item.acceptedAnswers.length ? item.acceptedAnswers : [signature];
  return {
    seedKey: item.seedKey,
    type: 'ege_multi_select',
    category: 'orthography',
    difficulty: 2,
    skillTags: [`ege.${item.examTask}`, 'orthography', 'fipi.multi_select'],
    prompt: item.prompt,
    payload: { options },
    answer: {
      rawAnswerText: item.rawAnswerText || signature,
      acceptedAnswers,
      targetSet,
    },
    explanation: item.explanation,
    sourceAlignment: {
      reference: `sdamgia:${item.problemId}`,
      url: item.sourceUrl,
      task: `ЕГЭ русский, задание ${item.examTask}`,
    },
    typicalMistake: 'Выбран ряд по одному слову без проверки остальных слов ряда.',
    algorithmSteps: [
      { id: 'rule', title: 'Определи правило для каждого ряда', required: true },
      { id: 'scan', title: 'Проверь все слова в каждом ряду', required: true },
      { id: 'pick', title: 'Отметь только полностью подходящие ряды', required: true },
    ],
    qualityStatus: 'review',
    isActive: true,
  };
}

function validateType10ByRulePack(ex, rules) {
  const issues = [];
  const options = ex.payload?.options ?? [];
  const prompt = String(ex.prompt ?? '').toLowerCase();
  const explanation = String(ex.explanation ?? '').toLowerCase();

  if (options.length !== rules.constraints.expectedOptionsCount) {
    issues.push(`wrong_options_count:${options.length}`);
  }
  if (prompt.length < rules.constraints.minPromptLength) {
    issues.push('short_prompt');
  }
  if (explanation.length < rules.constraints.minExplanationLength) {
    issues.push('short_explanation');
  }

  const merged = `${prompt} ${explanation}`;
  const hasRequiredTheme = rules.requiredThemePatterns.some((token) => merged.includes(token));
  if (!hasRequiredTheme) {
    issues.push('missing_type10_theme');
  }

  const lowerOptions = options.map((o) => String(o).toLowerCase());
  for (const token of rules.forbiddenOptionPatterns) {
    if (lowerOptions.some((o) => o.includes(token))) {
      issues.push(`forbidden_option_token:${token}`);
      break;
    }
  }

  return issues;
}

function validate(ex) {
  if (!ex.prompt) return 'empty prompt';
  if (!Array.isArray(ex.payload.options) || ex.payload.options.length < 2) return 'too few options';
  if (!Array.isArray(ex.answer.targetSet) || !ex.answer.targetSet.length) return 'empty targetSet';
  return null;
}

async function upsertExercise(ex) {
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
  await mkdir(OUT_DIR, { recursive: true });

  let parsedTotal = 0;
  let upsertedTotal = 0;
  const failed = [];

  for (const meta of FILES) {
    if (enabledTypes.size > 0 && !enabledTypes.has(meta.type)) continue;
    const inputPath = path.resolve(SRC_DIR, meta.name);
    const raw = decodeBestEffort(await readFile(inputPath));
    const blocks = splitBlocks(raw);
    const parsed = blocks.map((block) => parseBlock(block, meta));
    parsedTotal += parsed.length;

    const outPath = path.resolve(OUT_DIR, `type-${meta.type}.jsonl`);
    const jsonl = parsed.map((item) => JSON.stringify(item)).join('\n');
    await writeFile(outPath, `${jsonl}\n`, 'utf8');

    for (const item of parsed) {
      const exercise = toMultiSelectExercise(item);
      const err = validate(exercise);
      if (err) {
        failed.push({ seedKey: exercise.seedKey, err });
        continue;
      }
      if (item.examTask === 10) {
        const issues = validateType10ByRulePack(exercise, type10Rules);
        if (issues.length > 0) {
          exercise.qualityStatus = 'rejected';
          exercise.isActive = false;
          exercise.sourceAlignment = {
            ...(exercise.sourceAlignment ?? {}),
            validation: {
              type: 'type10-rule-pack',
              source: type10Rules.source,
              issues,
            },
          };
        }
      }
      await upsertExercise(exercise);
      upsertedTotal += 1;
    }

    console.log(`Type-${meta.type}: parsed ${parsed.length}, wrote ${outPath}`);
  }

  console.log(`Import complete. Parsed: ${parsedTotal}, upserted: ${upsertedTotal}, failed: ${failed.length}`);
}

try {
  await main();
} finally {
  await sql.end();
}
