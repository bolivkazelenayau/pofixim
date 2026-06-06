const fs = require('fs');
const postgres = require('postgres');
require('dotenv').config();

const FILE_PATH = 'C:/Users/Breeze/Downloads/ege13_type13_reformatted_without_etalon_ids.md';

function validateFiveRows(explanation, contextLabel) {
  const matches = [...String(explanation).matchAll(/\*\*Ряд\s+([1-5])\*\*/g)];
  if (matches.length !== 5) {
    throw new Error(`${contextLabel}: expected 5 row headers, got ${matches.length}`);
  }

  const rowNumbers = matches.map((match) => Number(match[1])).sort((a, b) => a - b);
  const expected = '1,2,3,4,5';
  if (rowNumbers.join(',') !== expected) {
    throw new Error(`${contextLabel}: expected row numbers ${expected}, got ${rowNumbers.join(',')}`);
  }
}

function parseEntries(md) {
  const sections = new Map();
  const headerRe = /^##\s+(\d{4,6})\s*$/gm;
  const matches = [...md.matchAll(headerRe)];

  for (let index = 0; index < matches.length; index += 1) {
    const number = Number(matches[index][1]);
    const start = matches[index].index + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : md.length;
    const block = md.slice(start, end).trim();

    const idMatch = block.match(/^- ID в базе:\s*(\d+)\s*$/m);
    if (!idMatch) {
      throw new Error(`Section ${number}: ID not found`);
    }

    const id = Number(idMatch[1]);
    const explanationStart = block.indexOf(idMatch[0]) + idMatch[0].length;
    const explanation = block
      .slice(explanationStart)
      .replace(/^\s*Варианты ответов:[\s\S]*?(?=^\s*-\s*Правильные ответы:)/m, '')
      .replace(/^\s*-\s*Правильные ответы:[^\n]*\n?/m, '')
      .trim();

    if (!explanation) {
      throw new Error(`Section ${number}, id ${id}: explanation is empty`);
    }

    validateFiveRows(explanation, `Section ${number}, id ${id}`);

    if (sections.has(id)) {
      throw new Error(`Duplicate ID in markdown: ${id}`);
    }

    sections.set(id, { id, number, explanation });
  }

  if (sections.size === 0) {
    throw new Error('No sections found in markdown');
  }

  return sections;
}

async function main() {
  const md = fs.readFileSync(FILE_PATH, 'utf8');
  const sectionsById = parseEntries(md);
  const ids = [...sectionsById.keys()].sort((a, b) => a - b);

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select id, seed_key, explanation
      from exercises
      where id = any(${ids})
      order by id asc
    `;

    if (rows.length !== ids.length) {
      const foundIds = new Set(rows.map((row) => row.id));
      const missingIds = ids.filter((id) => !foundIds.has(id));
      throw new Error(`IDs not found in DB: ${missingIds.join(', ')}`);
    }

    const updates = rows.map((row) => {
      const next = sectionsById.get(row.id);
      return {
        id: row.id,
        number: next.number,
        explanation: next.explanation,
        changed: String(row.explanation ?? '') !== next.explanation,
      };
    });

    await sql.begin(async (tx) => {
      for (const update of updates) {
        await tx`
          update exercises
          set explanation = ${update.explanation}
          where id = ${update.id}
        `;
      }
    });

    console.log('UPDATED_TOTAL', updates.length);
    console.log('CHANGED_TOTAL', updates.filter((item) => item.changed).length);
    console.log('UPDATED_IDS', updates.map((item) => item.id).join(','));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('FAILED', error.message);
  process.exit(1);
});
