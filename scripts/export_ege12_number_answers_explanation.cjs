const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

function extractAnswers(answer) {
  const out = [];

  if (!answer || typeof answer !== 'object') return out;

  if (Array.isArray(answer.targetSet)) {
    for (const v of answer.targetSet) out.push(String(v));
  }

  if (Array.isArray(answer.acceptedAnswers)) {
    for (const v of answer.acceptedAnswers) {
      const s = String(v);
      const digits = s.replace(/\D/g, '');
      if (digits) {
        for (const ch of digits) out.push(ch);
      } else {
        out.push(s);
      }
    }
  }

  if (Array.isArray(answer.accepted)) {
    for (const v of answer.accepted) {
      const s = String(v);
      const digits = s.replace(/\D/g, '');
      if (digits) {
        for (const ch of digits) out.push(ch);
      } else {
        out.push(s);
      }
    }
  }

  // unique preserve order
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select
        id,
        seed_key,
        answer,
        nullif(regexp_replace(coalesce(source_alignment->>'reference',''), '[^0-9]', '', 'g'),'')::int as ref_num,
        explanation
      from exercises
      where type = 'ege_multi_select'
        and (seed_key like 'ege12-%' or exists (select 1 from unnest(skill_tags) t where t='ege.12'))
      order by ref_num asc nulls last, id asc
    `;

    const out = [];
    out.push('# ЕГЭ 12: номер, правильные ответы и explanation');
    out.push('');

    let count = 0;
    for (const r of rows) {
      const heading = r.ref_num ? String(r.ref_num) : `${r.seed_key ?? `id-${r.id}`}`;
      const ans = extractAnswers(r.answer);
      out.push(`## ${heading}`);
      out.push('');
      out.push(`Правильные ответы: ${ans.length ? ans.join(', ') : '—'}`);
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
    const file = path.join(dir, 'ege12_all_number_answers_explanation.md');
    fs.writeFileSync(file, out.join('\n'), 'utf8');
    console.log(file);
  } finally {
    await sql.end();
  }
})();
