const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

function usage() {
  console.error('Usage: node scripts/apply_fillblank_explanations_from_md.cjs <mdFilePath> <egeNumber>');
  process.exit(1);
}

function normalizeText(text) {
  return String(text ?? '').replace(/^\uFEFF/, '');
}

function parseEntries(md) {
  const sections = new Map();
  const skippedEmpty = [];
  const headerRe = /^##\s+(\d{1,6})\s*$/gm;
  const matches = [...md.matchAll(headerRe)];

  for (let index = 0; index < matches.length; index += 1) {
    const number = matches[index][1];
    const start = matches[index].index + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : md.length;
    const block = md.slice(start, end).trim();

    const lines = block.split(/\r?\n/);
    const idLine = lines.find((line) => line.includes('ID'));
    const idMatch = idLine ? idLine.match(/(\d+)/) : null;
    if (!idMatch) {
      throw new Error(`Section ${number}: ID not found`);
    }

    const id = Number(idMatch[1]);
    const explanationMarker = '### Explanation';
    const markerIndex = block.indexOf(explanationMarker);
    if (markerIndex === -1) {
      throw new Error(`Section ${number}, id ${id}: Explanation marker not found`);
    }

    const explanation = block
      .slice(markerIndex + explanationMarker.length)
      .replace(/\n---[\s\S]*$/u, '')
      .trim();

    if (!explanation) {
      skippedEmpty.push({ id, number });
      continue;
    }

    if (sections.has(id)) {
      throw new Error(`Duplicate ID in markdown: ${id}`);
    }

    sections.set(id, { id, number, explanation });
  }

  if (sections.size === 0) {
    throw new Error('No sections found in markdown');
  }

  return { sections, skippedEmpty };
}

function buildSeedPattern(egeNumber) {
  return new RegExp(`^(?:live-)?ege${egeNumber}(?:-bank)?-\\d+$`);
}

async function main() {
  const filePath = process.argv[2];
  const egeNumber = process.argv[3];
  if (!filePath || !egeNumber) usage();

  const absoluteFilePath = path.resolve(filePath);
  const md = normalizeText(fs.readFileSync(absoluteFilePath, 'utf8'));
  const { sections: sectionsById, skippedEmpty } = parseEntries(md);
  const ids = [...sectionsById.keys()].sort((a, b) => a - b);
  const seedPattern = buildSeedPattern(egeNumber);

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select id, seed_key, type, explanation
      from exercises
      where id = any(${ids})
      order by id asc
    `;

    const foundIds = new Set(rows.map((row) => row.id));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    const existingRows = rows.filter((row) => foundIds.has(row.id));

    for (const row of existingRows) {
      if (row.type !== 'fill_blank') {
        throw new Error(`ID ${row.id}: expected type fill_blank, got ${row.type}`);
      }
      if (!seedPattern.test(String(row.seed_key ?? ''))) {
        throw new Error(`ID ${row.id}: unexpected seed_key ${row.seed_key}`);
      }
    }

    const updates = existingRows.map((row) => {
      const next = sectionsById.get(row.id);
      return {
        id: row.id,
        number: next.number,
        seedKey: row.seed_key,
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

    console.log('FILE', absoluteFilePath);
    console.log('SKIPPED_EMPTY_TOTAL', skippedEmpty.length);
    console.log('SKIPPED_EMPTY_IDS', skippedEmpty.map((item) => item.id).join(','));
    console.log('MISSING_IN_DB_TOTAL', missingIds.length);
    console.log('MISSING_IN_DB_IDS', missingIds.join(','));
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
