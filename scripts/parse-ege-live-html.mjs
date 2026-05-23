import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFragment } from 'parse5';

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

function parseTypesSpec(spec) {
  if (!spec) return [];
  const out = new Set();
  for (const chunk of spec.split(',')) {
    const token = chunk.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let t = min; t <= max; t += 1) out.add(t);
      continue;
    }
    const num = Number(token);
    if (Number.isInteger(num)) out.add(num);
  }
  return [...out].filter((t) => t >= 9 && t <= 21).sort((a, b) => a - b);
}

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

function normalizeTextChars(value) {
  return value
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ');
}

function normalizeSpaces(value) {
  return normalizeTextChars(value)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function normalizeBlockText(value) {
  return normalizeTextChars(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\n([a-zа-яё])/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

function appendText(parts, value) {
  if (!value) return;
  parts.push(value);
}

function appendNewline(parts) {
  if (parts.length === 0) return;
  const prev = parts.at(-1) ?? '';
  if (!prev.endsWith('\n')) parts.push('\n');
}

function htmlToText(html, { preserveBlocks = false } = {}) {
  const fragment = parseFragment(html);
  const parts = [];

  function hasAttr(node, name) {
    return (node.attrs ?? []).some((attr) => attr.name === name);
  }

  function visit(node) {
    if (node.nodeName === '#text') {
      appendText(parts, node.value ?? '');
      return;
    }
    if (node.nodeName === '#comment') return;

    const tag = node.tagName;
    if (tag === 'script' || tag === 'style') return;
    if (hasAttr(node, 'data-razbor')) return;
    if (tag === 'br') {
      appendNewline(parts);
      return;
    }

    const isBlock = preserveBlocks && BLOCK_TAGS.has(tag);
    if (isBlock) appendNewline(parts);
    for (const child of node.childNodes ?? []) visit(child);
    if (isBlock) appendNewline(parts);
  }

  for (const child of fragment.childNodes ?? []) visit(child);
  const text = parts.join('');
  return preserveBlocks ? normalizeBlockText(text) : normalizeSpaces(text);
}

function stripTags(html) {
  return htmlToText(html);
}

function stripTagsKeepNewlines(html) {
  return htmlToText(html, { preserveBlocks: true });
}

function extractInnerHtml(section, openTagRe) {
  const openMatch = section.match(openTagRe);
  if (!openMatch) return '';
  let pos = (openMatch.index ?? 0) + openMatch[0].length;
  let depth = 1;
  const divOpenRe = /<div[\s>]/gi;
  const divCloseRe = /<\/div>/gi;
  while (depth > 0 && pos < section.length) {
    divOpenRe.lastIndex = pos;
    divCloseRe.lastIndex = pos;
    const nextOpen = divOpenRe.exec(section);
    const nextClose = divCloseRe.exec(section);
    if (!nextClose) break;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return section.slice((openMatch.index ?? 0) + openMatch[0].length, nextClose.index);
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return '';
}

function decodeBestEffort(buffer) {
  return buffer.toString('utf8');
}

async function detectLatestRawDir(rawRoot) {
  const entries = await readdir(rawRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.resolve(rawRoot, e.name));
  if (!dirs.length) {
    throw new Error(`No raw_live directories found in ${rawRoot}`);
  }
  const withStats = await Promise.all(
    dirs.map(async (dir) => {
      const stat = await readFile(path.resolve(dir, 'manifest.json'), 'utf8')
        .then(() => true)
        .catch(() => false);
      return { dir, hasManifest: stat };
    }),
  );
  const candidates = withStats.filter((i) => i.hasManifest).map((i) => i.dir);
  if (!candidates.length) {
    throw new Error(`No manifest.json found in ${rawRoot} subdirectories.`);
  }
  const sorted = candidates.sort((a, b) => (a < b ? 1 : -1));
  return sorted[0];
}

function extractProblems(html) {
  const markerRe = /<div[^>]+class="prob_maindiv"[^>]*id="maindiv\d+"[^>]*>/gim;
  const markers = [...html.matchAll(markerRe)];
  const sections = markers.map((m, idx) => {
    const start = m.index ?? 0;
    const end = markers[idx + 1]?.index ?? html.length;
    return html.slice(start, end);
  });
  const problems = [];

  for (const section of sections) {
    const typeMatch = section.match(/Тип\s*(\d{1,2})/i);
    const type = typeMatch ? Number(typeMatch[1]) : null;
    const problemId = section.match(/problem\?id=(\d+)/i)?.[1] ?? null;
    const bodyHtml = extractInnerHtml(section, /id="body\d+"[\s\S]*?class="pbody"[^>]*>/i);
    const answerTextRaw = section.match(/class="answer"[\s\S]*?Ответ:\s*([^<]+)/i)?.[1] ?? '';
    const explanationHtml = extractInnerHtml(section, /id="sol\d+"[\s\S]*?class="solution"[^>]*>/i);

    const promptText = stripTags(bodyHtml);
    const answerText = normalizeSpaces(answerTextRaw);
    const explanation = stripTagsKeepNewlines(explanationHtml);
    const acceptedAnswers = [...new Set((answerText.match(/[0-9]+/g) ?? []).map((s) => s.trim()))];

    problems.push({
      type,
      problemId,
      prompt: promptText,
      answerText,
      acceptedAnswers,
      explanation: explanation || 'Объяснение отсутствует в источнике.',
      hasType: Number.isInteger(type),
      hasPrompt: promptText.length > 0,
      hasAnswer: acceptedAnswers.length > 0,
    });
  }

  return problems;
}

function validateVariantProblems(problems, expectedTypes) {
  const errors = [];
  if (!problems.length) {
    errors.push('no_problems_found');
    return { ok: false, errors };
  }

  const missingType = problems.filter((p) => !p.hasType).length;
  const missingPrompt = problems.filter((p) => !p.hasPrompt).length;
  const missingAnswer = problems.filter((p) => !p.hasAnswer).length;

  if (missingType > 0) errors.push(`missing_type:${missingType}`);
  if (missingPrompt > 0) errors.push(`missing_prompt:${missingPrompt}`);
  if (missingAnswer > 0) errors.push(`missing_answer:${missingAnswer}`);

  if (expectedTypes.length > 0) {
    const outOfExpected = problems.filter((p) => Number.isInteger(p.type) && !expectedTypes.includes(p.type));
    if (outOfExpected.length > 0) {
      const set = [...new Set(outOfExpected.map((p) => p.type))].sort((a, b) => a - b);
      errors.push(`wrong_types:${set.join(',')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv);
  const rawRoot = path.resolve(process.cwd(), 'test_sources', 'raw_live');
  const runDir = args.rawDir
    ? path.resolve(args.rawDir)
    : await detectLatestRawDir(rawRoot);
  const strict = args.strict !== 'false';
  const expectedRows = Number(args.expectedRows ?? process.env.HARVEST_FILL_VALUE ?? 0);

  const manifestPath = path.resolve(runDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expectedTypes = parseTypesSpec(args.types ?? (manifest.types ?? []).join(','));

  const outDir = path.resolve(process.cwd(), 'test_sources', 'parsed_live', path.basename(runDir));
  await mkdir(outDir, { recursive: true });

  const parsedVariants = [];
  const validRows = [];
  const invalidRows = [];

  for (const item of manifest.items ?? []) {
    const rawFile = item.file;
    const buffer = await readFile(rawFile);
    const html = decodeBestEffort(buffer);
    const problems = extractProblems(html);
    const validation = validateVariantProblems(problems, expectedTypes);

    const variant = {
      id: String(item.id),
      variantUrl: item.variantUrl,
      wordUrl: item.wordUrl,
      sourceFile: rawFile,
      problemsCount: problems.length,
      typesFound: [...new Set(problems.map((p) => p.type).filter((v) => Number.isInteger(v)))].sort((a, b) => a - b),
      ok: validation.ok,
      errors: validation.errors,
      problems,
    };
    parsedVariants.push(variant);

    for (let i = 0; i < problems.length; i += 1) {
      const p = problems[i];
      const row = {
        variantId: variant.id,
        variantUrl: item.variantUrl,
        wordUrl: item.wordUrl,
        index: i + 1,
        type: p.type,
        problemId: p.problemId,
        prompt: p.prompt,
        answerText: p.answerText,
        acceptedAnswers: p.acceptedAnswers,
        explanation: p.explanation,
        sourceFile: rawFile,
      };
      if (variant.ok) {
        validRows.push(row);
      } else {
        invalidRows.push({ ...row, variantErrors: validation.errors });
      }
    }
  }

  const warnings = [];
  if (expectedRows > 0) {
    for (const v of parsedVariants) {
      if (v.ok && v.problemsCount < expectedRows) {
        warnings.push(`variant:${v.id}:rows_below_expected:${v.problemsCount}<${expectedRows}`);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runDir,
    expectedTypes,
    expectedRows,
    strict,
    variantsTotal: parsedVariants.length,
    variantsValid: parsedVariants.filter((v) => v.ok).length,
    variantsInvalid: parsedVariants.filter((v) => !v.ok).length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    warnings,
  };

  await writeFile(path.resolve(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(path.resolve(outDir, 'variants.json'), JSON.stringify(parsedVariants, null, 2), 'utf8');
  await writeFile(
    path.resolve(outDir, 'validated.jsonl'),
    validRows.map((r) => JSON.stringify(r)).join('\n') + (validRows.length ? '\n' : ''),
    'utf8',
  );
  await writeFile(
    path.resolve(outDir, 'invalid.jsonl'),
    invalidRows.map((r) => JSON.stringify(r)).join('\n') + (invalidRows.length ? '\n' : ''),
    'utf8',
  );

  console.log(`Parsed run: ${runDir}`);
  console.log(`Output: ${outDir}`);
  console.log(
    `Variants valid/total: ${report.variantsValid}/${report.variantsTotal}; rows valid/invalid: ${report.validRows}/${report.invalidRows}`,
  );
  if (warnings.length) {
    console.warn(`Warnings: ${warnings.length}`);
    for (const w of warnings.slice(0, 20)) console.warn(`- ${w}`);
  }
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Parse+validate finished in ${elapsedSec}s`);

  if (strict && report.variantsInvalid > 0) {
    throw new Error(`Validation failed: ${report.variantsInvalid} invalid variant(s). See ${path.resolve(outDir, 'report.json')}`);
  }
}

await main();
