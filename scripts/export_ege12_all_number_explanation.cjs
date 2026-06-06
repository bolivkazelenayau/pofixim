const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

(async () => {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select
        id,
        seed_key,
        nullif(regexp_replace(coalesce(source_alignment->>'reference',''), '[^0-9]', '', 'g'),'')::int as ref_num,
        explanation
      from exercises
      where type = 'ege_multi_select'
        and (seed_key like 'ege12-%' or exists (select 1 from unnest(skill_tags) t where t='ege.12'))
      order by ref_num asc nulls last, id asc
    `;

    const out = [];
    out.push('# ЕГЭ 12: номер и explanation');
    out.push('');

    let count = 0;
    for (const r of rows) {
      const heading = r.ref_num ? String(r.ref_num) : `${r.seed_key ?? `id-${r.id}`}`;
      out.push(`## ${heading}`);
      out.push('');
      out.push(`- ID в базе: ${r.id}`);
      out.push('');
      out.push(String(r.explanation ?? ''));
      out.push('');
      count++;
    }

    out.push('---');
    out.push('');
    out.push(`Всего: ${count}`);

    const dir = path.join(process.cwd(), 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'ege12_all_number_explanation.md');
    fs.writeFileSync(file, `\uFEFF${out.join('\n')}`, 'utf8');
    console.log(file);
  } finally {
    await sql.end();
  }
})();
