import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

try {
  await sql.unsafe(`
    create table if not exists exercise_revisions (
      id serial primary key,
      exercise_id integer not null,
      action text not null,
      actor_label text not null default 'admin',
      changed_fields text[] not null default '{}',
      snapshot_before jsonb,
      snapshot_after jsonb,
      created_at timestamp not null default now()
    )
  `);

  await sql.unsafe(`
    create index if not exists exercise_revisions_exercise_created_idx
    on exercise_revisions (exercise_id, created_at)
  `);

  await sql.unsafe(`
    create index if not exists exercise_revisions_created_at_idx
    on exercise_revisions (created_at)
  `);

  console.log('OK: exercise revisions table is ready');
} finally {
  await sql.end();
}
