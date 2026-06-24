import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const SNAPSHOT_FIELDS = [
  'id',
  'seedKey',
  'type',
  'category',
  'difficulty',
  'skillTags',
  'prompt',
  'payload',
  'answer',
  'explanation',
  'searchBlob',
  'searchBlobNormalized',
  'sourceAlignment',
  'typicalMistake',
  'mistakeModel',
  'algorithmSteps',
  'transferGroup',
  'qualityStatus',
  'visualHint',
  'isActive',
];

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

try {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
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

    await tx.unsafe(`alter table exercise_revisions add column if not exists version integer`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists source text`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists actor_label text`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists batch_id text`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists snapshot jsonb`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists changed_fields text[] not null default '{}'`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists summary text`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists action text`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists snapshot_before jsonb`);
    await tx.unsafe(`alter table exercise_revisions add column if not exists snapshot_after jsonb`);
    await tx.unsafe(`alter table exercise_revisions alter column action drop not null`);
    await tx.unsafe(`alter table exercise_revisions alter column actor_label drop not null`);
    await tx.unsafe(`
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
    await tx.unsafe(`
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
    await tx.unsafe(`delete from exercise_revisions where snapshot is null`);
    await tx.unsafe(`alter table exercise_revisions alter column version set not null`);
    await tx.unsafe(`alter table exercise_revisions alter column source set not null`);
    await tx.unsafe(`alter table exercise_revisions alter column snapshot set not null`);

    await tx.unsafe(`
      create index if not exists exercise_revisions_exercise_created_idx
      on exercise_revisions (exercise_id, created_at)
    `);

    await tx.unsafe(`
      create index if not exists exercise_revisions_exercise_version_idx
      on exercise_revisions (exercise_id, version)
    `);

    await tx.unsafe(`
      create index if not exists exercise_revisions_batch_idx
      on exercise_revisions (batch_id)
    `);

    await tx.unsafe(`
      create index if not exists exercise_revisions_created_at_idx
      on exercise_revisions (created_at)
    `);

    const result = await tx.unsafe(
      `
        insert into exercise_revisions (
          exercise_id,
          version,
          source,
          actor_label,
          batch_id,
          snapshot,
          changed_fields,
          summary,
          created_at
        )
        select
          e.id,
          1,
          'baseline',
          'system',
          null,
          jsonb_build_object(
            'id', e.id,
            'seedKey', e.seed_key,
            'type', e.type,
            'category', e.category,
            'difficulty', e.difficulty,
            'skillTags', e.skill_tags,
            'prompt', e.prompt,
            'payload', e.payload,
            'answer', e.answer,
            'explanation', e.explanation,
            'searchBlob', e.search_blob,
            'searchBlobNormalized', e.search_blob_normalized,
            'sourceAlignment', e.source_alignment,
            'typicalMistake', e.typical_mistake,
            'mistakeModel', e.mistake_model,
            'algorithmSteps', e.algorithm_steps,
            'transferGroup', e.transfer_group,
            'qualityStatus', e.quality_status,
            'visualHint', e.visual_hint,
            'isActive', e.is_active
          ),
          $1::text[],
          'Baseline snapshot',
          now()
        from exercises e
        where not exists (
          select 1
          from exercise_revisions r
          where r.exercise_id = e.id
        )
      `,
      [SNAPSHOT_FIELDS],
    );

    console.log(`OK: baseline revisions inserted: ${result.count}`);
  });
} finally {
  await sql.end();
}
