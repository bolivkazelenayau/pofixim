import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required to apply exercise update notifications.');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

try {
  await sql`
    create or replace function touch_exercise_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      if row(new.*) is distinct from row(old.*) then
        new.updated_at := now()::timestamp;
      end if;

      return new;
    end;
    $$;
  `;

  await sql`
    drop trigger if exists exercise_touch_updated_at on exercises;
  `;

  await sql`
    create trigger exercise_touch_updated_at
    before update on exercises
    for each row
    execute function touch_exercise_updated_at();
  `;

  await sql`
    create or replace function notify_exercise_updated()
    returns trigger
    language plpgsql
    as $$
    declare
      changed_at timestamp;
    begin
      changed_at := coalesce(new.updated_at, now()::timestamp);

      perform pg_notify(
        'exercise_updates',
        json_build_object(
          'exerciseId', new.id,
          'updatedAt', changed_at::text
        )::text
      );

      return new;
    end;
    $$;
  `;

  await sql`
    drop trigger if exists exercise_updated_notify on exercises;
  `;

  await sql`
    create trigger exercise_updated_notify
    after insert or update on exercises
    for each row
    execute function notify_exercise_updated();
  `;

  console.log('OK: exercise update notifications trigger is installed.');
} finally {
  await sql.end();
}
