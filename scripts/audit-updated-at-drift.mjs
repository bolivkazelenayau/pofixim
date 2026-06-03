import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
});

function classifyRow(row) {
  const updatedAt = String(row.updated_at ?? '');
  const seedKey = String(row.seed_key ?? '');
  const hour = Number(updatedAt.slice(11, 13));

  const looksLikeManualFixWindow =
    row.updated_date === '2026-05-29'
    && hour >= 0
    && hour <= 2;

  const looksLikeBatchWindow =
    row.updated_date === '2026-05-29'
    && hour === 3;

  const looksLikeTargetFamily =
    seedKey.startsWith('ege14-bank-')
    || seedKey.startsWith('live-ege14-');

  if (looksLikeManualFixWindow && looksLikeTargetFamily) {
    return 'safe_fix';
  }

  if (looksLikeBatchWindow && looksLikeTargetFamily) {
    return 'manual_review';
  }

  return 'ignore';
}

async function main() {
  const rows = await sql`
    select
      id,
      seed_key,
      type,
      quality_status,
      updated_at::text as updated_at,
      updated_at::date::text as updated_date
    from exercises
    where updated_at::date = date '2026-05-29'
    order by updated_at asc, id asc
  `;

  const safeFix = [];
  const manualReview = [];

  for (const row of rows) {
    const bucket = classifyRow(row);
    if (bucket === 'safe_fix') safeFix.push(row);
    if (bucket === 'manual_review') manualReview.push(row);
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalRowsOnDate: rows.length,
    safeFixCount: safeFix.length,
    manualReviewCount: manualReview.length,
    safeFix,
    manualReview,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
