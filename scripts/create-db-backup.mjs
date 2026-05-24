import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const needQuotes = /[",\r\n]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needQuotes ? `"${escaped}"` : escaped;
  };
  const header = cols.join(',');
  const lines = rows.map((row) => cols.map((c) => esc(row[c])).join(','));
  return [header, ...lines].join('\n');
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString().replace('T', ' ').replace('Z', '+00')}'`;
  if (typeof v === 'object') {
    const s = JSON.stringify(v).replace(/'/g, "''");
    return `'${s}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const backupDir = path.resolve(process.cwd(), 'backups', `db-backup-${nowStamp()}`);
  await fs.mkdir(backupDir, { recursive: true });

  const sql = postgres(dbUrl, { max: 2, idle_timeout: 10, connect_timeout: 10 });
  try {
    const tables = await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;

    const schemaCols = await sql`
      select table_name, column_name, data_type, is_nullable, ordinal_position
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `;
    await fs.writeFile(path.join(backupDir, 'schema-columns.json'), JSON.stringify(schemaCols, null, 2), 'utf8');
    await fs.writeFile(path.join(backupDir, 'schema-columns.csv'), toCsv(schemaCols), 'utf8');

    const summary = {
      createdAt: new Date().toISOString(),
      tables: [],
    };

    for (const t of tables) {
      const table = t.table_name;
      const rows = await sql.unsafe(`select * from "${table}"`);
      const rowsPlain = rows.map((r) => ({ ...r }));

      const tableDir = path.join(backupDir, 'tables');
      await fs.mkdir(tableDir, { recursive: true });
      await fs.writeFile(path.join(tableDir, `${table}.json`), JSON.stringify(rowsPlain, null, 2), 'utf8');
      await fs.writeFile(path.join(tableDir, `${table}.csv`), toCsv(rowsPlain), 'utf8');

      const cols = schemaCols.filter((c) => c.table_name === table).map((c) => c.column_name);
      const insertLines = ['begin;'];
      for (const row of rowsPlain) {
        const values = cols.map((c) => sqlLiteral(row[c]));
        insertLines.push(`insert into "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) values (${values.join(', ')});`);
      }
      insertLines.push('commit;');
      await fs.writeFile(path.join(tableDir, `${table}.insert.sql`), insertLines.join('\n'), 'utf8');

      summary.tables.push({ table, rows: rowsPlain.length });
    }

    await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`Backup created: ${backupDir}`);
    for (const t of summary.tables) {
      console.log(`  ${t.table}: ${t.rows} rows`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Backup failed:', error);
  process.exitCode = 1;
});

