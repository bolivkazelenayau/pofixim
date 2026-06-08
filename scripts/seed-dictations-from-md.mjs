import 'dotenv/config';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function slugify(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
    я: 'ya',
  };
  return value
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function parseDictations(markdown) {
  const pattern =
    /##\s+(\d+)\.\s+([^\n]+)\n\n###\s+voice_memo:\s+([^\n]+)\n\n([\s\S]*?)(?=\n##\s+\d+\.|$)/g;
  return [...markdown.matchAll(pattern)].map((match) => {
    const number = Number(match[1]);
    const title = match[2].trim();
    const file = match[3].trim();
    const text = match[4].trim().replace(/\s+/g, ' ');
    return {
      number,
      title,
      file,
      text,
      seedKey: `dictation-small-${String(number).padStart(2, '0')}-${slugify(title)}`,
    };
  });
}

async function assertAudioExists(file) {
  const audioPath = path.resolve('public/voice_memos', file);
  await access(audioPath);
}

async function upsertExercise(sql, item) {
  const prompt = 'Прослушайте голосовое сообщение и запишите услышанный текст.';
  const exercise = {
    seedKey: item.seedKey,
    type: 'dictation',
    category: 'mixed',
    difficulty: 1,
    skillTags: ['dictation', 'listening', 'punctuation'],
    prompt,
    payload: {
      title: item.title,
      audioSrc: `/voice_memos/${item.file}`,
      playbackRates: [0.75, 1, 1.25, 1.5],
    },
    answer: {
      text: item.text,
      caseSensitive: false,
      ignorePunctuation: false,
    },
    explanation:
      'Сверь свой текст с эталоном: важно сохранить слова, порядок, знаки препинания и границы предложений.',
    sourceAlignment: {
      source: 'exports/small_dictations.md',
      number: item.number,
      voiceMemo: item.file,
    },
    typicalMistake: 'Пропуск служебных слов, замена похожих слов на слух или потеря пунктуации.',
    algorithmSteps: [
      { id: 'listen_full', title: 'Прослушай диктовку целиком', required: true },
      { id: 'write_text', title: 'Запиши услышанный текст', required: true },
      { id: 'proofread', title: 'Переслушай и проверь слова и пунктуацию', required: true },
    ],
    qualityStatus: 'review',
    isActive: true,
  };

  await sql`
    insert into exercises (
      seed_key, type, category, difficulty, skill_tags, prompt, payload, answer, explanation,
      source_alignment, typical_mistake, algorithm_steps, quality_status, is_active
    ) values (
      ${exercise.seedKey},
      ${exercise.type},
      ${exercise.category},
      ${exercise.difficulty},
      ${exercise.skillTags},
      ${exercise.prompt},
      ${sql.json(exercise.payload)},
      ${sql.json(exercise.answer)},
      ${exercise.explanation},
      ${sql.json(exercise.sourceAlignment)},
      ${exercise.typicalMistake},
      ${sql.json(exercise.algorithmSteps)},
      ${exercise.qualityStatus},
      ${exercise.isActive}
    )
    on conflict (seed_key) do update set
      type = excluded.type,
      category = excluded.category,
      difficulty = excluded.difficulty,
      skill_tags = excluded.skill_tags,
      prompt = excluded.prompt,
      payload = excluded.payload,
      answer = excluded.answer,
      explanation = excluded.explanation,
      source_alignment = excluded.source_alignment,
      typical_mistake = excluded.typical_mistake,
      algorithm_steps = excluded.algorithm_steps,
      quality_status = excluded.quality_status,
      is_active = excluded.is_active,
      updated_at = now()
  `;
}

const args = parseArgs(process.argv);
const file = path.resolve(args.file ?? 'exports/small_dictations.md');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const markdown = await readFile(file, 'utf8');
const dictations = parseDictations(markdown);

if (dictations.length === 0) {
  throw new Error(`No dictations found in ${file}`);
}

for (const item of dictations) {
  if (!item.text) {
    throw new Error(`Empty transcript for ${item.seedKey}`);
  }
  await assertAudioExists(item.file);
}

const sql = postgres(process.env.DATABASE_URL);
try {
  for (const item of dictations) {
    await upsertExercise(sql, item);
  }
  console.log(`OK: upserted ${dictations.length} dictation exercises`);
} finally {
  await sql.end();
}
