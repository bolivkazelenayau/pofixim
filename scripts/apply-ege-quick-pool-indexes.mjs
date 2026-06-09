import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
});

const indexes = [
  {
    name: 'exercises_quick_pool_ege9_idx',
    type: 'ege_multi_select',
    tag: 'ege.9',
  },
  {
    name: 'exercises_quick_pool_ege13_idx',
    type: 'ege_multi_select',
    tag: 'ege.13',
  },
  {
    name: 'exercises_quick_pool_ege15_idx',
    type: 'fill_blank',
    tag: 'ege.15',
  },
];

try {
  for (const index of indexes) {
    await sql.unsafe(`
      create index concurrently if not exists ${index.name}
      on exercises (id)
      where is_active = true
        and type = '${index.type}'
        and skill_tags @> array['${index.tag}']::text[]
    `);
    console.log(`OK: ${index.name} exists`);
  }
} finally {
  await sql.end();
}
