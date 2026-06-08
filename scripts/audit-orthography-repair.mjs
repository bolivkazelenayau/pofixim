import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  const count = await sql.unsafe(
    "select count(*)::int as count from exercises where type='orthography_repair'",
  );
  const sample = await sql.unsafe(
    "select id, seed_key, payload, answer from exercises where type='orthography_repair' order by id limit 3",
  );
  console.log(
    JSON.stringify(
      {
        count: count[0]?.count ?? 0,
        sample: sample.map((row) => ({
          id: row.id,
          seedKey: row.seed_key,
          targets: row.payload?.targets,
          repairs: row.answer?.repairs,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
