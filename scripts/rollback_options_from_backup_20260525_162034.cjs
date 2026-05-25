const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

const backupPath = path.join(process.cwd(), 'backups', 'db-backup-20260525-162034', 'tables', 'exercises.json');

function isArray(x) { return Array.isArray(x); }

(async () => {
  const raw = fs.readFileSync(backupPath, 'utf8');
  const data = JSON.parse(raw);

  const restore = [];
  for (const row of data) {
    const opts = row?.payload?.options;
    if (isArray(opts) && opts.length > 5) {
      restore.push({ id: Number(row.id), options: opts });
    }
  }

  if (restore.length === 0) {
    console.log('RESTORE_CANDIDATES 0');
    return;
  }

  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql.begin(async (tx) => {
      for (const r of restore) {
        await tx`
          update exercises
          set payload = jsonb_set(payload, '{options}', ${tx.json(r.options)}::jsonb, false)
          where id = ${r.id}
        `;
      }
    });

    const [{ count: gt5 }] = await sql`
      select count(*)::int as count
      from exercises
      where jsonb_typeof(payload->'options')='array'
        and jsonb_array_length(payload->'options') > 5
    `;

    console.log('RESTORED_ROWS', restore.length);
    console.log('POSTCHECK_OPTIONS_GT5', gt5);
  } finally {
    await sql.end();
  }
})();
