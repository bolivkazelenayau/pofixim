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
const INPUT_PATH = path.resolve(ROOT, 'test_sources', 'Тип 21.md');
const OUT_DIR = path.resolve(ROOT, 'test_sources', 'parsed');

const TARGET_PUNCT_BY_PROMPT = [
  { re: /тире/i, value: 'dash' },
  { re: /двоеточ/i, value: 'colon' },
  { re: /точк[аи] с запят/i, value: 'semicolon' },
  { re: /запят/i, value: 'comma' },
];

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

function pickTargetPunctuation(prompt) {
  for (const item of TARGET_PUNCT_BY_PROMPT) {
    if (item.re.test(prompt)) return item.value;
  }
  return 'comma';
}

function parseVariantToSet(variant) {
  const digits = [...variant].filter((ch) => /\d/.test(ch));
  return [...new Set(digits.map((d) => Number(d)).filter((n) => n > 0))].sort((a, b) => a - b);
}

function parseAnswerMeta(rawAnswerText) {
  const variants = [];
  const directPipeGroups = rawAnswerText.match(/\d+(?:\|\d+)+/g) ?? [];
  for (const group of directPipeGroups) for (const part of group.split('|')) variants.push(part);
  const plainDigitGroups = rawAnswerText.match(/\d{2,9}/g) ?? [];
  for (const group of plainDigitGroups) variants.push(group);

  const uniqueVariants = [...new Set(variants)];
  const parsedSets = uniqueVariants.map(parseVariantToSet).filter((setVals) => setVals.length > 0);
  if (parsedSets.length === 0) return { acceptedAnswers: [], targetSet: [] };
  const targetSet = parsedSets[0];
  const acceptedAnswers = [...new Set(parsedSets.map((setVals) => setVals.join('')))];
  return { acceptedAnswers, targetSet };
}

function extractBlocks(content) {
  const headers = [...content.matchAll(/problem\?id=(\d+)\)/gmu)];
  const blocks = [];
  for (let i = 0; i < headers.length; i += 1) {
    const current = headers[i];
    const next = headers[i + 1];
    const startLine = content.lastIndexOf('\n', current.index ?? 0);
    const start = startLine === -1 ? 0 : startLine + 1;
    const end = next?.index ?? content.length;
    blocks.push({
      problemId: current[1],
      sourceUrl: `https://rus-ege.sdamgia.ru/problem?id=${current[1]}`,
      text: content.slice(start, end),
    });
  }
  return blocks;
}

function parseSentences(sectionText) {
  const sentenceRe = /\((\d+)\)\s*([\s\S]*?)(?=(?:\(\d+\)\s*)|(?:\n\s*Пояснение\.)|$)/gmu;
  const sentences = [];
  for (const match of sectionText.matchAll(sentenceRe)) {
    const index = Number(match[1]);
    const text = normalizeSpaces(match[2] ?? '');
    if (!Number.isInteger(index) || index <= 0 || !text) continue;
    sentences.push({ index, text });
  }
  return sentences;
}

function parseSentencesFallback(sectionText) {
  const lines = sectionText.split('\n').map((line) => line.trim()).filter(Boolean);
  const sentences = [];
  for (const line of lines) {
    const m = line.match(/^\(?(\d+)\)?[).]?\s*(.+)$/u);
    if (!m) continue;
    const idx = Number(m[1]);
    const text = normalizeSpaces(m[2] ?? '');
    if (!Number.isInteger(idx) || idx <= 0 || !text) continue;
    sentences.push({ index: idx, text });
  }
  return sentences;
}

