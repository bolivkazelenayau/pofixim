const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

const INPUT_FILES = [
  'C:/Users/Breeze/Downloads/live_ege9_number_id_answer_explanation_formatted.md',
  'C:/Users/Breeze/Downloads/bank_ege9_number_id_answer_explanation_formatted.md',
];

function stripTrailingSummary(text) {
  return String(text ?? '')
    .replace(/\n?---[\s\S]*$/u, '')
    .replace(/\n?\s*Всего\s+выгружено:[\s\S]*$/u, '')
    .trim();
}

function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const normalized = raw.replace(/\r\n/g, '\n');
  const headingRe = /^##\s+(\d{4,6})\s*$/gm;
  const matches = [...normalized.matchAll(headingRe)];
  const items = [];

  for (let index = 0; index < matches.length; index++) {
    const ref = Number(matches[index][1]);
    const start = matches[index].index;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const block = normalized.slice(start, end);
    const idMatch = block.match(/^- ID в базе:\s*(\d+)\s*$/m);
    const explanationMarker = block.match(/^###\s+Explanation\s*$/m);
    if (!idMatch || !explanationMarker) {
      continue;
    }

    const id = Number(idMatch[1]);
    const explanationStart = explanationMarker.index + explanationMarker[0].length;
    const explanation = stripTrailingSummary(block.slice(explanationStart));
    if (!explanation) {
      throw new Error(`Empty explanation for id=${id} ref=${ref} in ${filePath}`);
    }

    items.push({
      id,
      ref,
      explanation,
      filePath,
    });
  }

  if (!items.length) {
    throw new Error(`No explanation blocks parsed from ${filePath}`);
  }

  return items;
}

function sourceKind(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name.includes('bank')) return 'bank';
  if (name.includes('live')) return 'live';
  return 'unknown';
}

function buildUpdates(files) {
  const byId = new Map();

  for (const filePath of files) {
    const items = parseFile(filePath);
    for (const item of items) {
      const existing = byId.get(item.id);
      if (existing && existing.explanation !== item.explanation) {
        throw new Error(
          `Conflicting explanation for id=${item.id}: ${existing.filePath} vs ${item.filePath}`,
        );
      }
      byId.set(item.id, item);
    }
  }

  return [...byId.values()].sort((left, right) => left.id - right.id);
}

(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const parsedItems = buildUpdates(INPUT_FILES);
  const sql = postgres(dbUrl);

  try {
    const ege9Rows = await sql`
      select id, type, seed_key, skill_tags, explanation, source_alignment
      from exercises
      where type = 'ege_multi_select'
        and (
          seed_key like 'ege9-%'
          or exists (select 1 from unnest(skill_tags) s where s = 'ege.9')
        )
      order by id asc
    `;

    const byCurrentId = new Map(ege9Rows.map((row) => [row.id, row]));
    const byRef = new Map();
    for (const row of ege9Rows) {
      const rawRef = String(row.source_alignment?.reference ?? '');
      const match = rawRef.match(/(\d{4,6})$/);
      if (!match) continue;
      const ref = Number(match[1]);
      if (!byRef.has(ref)) byRef.set(ref, []);
      byRef.get(ref).push(row);
    }

    const resolvedUpdates = [];
    const resolvedByTargetId = new Map();
    const skippedRefs = [];

    for (const item of parsedItems) {
      let row = byCurrentId.get(item.id) ?? null;
      if (!row) {
        const refMatches = byRef.get(item.ref) ?? [];
        if (refMatches.length === 1) {
          row = refMatches[0];
        } else if (refMatches.length > 1) {
          throw new Error(`Reference ${item.ref} maps to multiple DB rows: ${refMatches.map((r) => r.id).join(', ')}`);
        }
      }

      if (!row) {
        skippedRefs.push(item.ref);
        continue;
      }

      const isEge9 =
        String(row.seed_key ?? '').includes('ege9') ||
        (Array.isArray(row.skill_tags) && row.skill_tags.includes('ege.9'));
      if (row.type !== 'ege_multi_select') {
        throw new Error(`ID ${row.id} is type=${row.type}, expected ege_multi_select`);
      }
      if (!isEge9) {
        throw new Error(`ID ${row.id} is not marked as EGE-9`);
      }

      const resolved = {
        ...item,
        targetId: row.id,
        seedKey: row.seed_key,
      };

      const existing = resolvedByTargetId.get(resolved.targetId);
      if (existing && existing.explanation !== resolved.explanation) {
        const rowKind = String(row.seed_key ?? '').includes('bank')
          ? 'bank'
          : String(row.seed_key ?? '').includes('live')
            ? 'live'
            : 'unknown';
        const existingKind = sourceKind(existing.filePath);
        const nextKind = sourceKind(resolved.filePath);

        if (rowKind !== 'unknown') {
          if (existingKind === rowKind && nextKind !== rowKind) {
            continue;
          }
          if (nextKind === rowKind && existingKind !== rowKind) {
            resolvedByTargetId.set(resolved.targetId, resolved);
            const index = resolvedUpdates.findIndex((entry) => entry.targetId === resolved.targetId);
            resolvedUpdates[index] = resolved;
            continue;
          }
        }

        throw new Error(
          `Conflicting explanations for target ID ${resolved.targetId}: ${existing.filePath} vs ${resolved.filePath}`,
        );
      }

      if (!existing) {
        resolvedByTargetId.set(resolved.targetId, resolved);
        resolvedUpdates.push(resolved);
      }
    }

    if (!resolvedUpdates.length) {
      throw new Error('No matching EGE-9 rows found in DB for the provided markdown files');
    }

    await sql.begin(async (tx) => {
      for (const item of resolvedUpdates) {
        await tx`
          update exercises
          set explanation = ${item.explanation}
          where id = ${item.targetId}
        `;
      }
    });

    const targetIds = resolvedUpdates.map((item) => item.targetId);
    const verifyRows = await sql`
      select id, left(explanation, 160) as explanation_preview
      from exercises
      where id = any(${targetIds})
      order by id asc
    `;

    console.log('UPDATED_COUNT', resolvedUpdates.length);
    console.log('UPDATED_IDS', resolvedUpdates.map((item) => item.targetId).join(','));
    console.log('UPDATED_REFS', resolvedUpdates.map((item) => item.ref).join(','));
    if (skippedRefs.length) {
      console.log('SKIPPED_REFS', skippedRefs.join(','));
    }
    for (const row of verifyRows) {
      console.log(`ID ${row.id}: ${row.explanation_preview}`);
    }
  } finally {
    await sql.end();
  }
})().catch((error) => {
  console.error('FAILED', error.message);
  process.exit(1);
});
