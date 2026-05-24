const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

const IDS = [
  3169, 3170, 3173, 3181, 3182, 3186, 3187, 3190, 3191, 3194, 3196, 3198, 3199,
  3200, 3209, 3210, 3211, 3212, 3214, 3216, 3219, 3220, 3228, 3231, 3234, 3236,
  3237, 3244, 3248, 3251, 3252, 3256, 3258, 344, 346, 351, 355, 359, 363, 368,
  375, 377, 380, 382, 383, 385, 391, 419, 421, 422, 425,
];

const RU = {
  row: '\u0420\u044f\u0434',
  fits: '\u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442',
  notFits: '\u043d\u0435 \u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442',
};

const CYR = '\u0430\u0431\u0432\u0433\u0434\u0435\u0451\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f';

function stripSoft(s) {
  return String(s || '').replace(/\u00ad/g, '');
}

function norm(s) {
  return stripSoft(s)
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/[—–-]/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, '');
}

function parseRows(text) {
  const src = stripSoft(String(text || '')).replace(/\*\*\s*([1-5])\s*\)\s*\*\*/g, '$1) ');
  const out = [];
  const re = /(?:^|\s)([1-5])[\)\.]?\s*([\s\S]*?)(?=(?:\s[1-5][\)\.]?\s*)|$)/g;
  let m;
  while ((m = re.exec(src)) !== null) out[Number(m[1]) - 1] = m[2].trim();
  if (out.filter(Boolean).length === 5) return out;

  const out2 = [];
  const re2 = /\*\*\s*Ряд\s*([1-5])\s*\*\*\s*:\s*([\s\S]*?)(?=(?:\n\s*\n\*\*\s*Ряд\s*[1-5]\s*\*\*\s*:)|$)/g;
  let m2;
  while ((m2 = re2.exec(src)) !== null) out2[Number(m2[1]) - 1] = m2[2].trim();
  return out2.filter(Boolean).length === 5 ? out2 : null;
}

function getRowWords(r) {
  if (Array.isArray(r.payload?.options) && r.payload.options.length === 5) {
    return r.payload.options.map((x) =>
      String(x)
        .split(',')
        .map((w) => w.trim())
        .slice(0, 3),
    );
  }
  const rows = parseRows(r.payload?.before || r.prompt || '');
  if (!rows) return null;
  return rows.map((x) =>
    String(x)
      .split(',')
      .map((w) => w.trim())
      .slice(0, 3),
  );
}

function getTargetSet(answer) {
  if (Array.isArray(answer?.targetSet)) return new Set(answer.targetSet.map(Number));
  const s = new Set();
  for (const a of Array.isArray(answer?.accepted) ? answer.accepted : []) {
    for (const ch of String(a).replace(/\D/g, '')) s.add(Number(ch));
  }
  return s;
}

function detectLetter(token, ref) {
  const t = stripSoft(token);
  const i = t.indexOf('..');
  if (i < 0) return null;
  const left = norm(t.slice(0, i));
  const right = norm(t.slice(i + 2));
  const h = norm(ref);
  for (const ch of CYR) {
    if (h.includes(left + ch + right)) return ch;
  }
  return null;
}

function renderWord(token, ref) {
  if (!token.includes('..')) return `*${token}*`;
  const l = detectLetter(token, ref) || '\u2022';
  return `*${token.replace('..', `**${l}**`)}*`;
}

function cleanupRowWording(rowText) {
  return String(rowText)
    .replace(/^\s*[1-5][\)\.]\s*/, '')
    .trim()
    .replace(/[;.]?\s*$/, '')
    .trim();
}

function buildNewExplanation(r) {
  const wordsByRow = getRowWords(r);
  const oldRows = parseRows(r.explanation || '');
  if (!wordsByRow || wordsByRow.length !== 5) throw new Error(`words parse fail id=${r.id}`);
  if (!oldRows || oldRows.length !== 5) return null;

  const target = getTargetSet(r.answer);
  const ref = `${r.explanation || ''}\n${r.prompt || ''}\n${r.payload?.before || ''}`;
  const paras = [];
  for (let i = 1; i <= 5; i++) {
    const words = wordsByRow[i - 1];
    if (words.length !== 3) throw new Error(`row words count fail id=${r.id} row=${i}`);
    const renderedWords = words.map((w) => renderWord(w, ref)).join(', ');
    const status = target.has(i) ? `**${RU.fits}**` : `**${RU.notFits}**`;
    const explanation = cleanupRowWording(oldRows[i - 1]);
    paras.push(`**${RU.row} ${i}**: ${renderedWords} — ${status}: ${explanation}.`);
  }
  return paras.join('\n\n');
}

async function main() {
  const rows = await sql`select id, type, prompt, payload, answer, explanation from exercises where id = any(${IDS}) order by id`;
  if (rows.length !== IDS.length) throw new Error(`Expected ${IDS.length}, got ${rows.length}`);

  const before = new Map(
    rows.map((r) => [
      r.id,
      {
        type: r.type,
        prompt: r.prompt,
        payload: JSON.stringify(r.payload),
        answer: JSON.stringify(r.answer),
      },
    ]),
  );

  const updatedIds = [];
  const skippedIds = [];
  for (const r of rows) {
    const next = buildNewExplanation(r);
    if (!next) {
      skippedIds.push(r.id);
      continue;
    }
    await sql`update exercises set explanation=${next} where id=${r.id}`;
    updatedIds.push(r.id);
  }

  const after = await sql`select id, type, prompt, payload, answer, explanation from exercises where id = any(${IDS}) order by id`;
  for (const r of after) {
    const b = before.get(r.id);
    if (!b) throw new Error(`unknown id=${r.id}`);
    if (r.type !== b.type) throw new Error(`type changed id=${r.id}`);
    if (r.prompt !== b.prompt) throw new Error(`prompt changed id=${r.id}`);
    if (JSON.stringify(r.payload) !== b.payload) throw new Error(`payload changed id=${r.id}`);
    if (JSON.stringify(r.answer) !== b.answer) throw new Error(`answer changed id=${r.id}`);
    if (!skippedIds.includes(r.id)) {
      const parts = String(r.explanation).match(/\*\*Ряд [1-5]\*\*:[\s\S]*?(?=(?:\n\n\*\*Ряд [1-5]\*\*:)|$)/g) || [];
      if (parts.length !== 5) throw new Error(`paragraph count id=${r.id}`);
      const target = getTargetSet(r.answer);
      for (let i = 1; i <= 5; i++) {
        const p = parts[i - 1];
        if (!p.startsWith(`**${RU.row} ${i}**:`)) throw new Error(`bad heading id=${r.id} row=${i}`);
        const st = target.has(i) ? `**${RU.fits}**` : `**${RU.notFits}**`;
        if (!p.includes(st)) throw new Error(`bad status id=${r.id} row=${i}`);
      }
    }
  }

  console.log(`UPDATED_COUNT ${updatedIds.length}`);
  console.log(`UPDATED_IDS ${updatedIds.join(',')}`);
  console.log(`SKIPPED_COUNT ${skippedIds.length}`);
  console.log(`SKIPPED_IDS ${skippedIds.join(',')}`);
  console.log('VALIDATION_OK');
}

main()
  .catch((e) => {
    console.error('FAILED', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
