import 'dotenv/config';
import postgres from 'postgres';

const DEFAULT_TARGET_TOTAL = 50000;
const DEFAULT_PREFIX = 'synthetic-scale-v1';
const BATCH_SIZE = 1000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const prefix = process.env.SYNTHETIC_EXERCISE_PREFIX || DEFAULT_PREFIX;
const targetTotal = Number(
  process.env.SYNTHETIC_EXERCISE_TARGET_TOTAL || DEFAULT_TARGET_TOTAL,
);
const cleanup = process.argv.includes('--cleanup');
const dryRun = process.argv.includes('--dry-run');

if (!Number.isInteger(targetTotal) || targetTotal < 1) {
  throw new Error('SYNTHETIC_EXERCISE_TARGET_TOTAL must be a positive integer');
}

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

const templates = [
  {
    type: 'multiple_choice',
    category: 'orthography',
    tags: ['ege.14', 'orthography.synthetic', 'scale.test'],
    payload: (n) => ({
      options: [
        `синтетический вариант ${n}: слитно`,
        `синтетический вариант ${n}: раздельно`,
        `синтетический вариант ${n}: через дефис`,
      ],
    }),
    answer: () => ({ correctOptionIndex: 0 }),
  },
  {
    type: 'fill_blank',
    category: 'orthography',
    tags: ['ege.15', 'orthography.synthetic', 'scale.test'],
    payload: (n) => ({
      before: n % 2 === 0 ? 'ране' : 'ветре',
      after: n % 2 === 0 ? 'ый синтетический пример' : 'ый тестовый день',
      placeholderLabel: 'н/нн',
    }),
    answer: (n) => ({ accepted: [n % 2 === 0 ? 'нн' : 'н'], caseSensitive: false }),
  },
  {
    type: 'punctuation_insert',
    category: 'punctuation',
    tags: ['ege.17', 'punctuation.synthetic', 'scale.test'],
    payload: (n) => ({
      tokens: ['Синтетический', 'пример', String(n), 'готов'],
      allowedMarks: [','],
    }),
    answer: () => ({ marks: [{ afterTokenIndex: 1, mark: ',' }] }),
  },
  {
    type: 'ege_multi_select',
    category: 'punctuation',
    tags: ['ege.21', 'punctuation.synthetic', 'scale.test'],
    payload: (n) => ({
      options: [
        `вариант ${n}.1`,
        `вариант ${n}.2`,
        `вариант ${n}.3`,
        `вариант ${n}.4`,
      ],
    }),
    answer: () => ({
      rawAnswerText: '13',
      acceptedAnswers: ['13'],
      targetSet: [1, 3],
    }),
  },
  {
    type: 'orthography_repair',
    category: 'orthography',
    tags: ['ege.12', 'orthography.synthetic', 'scale.test'],
    payload: (n) => ({
      text: `Синтетический текст ${n} содержит исправляемый фрагмент.`,
      targets: [
        {
          id: `target-${n}`,
          surface: 'исправляемый',
          replacement: 'исправленный',
          type: 'word',
          occurrence: 1,
          options: ['исправленный', 'исправляемый'],
        },
      ],
      mode: 'click_then_choose',
    }),
    answer: (n) => ({
      repairs: [{ targetId: `target-${n}`, correct: 'исправленный' }],
    }),
  },
];

function makeExercise(n) {
  const template = templates[n % templates.length];
  const examTag = template.tags.find((tag) => tag.startsWith('ege.')) ?? 'ege.14';
  const prompt =
    `Синтетическое задание ${n} для проверки масштабирования админского списка. ` +
    `Метка ${examTag}, тип ${template.type}.`;
  const explanation =
    `Это синтетическая запись ${n}. Она создана только для нагрузочного теста ` +
    'и должна удаляться по seed_key-префиксу.';

  return {
    seedKey: `${prefix}-${String(n).padStart(6, '0')}`,
    type: template.type,
    category: template.category,
    difficulty: (n % 2) + 1,
    skillTags: [...template.tags, `synthetic.bucket.${n % 20}`],
    prompt,
    payload: template.payload(n),
    answer: template.answer(n),
    explanation,
    sourceAlignment: {
      synthetic: true,
      prefix,
      generatedAt: new Date(0).toISOString(),
      ordinal: n,
    },
    typicalMistake: `Синтетическая типовая ошибка ${n % 17}.`,
    algorithmSteps: [
      { id: 'read', title: 'Прочитать условие.', required: true },
      { id: 'choose', title: 'Выбрать ответ.', required: true },
      { id: 'check', title: 'Проверить результат.', required: true },
    ],
    qualityStatus: n % 23 === 0 ? 'draft' : 'review',
    isActive: true,
  };
}

