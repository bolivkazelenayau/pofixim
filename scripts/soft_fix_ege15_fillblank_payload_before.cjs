const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ];
  return parts.join('');
}

function stripInvisible(value) {
  return String(value ?? '').replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '');
}

function countMarkers(text) {
  return [...String(text ?? '').matchAll(/\((\d+)\)/g)].length;
}

function findCutIndex(before) {
  const patterns = [
    /\*{0,2}\s*\u041f\u043e\u044f\u0441\u043d\u0435\u043d\u0438\u0435\.\s*\*{0,2}/u,
    /\b\u041f\u043e\u044f\u0441\u043d\u0435\u043d\u0438\u0435\./u,
    /\b\u041e\u0442\u0432\u0435\u0442:\s*\d/u,
  ];

  let best = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(before);
    if (!match) continue;
    if (best === -1 || match.index < best) best = match.index;
  }
  return best;
}

function cleanBefore(before) {
  const source = stripInvisible(before);
  const cutIndex = findCutIndex(source);
  if (cutIndex === -1) {
    return { changed: false, cleaned: source, reason: 'marker_not_found' };
  }

  const cleaned = source
    .slice(0, cutIndex)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

  if (!cleaned) {
    return { changed: false, cleaned: source, reason: 'empty_after_cut' };
  }

  if (cleaned === source.trim()) {
    return { changed: false, cleaned: source, reason: 'unchanged' };
  }

  return { changed: true, cleaned, reason: 'trimmed' };
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      select id, seed_key, payload, explanation
      from exercises
      where type = 'fill_blank'
        and (seed_key like 'ege15-%' or seed_key like 'live-ege15-%' or exists (select 1 from unnest(skill_tags) t where t='ege.15'))
      order by id asc
    `;

    const candidates = [];
    const skipped = [];

    for (const row of rows) {
      const before = String(row.payload?.before ?? '');
      const result = cleanBefore(before);
      if (!result.changed) {
        skipped.push({ id: row.id, seedKey: row.seed_key, reason: result.reason });
        continue;
      }

      const oldMarkerCount = countMarkers(before);
      const newMarkerCount = countMarkers(result.cleaned);

      if (newMarkerCount === 0 && oldMarkerCount > 0) {
        skipped.push({ id: row.id, seedKey: row.seed_key, reason: 'lost_all_markers' });
        continue;
      }

      if (newMarkerCount > oldMarkerCount) {
        skipped.push({ id: row.id, seedKey: row.seed_key, reason: 'marker_count_increased' });
        continue;
      }

      candidates.push({
        id: row.id,
        seedKey: row.seed_key,
        oldBefore: before,
        newBefore: result.cleaned,
        oldMarkerCount,
        newMarkerCount,
        payload: row.payload,
      });
    }

    const backupDir = path.join(process.cwd(), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(
      backupDir,
      `ege15-fillblank-before-backup-${timestamp()}.json`,
    );
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          totalRows: rows.length,
          candidateCount: candidates.length,
          skippedCount: skipped.length,
          candidates,
          skipped,
        },
        null,
        2,
      ),
      'utf8',
    );

    await sql.begin(async (tx) => {
      for (const item of candidates) {
        const nextPayload = { ...(item.payload ?? {}), before: item.newBefore };
        await tx`
          update exercises
          set payload = ${tx.json(nextPayload)}
          where id = ${item.id}
        `;
      }
    });

    console.log('BACKUP_PATH', backupPath);
    console.log('TOTAL_ROWS', rows.length);
    console.log('UPDATED_ROWS', candidates.length);
    console.log('SKIPPED_ROWS', skipped.length);
    console.log(
      'UPDATED_IDS',
      candidates.map((item) => item.id).join(','),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('FAILED', error.message);
  process.exit(1);
});
