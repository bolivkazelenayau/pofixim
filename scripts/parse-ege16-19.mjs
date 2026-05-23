import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.resolve(ROOT, 'test_sources');
const OUT_DIR = path.resolve(SRC_DIR, 'parsed');

const FILES = [
  { type: 16, name: 'Тип 16.md', taskCode: 'ege.16' },
  { type: 17, name: 'Тип 17.md', taskCode: 'ege.17' },
  { type: 18, name: 'Тип 18.md', taskCode: 'ege.18' },
  { type: 19, name: 'Тип 19.md', taskCode: 'ege.19' },
];

function normalizeSpaces(value) {
  return value.replace(/\s+/g, ' ').trim();
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
      text: content.slice(blockStart, blockEnd),
    });
  }
  return blocks;
}

function parseAnswerSet(raw) {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const variants = [];
  const commaGroups = compact.match(/\d(?:\s*,\s*\d)+/g) ?? [];
  for (const group of commaGroups) {
    variants.push(group.replace(/[^\d]/g, ''));
  }
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
  const accepted = [...new Set(sets.map((arr) => arr.join('')))];
  const targetSet = sets[0] ?? [];
  return { acceptedAnswers: accepted, targetSet };
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

  const answerLine =
    lines.find((l) => /^Ответ:/i.test(l) && /\d/.test(l)) ??
    '';
  const rawAnswerText = normalizeSpaces(answerLine.replace(/^Ответ:\s*/i, ''));
  const { acceptedAnswers, targetSet } = parseAnswerSet(rawAnswerText);

  const explanationMatch = block.text.match(/Пояснение\.\s*([\s\S]*?)(?=\n\s*Ответ:|$)/u);
  const explanation = normalizeSpaces(explanationMatch?.[1] ?? '');

  return {
    seedKey: `${meta.taskCode}-bank-${block.problemId}`,
    problemId: block.problemId,
    examTask: meta.type,
    prompt,
    taskText,
    rawAnswerText,
    acceptedAnswers,
    targetSet,
    explanation,
    sourceUrl: `https://rus-ege.sdamgia.ru/problem?id=${block.problemId}`,
  };
}

async function parseFile(meta) {
  const filePath = path.resolve(SRC_DIR, meta.name);
  const content = await readFile(filePath, 'utf8');
  const blocks = splitBlocks(content);
  return blocks.map((block) => parseBlock(block, meta));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const meta of FILES) {
    const items = await parseFile(meta);
    const outPath = path.resolve(OUT_DIR, `type-${meta.type}.jsonl`);
    const jsonl = items.map((item) => JSON.stringify(item)).join('\n');
    await writeFile(outPath, `${jsonl}\n`, 'utf8');
    console.log(`Parsed type ${meta.type}: ${items.length} -> ${outPath}`);
  }
}

await main();
