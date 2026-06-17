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
        action text not null,
        actor_label text not null default 'admin',
        changed_fields text[] not null default '{}',
        snapshot_before jsonb,
        snapshot_after jsonb,
        created_at timestamp not null default now()
      )
    `);

    await tx.unsafe(`
      create index if not exists exercise_revisions_exercise_created_idx
      on exercise_revisions (exercise_id, created_at)
    `);

    await tx.unsafe(`
      create index if not exists exercise_revisions_created_at_idx
      on exercise_revisions (created_at)
    `);

    const result = await tx.unsafe(
      `
        insert into exercise_revisions (
          exercise_id,
          action,
          actor_label,
          changed_fields,
          snapshot_before,
          snapshot_after,
          created_at
        )
        select
          e.id,
          'baseline',
          'system',
          $1::text[],
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
