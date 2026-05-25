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

  const unpack = (arr) => {
    for (const v of arr) {
      const s = String(v);
      const digits = s.replace(/\D/g, '');
      if (digits) for (const ch of digits) out.push(ch);
      else out.push(s);
    }
  };

  if (Array.isArray(answer.acceptedAnswers)) unpack(answer.acceptedAnswers);
  if (Array.isArray(answer.accepted)) unpack(answer.accepted);

  const seen = new Set();
  return out.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
}

function getOptions(payload) {
  const arr = Array.isArray(payload?.options) ? payload.options : [];
  return arr.slice(0, 5).map((x) => String(x));
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select
        id,
        seed_key,
        payload,
        answer,
        nullif(regexp_replace(coalesce(source_alignment->>'reference',''), '[^0-9]', '', 'g'),'')::int as ref_num,
        explanation
      from exercises
      where type = 'ege_multi_select'
        and (seed_key like 'ege13-%' or exists (select 1 from unnest(skill_tags) t where t='ege.13'))
      order by ref_num asc nulls last, id asc
    `;

    const out = [];
    out.push('# ЕГЭ 13: номер, варианты, правильные ответы и explanation');
    out.push('');

    let count = 0;
    for (const r of rows) {
      const heading = r.ref_num ? String(r.ref_num) : `${r.seed_key ?? `id-${r.id}`}`;
      const answers = extractAnswers(r.answer);
      const options = getOptions(r.payload);

      out.push(`## ${heading}`);
      out.push('');
      out.push('Варианты ответов:');
      out.push(`1) ${options[0] ?? '—'}`);
      out.push(`2) ${options[1] ?? '—'}`);
      out.push(`3) ${options[2] ?? '—'}`);
      out.push(`4) ${options[3] ?? '—'}`);
      out.push(`5) ${options[4] ?? '—'}`);
      out.push('');
      out.push(`Правильные ответы: ${answers.length ? answers.join(', ') : '—'}`);
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
    const file = path.join(dir, 'ege13_all_number_options_answers_explanation.md');
    fs.writeFileSync(file, out.join('\n'), 'utf8');
    console.log(file);
  } finally {
    await sql.end();
  }
})();
