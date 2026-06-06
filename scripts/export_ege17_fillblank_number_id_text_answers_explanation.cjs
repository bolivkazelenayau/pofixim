const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

function extractNumber(row) {
  const ref = row.source_alignment?.reference;
  if (typeof ref === 'string') {
    const refMatch = ref.match(/(\d{3,6})$/);
    if (refMatch) return refMatch[1];
  }

  const seedKey = String(row.seed_key ?? '');
  const seedMatch = seedKey.match(/(?:live-)?ege17(?:-bank)?-(\d+)$/);
  if (seedMatch) return seedMatch[1];

  return row.seed_key ?? `id-${row.id}`;
}

function countMarkers(text) {
  return [...String(text ?? '').matchAll(/\((\d+)\)/g)].length;
}

function extractMarkerOptions(text) {
  const values = [...String(text ?? '').matchAll(/\((\d+)\)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(values)].sort((a, b) => a - b);
}

function buildTaskText(payload) {
  const before = String(payload?.before ?? '').trim();
  const after = String(payload?.after ?? '').trim();

  if (before && after) {
    const spacer = after.startsWith(',') || after.startsWith('.') ? '' : ' ';
    return `${before} ___${spacer}${after}`.trim();
  }

  return before || after || '';
}

function extractAccepted(answer) {
  const accepted = Array.isArray(answer?.accepted)
    ? answer.accepted.map((value) => String(value).trim()).filter(Boolean)
    : [];
  return [...new Set(accepted)];
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
        explanation,
        source_alignment
      from exercises
      where type = 'fill_blank'
        and (
          seed_key like 'ege17-%'
          or seed_key like 'live-ege17-%'
          or exists (select 1 from unnest(skill_tags) t where t='ege.17')
        )
      order by id asc
    `;

    const out = [];
    out.push('# ЕГЭ 17 fill_blank: номер, ID, текст, правильные ответы и explanation');
    out.push('');

    let count = 0;
    for (const row of rows) {
      const heading = extractNumber(row);
      const taskText = buildTaskText(row.payload);
      const accepted = extractAccepted(row.answer);
      const markerCount = countMarkers(taskText);
      const markerOptions = extractMarkerOptions(taskText);

      out.push(`## ${heading}`);
      out.push('');
      out.push(`- ID в базе: ${row.id}`);
      out.push(`- Количество позиций: ${markerCount}`);
      out.push(`- Варианты ответов: ${markerOptions.length ? markerOptions.join(' | ') : '—'}`);
      out.push(`- Правильные ответы: ${accepted.length ? accepted.join(' | ') : '—'}`);
      out.push('');
      out.push('### Текст задания');
      out.push('');
      out.push(taskText || '—');
      out.push('');
      out.push('### Explanation');
      out.push('');
      out.push(String(row.explanation ?? ''));
      out.push('');

      count += 1;
    }

    out.push('---');
    out.push('');
    out.push(`Всего: ${count}`);

    const dir = path.join(process.cwd(), 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'ege17_fillblank_number_id_text_answers_explanation.md');
    fs.writeFileSync(file, `\uFEFF${out.join('\n')}`, 'utf8');
    console.log(file);
  } finally {
    await sql.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
