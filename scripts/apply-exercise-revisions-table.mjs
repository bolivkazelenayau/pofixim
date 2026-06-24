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
      version integer not null,
      source text not null,
      actor_label text,
      batch_id text,
      snapshot jsonb not null,
      changed_fields text[] not null default '{}',
      summary text,
      created_at timestamp not null default now()
    )
  `);

  await sql.unsafe(`alter table exercise_revisions add column if not exists version integer`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists source text`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists actor_label text`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists batch_id text`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists snapshot jsonb`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists changed_fields text[] not null default '{}'`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists summary text`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists action text`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists snapshot_before jsonb`);
  await sql.unsafe(`alter table exercise_revisions add column if not exists snapshot_after jsonb`);
  await sql.unsafe(`alter table exercise_revisions alter column action drop not null`);
  await sql.unsafe(`alter table exercise_revisions alter column actor_label drop not null`);
  await sql.unsafe(`
    update exercise_revisions
    set
      source = coalesce(
        source,
        case action
          when 'create' then 'create'
          when 'baseline' then 'baseline'
          when 'batch_update' then 'batch'
          when 'delete' then 'delete'
          else 'manual'
        end
      ),
      snapshot = coalesce(snapshot, snapshot_after, snapshot_before),
      summary = coalesce(summary, action)
    where source is null or snapshot is null or summary is null
  `);
  await sql.unsafe(`
    with numbered as (
      select
        id,
        row_number() over (partition by exercise_id order by created_at asc, id asc)::integer as next_version
      from exercise_revisions
      where version is null
    )
    update exercise_revisions r
    set version = numbered.next_version
    from numbered
    where r.id = numbered.id
  `);
  await sql.unsafe(`delete from exercise_revisions where snapshot is null`);
  await sql.unsafe(`alter table exercise_revisions alter column version set not null`);
  await sql.unsafe(`alter table exercise_revisions alter column source set not null`);
  await sql.unsafe(`alter table exercise_revisions alter column snapshot set not null`);

  await sql.unsafe(`
    create index if not exists exercise_revisions_exercise_created_idx
    on exercise_revisions (exercise_id, created_at)
  `);

  await sql.unsafe(`
    create index if not exists exercise_revisions_exercise_version_idx
    on exercise_revisions (exercise_id, version)
  `);

  await sql.unsafe(`
    create index if not exists exercise_revisions_batch_idx
    on exercise_revisions (batch_id)
  `);

  await sql.unsafe(`
    create index if not exists exercise_revisions_created_at_idx
    on exercise_revisions (created_at)
  `);

  console.log('OK: exercise revisions table is ready');
} finally {
  await sql.end();
}
