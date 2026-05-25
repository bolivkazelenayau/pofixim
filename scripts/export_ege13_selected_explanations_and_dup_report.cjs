const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

const INPUT = 'C:/Users/Breeze/Downloads/ege13_formatted_with_answers_corrected.md';

function parseRefs(md) {
  const refs = [];
  const re = /^##\s+(\d{4,6})\s*$/gm;
  for (const m of md.matchAll(re)) refs.push(Number(m[1]));
  return refs;
}

(async () => {
  const md = fs.readFileSync(INPUT, 'utf8');
  const rawRefs = parseRefs(md);
  const uniqRefs = [...new Set(rawRefs)].sort((a,b)=>a-b);

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select
        id,
        seed_key,
        explanation,
        nullif(regexp_replace(coalesce(source_alignment->>'reference',''), '[^0-9]', '', 'g'),'')::int as ref_num
      from exercises
      where type='ege_multi_select'
        and (seed_key like 'ege13-%' or exists (select 1 from unnest(skill_tags) t where t='ege.13'))
    `;

    const byRef = new Map();
    for (const r of rows) {
      if (!r.ref_num) continue;
      if (!byRef.has(r.ref_num)) byRef.set(r.ref_num, []);
      byRef.get(r.ref_num).push(r);
    }

    const out = [];
    out.push('# ЕГЭ 13: explanation по выбранным номерам');
    out.push('');

    const missing = [];
    const dupReport = [];
    let dumped = 0;

    for (const ref of uniqRefs) {
      const list = byRef.get(ref) || [];
      if (list.length === 0) {
        missing.push(ref);
        continue;
      }
      if (list.length > 1) {
        dupReport.push({ ref, ids: list.map(x => x.id) });
      }

      // dump one block per DB row so duplicates are explicit
      for (const row of list.sort((a,b)=>a.id-b.id)) {
        out.push(`## ${ref}`);
        out.push('');
        out.push(`ID в БД: ${row.id}`);
        out.push('');
        out.push(String(row.explanation ?? ''));
        out.push('');
        dumped++;
      }
    }

    out.push('---');
    out.push('');
    out.push(`Номеров в файле: ${rawRefs.length}`);
    out.push(`Уникальных номеров: ${uniqRefs.length}`);
    out.push(`Выгружено explanation-блоков из БД: ${dumped}`);
    out.push(`Не найдены в БД: ${missing.length}`);
    if (missing.length) out.push(`Список отсутствующих: ${missing.join(', ')}`);

    const outDir = path.join(process.cwd(), 'exports');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'ege13_selected_explanations_from_db.md');
    fs.writeFileSync(outPath, out.join('\n'), 'utf8');

    console.log('OUT_FILE', outPath);
    console.log('INPUT_REFS_TOTAL', rawRefs.length);
    console.log('INPUT_REFS_UNIQUE', uniqRefs.length);
    console.log('DUMPED_ROWS', dumped);
    console.log('MISSING_COUNT', missing.length);
    console.log('DUP_COUNT', dupReport.length);
    if (dupReport.length) {
      console.log('DUPS', dupReport.map(d => `${d.ref}=>[${d.ids.join(',')}]`).join(';'));
    }
  } finally {
    await sql.end();
  }
})();