async function insertBatch(batch) {
  await sql`
    insert into exercises (
      seed_key,
      type,
      category,
      difficulty,
      skill_tags,
      prompt,
      payload,
      answer,
      explanation,
      source_alignment,
      typical_mistake,
      algorithm_steps,
      quality_status,
      is_active,
      created_at,
      updated_at
    )
    select
      item->>'seedKey',
      (item->>'type')::exercise_type,
      (item->>'category')::category,
      (item->>'difficulty')::int,
      array(select jsonb_array_elements_text(item->'skillTags')),
      item->>'prompt',
      item->'payload',
      item->'answer',
      item->>'explanation',
      item->'sourceAlignment',
      item->>'typicalMistake',
      item->'algorithmSteps',
      item->>'qualityStatus',
      (item->>'isActive')::boolean,
      now(),
      now() - (((item->'sourceAlignment'->>'ordinal')::int % 100000) || ' seconds')::interval
    from jsonb_array_elements(${sql.json(batch)}::jsonb) as item
    on conflict (seed_key) do nothing
  `;
}

async function main() {
  try {
    if (cleanup) {
      if (dryRun) {
        const [row] = await sql`
          select
            count(*)::int as count,
            (
              select count(*)::int
              from exercise_attempts
              where exercise_id in (
                select id from exercises where seed_key like ${`${prefix}-%`}
              )
            ) as attempts
          from exercises
          where seed_key like ${`${prefix}-%`}
        `;
        console.log(JSON.stringify({
          mode: 'cleanup-dry-run',
          prefix,
          wouldDelete: row.count,
          wouldDeleteAttempts: row.attempts,
        }, null, 2));
        return;
      }

      const deletedAttempts = await sql`
        delete from exercise_attempts
        where exercise_id in (
          select id from exercises where seed_key like ${`${prefix}-%`}
        )
        returning id
      `;
      const deleted = await sql`
        delete from exercises
        where seed_key like ${`${prefix}-%`}
        returning id
      `;
      console.log(JSON.stringify({
        mode: 'cleanup',
        prefix,
        deleted: deleted.length,
        deletedAttempts: deletedAttempts.length,
      }, null, 2));
      return;
    }

    const [before] = await sql`
      select
        count(*)::int as total,
        count(*) filter (where seed_key like ${`${prefix}-%`})::int as synthetic
      from exercises
    `;
    const toInsert = Math.max(0, targetTotal - before.total);

    if (dryRun) {
      console.log(JSON.stringify({
        mode: 'seed-dry-run',
        prefix,
        targetTotal,
        currentTotal: before.total,
        currentSynthetic: before.synthetic,
        wouldInsert: toInsert,
      }, null, 2));
      return;
    }

    console.log(JSON.stringify({
      mode: 'seed',
      prefix,
      targetTotal,
      currentTotal: before.total,
      currentSynthetic: before.synthetic,
      plannedInsert: toInsert,
      batchSize: BATCH_SIZE,
    }, null, 2));

    let inserted = 0;
    for (let start = before.synthetic + 1; inserted < toInsert; start += BATCH_SIZE) {
      const batch = [];
      for (let offset = 0; offset < BATCH_SIZE && inserted + batch.length < toInsert; offset += 1) {
        batch.push(makeExercise(start + offset));
      }
      await insertBatch(batch);
      inserted += batch.length;
      console.log(`Inserted synthetic batch: ${inserted}/${toInsert}`);
    }

    const [after] = await sql`
      select
        count(*)::int as total,
        count(*) filter (where seed_key like ${`${prefix}-%`})::int as synthetic
      from exercises
    `;
    console.log(JSON.stringify({
      mode: 'seed-complete',
      prefix,
      targetTotal,
      beforeTotal: before.total,
      afterTotal: after.total,
      synthetic: after.synthetic,
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Synthetic scale seed failed:', error);
  process.exitCode = 1;
});
