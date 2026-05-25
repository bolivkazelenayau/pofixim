const fs = require('fs');
const postgres = require('postgres');
require('dotenv').config();

const FILE_PATH = 'C:/Users/Breeze/Downloads/ege9_108_reformatted_reviewed_full.md';

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
  return sections;
}

(async () => {
  const md = fs.readFileSync(FILE_PATH, 'utf8');
  const sections = parseSections(md);
  const refs = [...sections.keys()].sort((a, b) => a - b);
  if (refs.length !== 108) {
    throw new Error(`Expected 108 sections, got ${refs.length}`);
  }

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select id, source_alignment
      from exercises
      where type='ege_multi_select'
        and exists (select 1 from unnest(skill_tags) t where t='ege.9')
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

    const nonUnique = refs.filter((ref) => byRef.get(ref).length !== 1);
    if (nonUnique.length) {
      const msg = nonUnique.map((r) => `${r}=>[${byRef.get(r).join(',')}]`).join('; ');
      throw new Error(`Non-unique mapping: ${msg}`);
    }

    const updates = refs.map((ref) => ({ ref, id: byRef.get(ref)[0], explanation: sections.get(ref) }));

    await sql.begin(async (tx) => {
      for (const u of updates) {
        await tx`update exercises set explanation=${u.explanation} where id=${u.id}`;
      }
    });

    console.log('UPDATED_COUNT', updates.length);
    console.log('UPDATED_REFS', updates.map((u) => u.ref).join(','));
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
