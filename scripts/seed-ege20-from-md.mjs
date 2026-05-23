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
const INPUT_PATH = path.resolve(ROOT, 'test_sources', 'Тип 20.md');
const OUT_DIR = path.resolve(ROOT, 'test_sources', 'parsed');

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

function parseAnswerMeta(rawAnswerText) {
  const variants = [];
  const pipeGroups = rawAnswerText.match(/\d+(?:\|\d+)+/g) ?? [];
  for (const group of pipeGroups) for (const part of group.split('|')) variants.push(part);
  const commaList = rawAnswerText.match(/\d(?:\s*,\s*\d)+/g) ?? [];
  for (const group of commaList) variants.push(group.replace(/[^\d]/g, ''));
  const plainGroups = rawAnswerText.match(/\d{2,9}/g) ?? [];
  for (const group of plainGroups) variants.push(group);

  const unique = [...new Set(variants)];
  const sets = unique
    .map((v) => [...new Set([...v].filter((c) => /\d/.test(c)).map(Number))].sort((a, b) => a - b))
    .filter((arr) => arr.length > 0);
  if (!sets.length) return { acceptedAnswers: [], targetSet: [] };
  const acceptedAnswers = [...new Set(sets.map((arr) => arr.join('')))];
  const targetSet = sets[0];
  return { acceptedAnswers, targetSet };
}

function extractTextWithSlots(taskPart) {
  const lines = taskPart.split('\n').map((line) => line.trim()).filter(Boolean);
  const candidates = lines.filter((line) => /\(\d+\)/.test(line));
  if (!candidates.length) return '';
  return normalizeSpaces(candidates.sort((a, b) => b.length - a.length)[0]);
}

function parseSlots(text) {
  return [...new Set((text.match(/\((\d+)\)/g) ?? []).map((m) => Number(m.replace(/[^\d]/g, ''))))]
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

function parseBlock(block) {
  const lines = block.text.split('\n').map((line) => line.trim()).filter(Boolean);
  const prompt =
    lines.find((line) => line.includes('Укажите') && line.includes('номер')) ??
    'Укажите номера позиций, на месте которых должны стоять запятые.';
  const explanationSplit = block.text.split(/\n\s*Пояснение\./u);
  const taskPart = explanationSplit[0] ?? block.text;
  let textWithSlots = extractTextWithSlots(taskPart);
  let slots = parseSlots(textWithSlots);

  if (slots.length < 2) {
    const fallback = normalizeSpaces(taskPart);
    const fallbackSlots = parseSlots(fallback);
    if (fallbackSlots.length >= 2) {
      textWithSlots = fallback;
      slots = fallbackSlots;
    }
  }

  const answerLines = lines
    .filter((line) => /^Ответ:/i.test(line))
    .map((line) => normalizeSpaces(line.replace(/^Ответ:\s*/i, '')));
  const rawAnswerText = answerLines.find((line) => /\d/.test(line)) ?? answerLines[0] ?? '';
  const { acceptedAnswers, targetSet } = parseAnswerMeta(rawAnswerText);

  const explanationMatch = block.text.match(/Пояснение\.\s*([\s\S]*?)(?=\n\s*Ответ:|$)/u);
  const explanation = normalizeSpaces(explanationMatch?.[1] ?? 'Пунктуационный анализ сложного предложения.');

  return {
    seedKey: `ege20-bank-${block.problemId}`,
    type: 'ege20_complex_sentence_punctuation',
    category: 'punctuation',
    difficulty: 2,
    skillTags: ['ege.20', 'punctuation.complex_sentence', 'fipi.task20'],
    prompt,
    payload: { textWithSlots, slots },
    answer: { rawAnswerText, acceptedAnswers, targetSet },
    explanation,
    sourceAlignment: {
      reference: `sdamgia:${block.problemId}`,
      url: block.sourceUrl,
      task: 'ЕГЭ русский, задание 20',
    },
    typicalMistake: 'Не учитываются границы придаточных частей и условия постановки запятой.',
    algorithmSteps: [
      { id: 'task20_1', title: 'Определи грамматические основы и границы частей', required: true },
      { id: 'task20_2', title: 'Проверь условия постановки запятой для каждого номера', required: true },
      { id: 'task20_3', title: 'Запиши только номера с обязательной запятой', required: true },
    ],
    qualityStatus: 'review',
    isActive: true,
    _raw: block.text,
  };
}

function validate(ex) {
  if (!ex.prompt) return 'empty prompt';
  if (!ex.payload.textWithSlots) return 'empty textWithSlots';
  if (ex.payload.slots.length < 2) return 'too few slots';
  if (!ex.answer.targetSet.length) return 'empty targetSet';
  if (!ex.answer.acceptedAnswers.length) return 'empty acceptedAnswers';
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
  const raw = decodeBestEffort(await readFile(INPUT_PATH));
  const blocks = extractBlocks(raw);
  const parsed = blocks.map(parseBlock);
  const quarantine = [];
  let ok = 0;
  const reasonCount = new Map();

  for (const ex of parsed) {
    const err = validate(ex);
    if (err) {
      quarantine.push({
        seedKey: ex.seedKey,
        reason: err,
        problemId: ex.sourceAlignment.reference,
        prompt: ex.prompt,
        rawAnswerText: ex.answer.rawAnswerText,
        rawBlock: ex._raw,
      });
      reasonCount.set(err, (reasonCount.get(err) ?? 0) + 1);
      continue;
    }
    await upsertExercise(ex);
    ok += 1;
  }

  const qPath = path.resolve(OUT_DIR, 'failed-type-20.jsonl');
  await writeFile(qPath, quarantine.map((x) => JSON.stringify(x)).join('\n') + (quarantine.length ? '\n' : ''), 'utf8');
  console.log(`Type-20 import complete. Parsed: ${parsed.length}, upserted: ${ok}, quarantined: ${quarantine.length}`);
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
