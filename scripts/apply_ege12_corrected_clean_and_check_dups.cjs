const fs = require('fs');
const postgres = require('postgres');
require('dotenv').config();

const FILE_PATH = 'C:/Users/Breeze/Downloads/ege12_formatted_corrected_clean.md';

function parseSections(md) {
  const sections = new Map();
  const re = /^##\s+(\d{4,6})\s*$/gm;
  const matches = [...md.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const ref = Number(matches[i][1]);
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const body = md.slice(start, end).trim();
    if (!body) throw new Error(`Empty explanation for ${ref}`);
    sections.set(ref, body);
  }
  return { sections, totalBlocks: matches.length };
}

(async () => {
  const md = fs.readFileSync(FILE_PATH, 'utf8');
  const { sections, totalBlocks } = parseSections(md);
  const refs = [...sections.keys()].sort((a, b) => a - b);

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select id, seed_key, source_alignment
      from exercises
      where type='ege_multi_select'
        and (seed_key like 'ege12-%' or exists (select 1 from unnest(skill_tags) t where t='ege.12'))
    `;

    const byRef = new Map();
    for (const row of rows) {
      const raw = row.source_alignment?.reference;
      if (typeof raw !== 'string') continue;
      const m = raw.match(/(\d{4,6})$/);
      if (!m) continue;
      const ref = Number(m[1]);
      if (!byRef.has(ref)) byRef.set(ref, []);
      byRef.get(ref).push(row.id);
    }

    const missing = refs.filter((ref) => !byRef.has(ref));
    if (missing.length) throw new Error(`Missing refs in DB: ${missing.join(', ')}`);

    const dupRefs = refs.filter((ref) => byRef.get(ref).length > 1);

    let updatedRows = 0;
    await sql.begin(async (tx) => {
      for (const ref of refs) {
        const ids = byRef.get(ref);
        for (const id of ids) {
          await tx`update exercises set explanation=${sections.get(ref)} where id=${id}`;
          updatedRows++;
        }
      }
    });

    console.log('TOTAL_BLOCKS_IN_FILE', totalBlocks);
    console.log('UNIQUE_REFS_IN_FILE', refs.length);
    console.log('UPDATED_ROWS', updatedRows);
    console.log('DUP_REFS_COUNT', dupRefs.length);
    if (dupRefs.length) {
      const d = dupRefs.map((r) => `${r}=>[${byRef.get(r).join(',')}]`).join(';');
      console.log('DUP_REFS', d);
    }
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
