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

const FILES = [
  { type: 12, name: 'Тип 12.md', taskCode: 'ege.12' },
  { type: 13, name: 'Тип 13.md', taskCode: 'ege.13' },
  { type: 14, name: 'Тип 14.md', taskCode: 'ege.14' },
  { type: 15, name: 'Тип 15.md', taskCode: 'ege.15' },
  { type: 16, name: 'Тип 16.md', taskCode: 'ege.16' },
  { type: 17, name: 'Тип 17.md', taskCode: 'ege.17' },
  { type: 18, name: 'Тип 18.md', taskCode: 'ege.18' },
  { type: 19, name: 'Тип 19.md', taskCode: 'ege.19' },
];

const enabledTypes = new Set(
  (process.env.EGE_TYPES ?? '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v)),
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
  for (const g of plainGroups) variants.push(g);

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
  const explanation = normalizeSpaces(explanationMatch?.[1] ?? 'Объяснение к заданию.');

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

function toExercise(item) {
  if (item.options.length >= 2) {
    const targetSet = item.targetSet.length ? item.targetSet : [1];
    const signature = targetSet.join('');
    return {
      seedKey: item.seedKey,
      type: 'ege_multi_select',
      category: item.examTask >= 16 ? 'punctuation' : 'orthography',
      difficulty: 2,
      skillTags: [`ege.${item.examTask}`, 'fipi.multi_select'],
      prompt: item.prompt,
      payload: { options: item.options },
      answer: {
        rawAnswerText: item.rawAnswerText || signature,
        acceptedAnswers: item.acceptedAnswers.length ? item.acceptedAnswers : [signature],
        targetSet,
      },
      explanation: item.explanation,
      sourceAlignment: {
        reference: `sdamgia:${item.problemId}`,
        url: item.sourceUrl,
        task: `ЕГЭ русский, задание ${item.examTask}`,
      },
      typicalMistake: 'Выбран вариант по одному признаку без полной проверки ряда.',
      algorithmSteps: [
        { id: 'rule', title: 'Определи правило для каждого варианта', required: true },
        { id: 'scan', title: 'Проверь весь вариант целиком', required: true },
        { id: 'pick', title: 'Выбери только полностью подходящие варианты', required: true },
      ],
      qualityStatus: 'review',
      isActive: true,
    };
  }

  const accepted = item.acceptedAnswers.length
    ? item.acceptedAnswers
    : [item.rawAnswerText.replace(/[^\d]/g, '')].filter(Boolean);
  const sample = item.targetSet.join('') || accepted[0] || '13';
  return {
    seedKey: item.seedKey,
    type: 'fill_blank',
    category: item.examTask >= 16 ? 'punctuation' : 'orthography',
    difficulty: 2,
    skillTags: [`ege.${item.examTask}`, 'fipi.answer_set'],
    prompt: item.prompt,
    payload: {
      before: item.taskText,
      after: '',
      placeholderLabel: `Например: ${sample}`,
    },
    answer: {
      accepted,
      caseSensitive: false,
    },
    explanation: item.explanation,
    sourceAlignment: {
      reference: `sdamgia:${item.problemId}`,
      url: item.sourceUrl,
      task: `ЕГЭ русский, задание ${item.examTask}`,
    },
    typicalMistake: 'Ответ записан в неверном формате или с пропуском номера.',
    algorithmSteps: [
      { id: 'rule', title: 'Определи правило задачи', required: true },
      { id: 'check', title: 'Проверь все условия в тексте', required: true },
      { id: 'write', title: 'Запиши итоговый набор номеров', required: true },
    ],
    qualityStatus: 'review',
    isActive: true,
  };
}

function validate(ex) {
  if (!ex.prompt) return 'empty prompt';
  if (ex.type === 'ege_multi_select' && (!Array.isArray(ex.payload.options) || ex.payload.options.length < 2)) {
    return 'too few options';
  }
  if (ex.type === 'fill_blank' && (!Array.isArray(ex.answer.accepted) || ex.answer.accepted.length < 1)) {
    return 'empty accepted answers';
  }
  return null;
}

function fingerprint(ex) {
  const payloadSig =
    ex.type === 'ege_multi_select'
      ? ex.payload.options.map((o) => normalizeSpaces(o).toLowerCase()).join('|')
      : normalizeSpaces(ex.payload.before).toLowerCase();
  const answerSig =
    ex.type === 'ege_multi_select'
      ? [...ex.answer.targetSet].sort((a, b) => a - b).join(',')
      : [...ex.answer.accepted].map((a) => normalizeSpaces(a)).sort().join('|');
  return `${ex.type}::${normalizeSpaces(ex.prompt).toLowerCase()}::${payloadSig}::${answerSig}`;
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
  const seenFingerprints = new Set();
  let parsedTotal = 0;
  let upsertedTotal = 0;
  let skippedByFingerprint = 0;
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
      const ex = toExercise(item);
      const err = validate(ex);
      if (err) {
        failed.push({ seedKey: ex.seedKey, err });
        continue;
      }
      const fp = fingerprint(ex);
      if (seenFingerprints.has(fp)) {
        skippedByFingerprint += 1;
        continue;
      }
      seenFingerprints.add(fp);
      await upsertExercise(ex);
      upsertedTotal += 1;
    }

    console.log(`Type-${meta.type}: parsed ${parsed.length}, wrote ${outPath}`);
  }

  console.log(
    `Import complete. Parsed: ${parsedTotal}, upserted: ${upsertedTotal}, skippedDuplicatesInBatch: ${skippedByFingerprint}, failed: ${failed.length}`,
  );
  if (failed.length) {
    for (const item of failed.slice(0, 20)) console.log(`- ${item.seedKey}: ${item.err}`);
  }
}

try {
  await main();
} finally {
  await sql.end();
}