function parseBlock(block) {
  const lines = block.text.split('\n').map((line) => line.trim()).filter(Boolean);
  const prompt =
    lines.find((line) => /^Найдите предложения/i.test(line) || (/Укажите/i.test(line) && /предложени/i.test(line))) ??
    lines.find((line) => /предложени/i.test(line)) ??
    'Найдите предложения, в которых знак препинания ставится по одному и тому же правилу.';
  const explanationSplit = block.text.split(/\n\s*Пояснение\./u);
  const taskText = explanationSplit[0] ?? block.text;
  let sentences = parseSentences(taskText);
  if (sentences.length < 2) sentences = parseSentencesFallback(taskText);

  const answerLines = lines
    .filter((line) => /^Ответ:/i.test(line))
    .map((line) => normalizeSpaces(line.replace(/^Ответ:\s*/i, '')));
  const rawAnswerText = answerLines.find((line) => /\d/.test(line)) ?? answerLines[0] ?? '';
  const explanationMatch = block.text.match(/Пояснение\.\s*([\s\S]*?)(?=\n\s*Ответ:|$)/u);
  const explanation = normalizeSpaces(explanationMatch?.[1] ?? 'Пунктуационный анализ по заданию 21.');
  const { acceptedAnswers, targetSet } = parseAnswerMeta(rawAnswerText);

  return {
    seedKey: `ege21-bank-${block.problemId}`,
    type: 'ege21_punctuation_analysis',
    category: 'punctuation',
    difficulty: 2,
    skillTags: ['ege.21', 'punctuation.analysis', 'fipi.task21'],
    prompt,
    payload: {
      targetPunctuation: pickTargetPunctuation(prompt),
      sentences,
    },
    answer: {
      rawAnswerText,
      acceptedAnswers,
      targetSet,
    },
    explanation,
    sourceAlignment: {
      reference: `sdamgia:${block.problemId}`,
      url: block.sourceUrl,
      task: 'ЕГЭ русский, задание 21',
    },
    typicalMistake: 'Смешение разных пунктуационных правил в одном наборе предложений.',
    algorithmSteps: [
      { id: 'task21_1', title: 'Определи целевой знак препинания в формулировке', required: true },
      { id: 'task21_2', title: 'Проверь правило постановки знака в каждом предложении', required: true },
      { id: 'task21_3', title: 'Выбери только предложения с одним и тем же правилом', required: true },
    ],
    qualityStatus: 'review',
    isActive: true,
    _raw: block.text,
  };
}

function validate(exercise) {
  if (!exercise.prompt) return 'empty prompt';
  if (!exercise.payload.sentences.length) return 'no sentences parsed';
  if (!exercise.answer.targetSet.length) return 'empty targetSet';
  if (!exercise.answer.acceptedAnswers.length) return 'empty acceptedAnswers';
  return null;
}

async function upsertExercise(exercise) {
  await sql`
    insert into exercises (
      seed_key, type, category, difficulty, skill_tags, prompt, payload, answer, explanation,
      source_alignment, typical_mistake, algorithm_steps, quality_status, is_active
    ) values (
      ${exercise.seedKey},
      ${exercise.type},
      ${exercise.category},
      ${exercise.difficulty},
      ${exercise.skillTags},
      ${exercise.prompt},
      ${sql.json(exercise.payload)},
      ${sql.json(exercise.answer)},
      ${exercise.explanation},
      ${sql.json(exercise.sourceAlignment)},
      ${exercise.typicalMistake},
      ${sql.json(exercise.algorithmSteps)},
      ${exercise.qualityStatus},
      ${exercise.isActive}
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
  const raw = decodeBestEffort(await readFile(INPUT_PATH));
  const blocks = extractBlocks(raw);
  const parsed = blocks.map(parseBlock);
  let ok = 0;
  const quarantine = [];
  const reasonCount = new Map();

  for (const exercise of parsed) {
    const err = validate(exercise);
    if (err) {
      quarantine.push({
        seedKey: exercise.seedKey,
        reason: err,
        problemId: exercise.sourceAlignment.reference,
        prompt: exercise.prompt,
        rawAnswerText: exercise.answer.rawAnswerText,
        rawBlock: exercise._raw,
      });
      reasonCount.set(err, (reasonCount.get(err) ?? 0) + 1);
      continue;
    }
    await upsertExercise(exercise);
    ok += 1;
  }

  const qPath = path.resolve(OUT_DIR, 'failed-type-21.jsonl');
  await writeFile(qPath, quarantine.map((x) => JSON.stringify(x)).join('\n') + (quarantine.length ? '\n' : ''), 'utf8');
  console.log(`Type-21 import complete. Parsed: ${parsed.length}, upserted: ${ok}, quarantined: ${quarantine.length}`);
  if (quarantine.length) {
    console.log(`Quarantine: ${qPath}`);
    for (const [reason, count] of reasonCount.entries()) console.log(`- ${reason}: ${count}`);
  }
}

try {
  await main();
} finally {
  await sql.end();
}
