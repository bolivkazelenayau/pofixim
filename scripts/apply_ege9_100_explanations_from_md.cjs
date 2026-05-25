const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

const IDS_PATH = 'C:/Users/Breeze/Downloads/ege9_selected_100_ids.md';
const EXPL_PATH = 'C:/Users/Breeze/Downloads/ege9_selected_100_formatted_explanations.md';

function parseIds(md) {
  const set = new Set();
  for (const m of md.matchAll(/^\s*\d+\.\s*(\d{4,6})\s*$/gm)) {
    set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

function parseSections(md) {
  const sections = new Map();
  const re = /^##\s+(\d{4,6})\s*$/gm;
  const matches = [...md.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const id = Number(matches[i][1]);
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const body = md.slice(start, end).trim();
    sections.set(id, body);
  }
  return sections;
}

function targetSetFromAnswer(answer) {
  if (Array.isArray(answer?.targetSet)) return new Set(answer.targetSet.map(Number));
  const s = new Set();
  if (Array.isArray(answer?.acceptedAnswers)) {
    for (const v of answer.acceptedAnswers) {
      for (const ch of String(v).replace(/\D/g, '')) s.add(Number(ch));
    }
  }
  if (Array.isArray(answer?.accepted)) {
    for (const v of answer.accepted) {
      for (const ch of String(v).replace(/\D/g, '')) s.add(Number(ch));
    }
  }
  return s;
}

function applyStatuses(text, targetSet) {
  const chunks = text
    .split(/\n\s*\n/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const out = chunks.map((chunk) => {
    const m = chunk.match(/Ряд\s*([1-5])/u);
    if (!m) return chunk;
    const row = Number(m[1]);
    const status = targetSet.has(row) ? 'подходит' : 'не подходит';

    let next = chunk;
    next = next.replace(/\*\*\{\{статус по correctAnswers\}\}\*\*/g, `**${status}**`);
    next = next.replace(/—\s*\*\*(?:подходит|не подходит)\*\*\.?$/u, `— **${status}**.`);

    if (!/—\s*\*\*(?:подходит|не подходит)\*\*/u.test(next)) {
      next = `${next.replace(/[. ]+$/g, '')} — **${status}**.`;
    }
    if (!next.endsWith('.')) next += '.';
    return next;
  });

  return out.join('\n\n');
}

async function main() {
  const idsMd = fs.readFileSync(IDS_PATH, 'utf8');
  const explMd = fs.readFileSync(EXPL_PATH, 'utf8');
  const ids = parseIds(idsMd);
  const sections = parseSections(explMd);

  if (ids.length !== 100) {
    throw new Error(`Expected 100 ids, got ${ids.length}`);
  }

  const rows = await sql`
    select id, source_alignment, answer, explanation
    from exercises
    where type='ege_multi_select'
      and exists (select 1 from unnest(skill_tags) t where t='ege.9')
    order by id
  `;

  const byRef = new Map();
  for (const row of rows) {
    const ref = row.source_alignment?.reference;
    if (typeof ref !== 'string') continue;
    const m = ref.match(/(\d{4,6})$/);
    if (!m) continue;
    byRef.set(Number(m[1]), row);
  }

  const missingRows = ids.filter((n) => !byRef.has(n));
  if (missingRows.length) {
    throw new Error(`No DB rows found for source refs: ${missingRows.join(', ')}`);
  }

  const missingSections = ids.filter((n) => !sections.has(n));
  if (missingSections.length) {
    throw new Error(`Missing explanation sections for source refs: ${missingSections.join(', ')}`);
  }

  const updated = [];
  for (const sourceRef of ids) {
    const row = byRef.get(sourceRef);
    const src = sections.get(sourceRef);
    const targetSet = targetSetFromAnswer(row.answer);
    const nextExpl = applyStatuses(src, targetSet);
    await sql`update exercises set explanation=${nextExpl} where id=${row.id}`;
    updated.push(`${row.id}<-${sourceRef}`);
  }

  console.log('UPDATED_COUNT', updated.length);
  console.log('UPDATED_IDS', updated.join(','));
}

main()
  .catch((e) => {
    console.error('FAILED', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
