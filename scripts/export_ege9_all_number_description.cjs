const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

(async () => {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select
        nullif(regexp_replace(coalesce(source_alignment->>'reference',''), '[^0-9]', '', 'g'),'')::int as ref_num,
        explanation
      from exercises
      where type = 'ege_multi_select'
        and exists (select 1 from unnest(skill_tags) t where t='ege.9')
      order by ref_num asc nulls last, id asc
    `;

    const out = [];
    out.push('# ЕГЭ 9: номер и description');
    out.push('');

    let count = 0;
    for (const r of rows) {
      if (!r.ref_num) continue;
      out.push(`## ${r.ref_num}`);
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
    const file = path.join(dir, 'ege9_all_number_description.md');
    fs.writeFileSync(file, out.join('\n'), 'utf8');
    console.log(file);
  } finally {
    await sql.end();
  }
})();
