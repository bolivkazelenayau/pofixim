const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
require('dotenv').config();

function extractNumberFromSeedKey(seedKey) {
  const match = String(seedKey ?? '').match(/live-ege11-(\d+)$/);
  return match ? match[1] : null;
}

function extractCorrectAnswer(answer) {
  if (Array.isArray(answer?.acceptedAnswers) && answer.acceptedAnswers.length > 0) {
    return String(answer.acceptedAnswers[0]).trim();
  }

  if (typeof answer?.rawAnswerText === 'string' && answer.rawAnswerText.trim()) {
    return answer.rawAnswerText.trim().replace(/\.$/, '');
  }

  if (Array.isArray(answer?.targetSet) && answer.targetSet.length > 0) {
    return [...answer.targetSet]
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join('');
  }

  return '';
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL);

  try {
    const rows = await sql`
      select
        id,
        seed_key,
        answer,
        explanation
      from exercises
      where type = 'ege_multi_select'
        and seed_key like 'live-ege11-%'
      order by id asc
    `;

    const lines = ['# ЕГЭ-11: номер, ID, правильный ответ и explanation', ''];
    let exportedCount = 0;

    for (const row of rows) {
      const number = extractNumberFromSeedKey(row.seed_key);
      if (!number) continue;

      const correctAnswer = extractCorrectAnswer(row.answer);

      lines.push(`## ${number}`);
      lines.push('');
      lines.push(`- ID в базе: ${row.id}`);
      lines.push(`- Правильный ответ: ${correctAnswer || '—'}`);
      lines.push('');
      lines.push('### Explanation');
      lines.push('');
      lines.push(String(row.explanation ?? ''));
      lines.push('');

      exportedCount += 1;
    }

    lines.push('---');
    lines.push('');
    lines.push(`Всего выгружено: ${exportedCount}`);

    const outDir = path.join(process.cwd(), 'exports');
    fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, 'live_ege11_number_id_answer_explanation.md');
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

    console.log(outPath);
  } finally {
    await sql.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
