import 'dotenv/config';
import postgres from 'postgres';

const DRY_RUN = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL);

function uniq(values) {
  return [...new Set(values)];
}

function shuffle(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractBoldSegments(text) {
  const segments = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const candidate = normalizeSpaces(m[1] ?? '');
    if (candidate) segments.push(candidate);
  }
  return segments;
}

function buildTextWithSlotsFromExplainedOptions(options) {
  const explained = options
    .filter((opt) => typeof opt === 'string' && opt.includes('**'))
    .map((opt) => normalizeSpaces(opt));

  if (explained.length === 0) {
    return null;
  }

  const chosen = explained.slice(0, 6);
  const correctBySlot = [];
  let slotCounter = 1;

  const lines = chosen
    .map((line) => {
      let result = line;
      const segments = extractBoldSegments(line);
      if (segments.length === 0) return null;

      for (const segment of segments) {
        const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const directPattern = new RegExp(`\\*\\*${escaped}\\*\\*`);
        if (directPattern.test(result)) {
          result = result.replace(directPattern, `[[${slotCounter}]]`);
          correctBySlot.push(segment);
          slotCounter += 1;
          continue;
        }
      }

      result = result.replace(/\*\*/g, '');
      return result;
    })
    .filter(Boolean);

  if (correctBySlot.length < 2 || lines.length < 2) {
    return null;
  }

  const textWithSlots = lines.join(' ');
  const wordBank = shuffle(uniq(correctBySlot));

  return {
    textWithSlots,
    slotCount: correctBySlot.length,
    wordBank,
    correctBySlot,
  };
}

try {
  const rows = await sql`
    select id, seed_key, prompt, difficulty, explanation, source_alignment, typical_mistake, algorithm_steps, skill_tags, payload
    from exercises
    where type = 'ege_multi_select'
      and skill_tags @> ARRAY['ege.14']
      and exists (
        select 1
        from jsonb_array_elements_text(payload->'options') as opt
        where opt like '%**%'
      )
    order by id desc
  `;

  let total = 0;
  let converted = 0;
  let skipped = 0;
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    total += 1;
    const options = Array.isArray(row.payload?.options) ? row.payload.options : [];
    const built = buildTextWithSlotsFromExplainedOptions(options);
    if (!built) {
      skipped += 1;
      continue;
    }

    converted += 1;
    const seedKey = `wbc-from-${row.seed_key ?? `ege14-${row.id}`}`;
    const skillTags = uniq([...(row.skill_tags ?? []), 'ege.14', 'orthography.word_bank_cloze']);

    const exercise = {
      seed_key: seedKey,
      type: 'word_bank_cloze',
      category: 'orthography',
      difficulty: row.difficulty === 2 ? 2 : 1,
      skill_tags: skillTags,
      prompt:
        'Расставьте слова, соблюдая правила правописания. Перетащите варианты в подходящие пропуски.',
      payload: {
        textWithSlots: built.textWithSlots,
        slotCount: built.slotCount,
        wordBank: built.wordBank,
      },
      answer: {
        correctBySlot: built.correctBySlot,
        caseSensitive: false,
      },
      explanation:
        typeof row.explanation === 'string' && row.explanation.trim()
          ? row.explanation
          : 'Ориентируйтесь на часть речи и роль слова в контексте.',
      source_alignment: row.source_alignment ?? { source: 'ege14_transform', sourceId: String(row.id) },
      typical_mistake: row.typical_mistake ?? 'Смешение омонимичных форм',
      algorithm_steps:
        row.algorithm_steps ?? [
          { id: 'role', title: 'Определи часть речи и роль слова в контексте', required: true },
          { id: 'rule', title: 'Примени правило слитного/раздельного/дефисного написания', required: true },
        ],
      quality_status: 'review',
      is_active: true,
    };

    if (DRY_RUN) {
      continue;
    }

    const exists = await sql`
      select id
      from exercises
      where seed_key = ${exercise.seed_key}
      limit 1
    `;

    await sql`
      insert into exercises
      (
        seed_key, type, category, difficulty, skill_tags, prompt, payload, answer, explanation,
        source_alignment, typical_mistake, algorithm_steps, quality_status, is_active
      )
      values
      (
        ${exercise.seed_key},
        ${exercise.type},
        ${exercise.category},
        ${exercise.difficulty},
        ${exercise.skill_tags},
        ${exercise.prompt},
        ${sql.json(exercise.payload)},
        ${sql.json(exercise.answer)},
        ${exercise.explanation},
        ${sql.json(exercise.source_alignment)},
        ${exercise.typical_mistake},
        ${sql.json(exercise.algorithm_steps)},
        ${exercise.quality_status},
        ${exercise.is_active}
      )
      on conflict (seed_key)
      do update set
        payload = excluded.payload,
        answer = excluded.answer,
        explanation = excluded.explanation,
        skill_tags = excluded.skill_tags,
        updated_at = now()
    `;

    if (exists.length > 0) updated += 1;
    else inserted += 1;
  }

  console.log(
    [
      `dryRun=${DRY_RUN}`,
      `totalCandidates=${total}`,
      `converted=${converted}`,
      `skipped=${skipped}`,
      `inserted=${inserted}`,
      `updated=${updated}`,
    ].join(' | '),
  );
} finally {
  await sql.end();
}

