const postgres = require('postgres');
require('dotenv').config();

const PROMPT = 'Укажите варианты ответов, в которых в обоих словах одного ряда пропущена **одна и та же буква**. Запишите номера ответов.';

(async () => {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const updated = await sql`
      with targets as (
        select id
        from exercises e
        where e.type='ege_multi_select'
          and (
            e.seed_key like 'ege11-%' or e.seed_key like 'ege12-%'
            or exists (select 1 from unnest(e.skill_tags) s where s in ('ege.11','ege.12'))
          )
      )
      update exercises e
      set prompt = ${PROMPT}
      from targets t
      where e.id = t.id
      returning e.id
    `;

    const sample = await sql`
      select id, seed_key, prompt
      from exercises e
      where e.type='ege_multi_select'
        and (e.seed_key like 'ege11-%' or e.seed_key like 'ege12-%' or exists (select 1 from unnest(e.skill_tags) s where s in ('ege.11','ege.12')))
      order by id
      limit 5
    `;

    console.log('UPDATED', updated.length);
    for (const r of sample) {
      console.log(`${r.id}|${r.seed_key}|${r.prompt}`);
    }
  } finally {
    await sql.end();
  }
})();
