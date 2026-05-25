const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ids = [45794,45795,45796,45797,45798,45803,45804,45805,46166,46167,46169,46172,46176,46177,46262,46291,46512,46513,46516,46517,46519,46521,46523,46524,46525,46527,48129,48157,49134,49161,49712,49713,49714,49716,49717,49718,49720,49721,49722,49723,49725,49728,49729,49731,49732,49734,49735,49736,49737,49739,49962,49991,50211,50271,50298,50325,50446,51517,51830,51857,52525,52552,52984,53303,53330,54094,54176,54217,55133,56086,56113,56503,56530,57074,57107,57511,57539,58088,58363,59245,59272,59303,59502,59674,59873,59904,60215,60242,60926,60953];

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(process.cwd(), '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1].replace(/^"|"$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

(async () => {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  const sql = `
    with target as (
      select unnest($1::int[]) as ref_id
    ), mapped as (
      select
        e.id as exercise_id,
        e.explanation,
        nullif(regexp_replace(coalesce(e.source_alignment->>'reference',''), '[^0-9]', '', 'g'),'')::int as ref_id
      from exercises e
    )
    select t.ref_id, m.exercise_id, m.explanation
    from target t
    left join mapped m on m.ref_id = t.ref_id
    order by t.ref_id;
  `;

  const res = await client.query(sql, [ids]);
  await client.end();

  const missing = [];
  const lines = [];
  lines.push('# EGE 9 (multi_select): номер и explanation');
  lines.push('');

  for (const row of res.rows) {
    const ref = Number(row.ref_id);
    const explanation = row.explanation;
    if (!explanation) {
      missing.push(ref);
      continue;
    }
    lines.push(`## ${ref}`);
    lines.push('');
    lines.push(String(explanation));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`Всего запрошено: ${ids.length}`);
  lines.push(`Выгружено: ${ids.length - missing.length}`);
  lines.push(`Пропущено (не найдено/без explanation): ${missing.length}`);
  if (missing.length) lines.push(`Список пропущенных: ${missing.join(', ')}`);

  const outDir = path.join(process.cwd(), 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ege9_remaining_90_number_explanation.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(outPath);
})();
