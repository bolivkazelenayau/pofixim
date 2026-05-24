import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFragment } from 'parse5';

function parseArgs(argv) {
  const args = {
    dir: path.resolve(process.cwd(), 'test_sources', 'raw_live'),
    file: '',
    limit: 3,
    context: 260,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) continue;
    if (key === 'dir') args.dir = path.resolve(next);
    if (key === 'file') args.file = next;
    if (key === 'limit') args.limit = Math.max(1, Number(next) || 3);
    if (key === 'context') args.context = Math.max(80, Number(next) || 260);
    i += 1;
  }
  return args;
}

async function listHtmlFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(full);
    }
  }
  await walk(root);
  return out.sort();
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

function htmlToTextRaw(html) {
  const fragment = parseFragment(html);
  const parts = [];

  function hasAttr(node, name) {
    return (node.attrs ?? []).some((attr) => attr.name === name);
  }

  function visit(node) {
    if (node.nodeName === '#text') {
      parts.push(node.value ?? '');
      return;
    }
    if (node.nodeName === '#comment') return;
    const tag = node.tagName;
    if (tag === 'script' || tag === 'style') return;
    if (hasAttr(node, 'data-razbor')) return;
    if (tag === 'br') {
      parts.push('\n');
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) parts.push('\n');
    for (const child of node.childNodes ?? []) visit(child);
    if (isBlock) parts.push('\n');
  }

  for (const child of fragment.childNodes ?? []) visit(child);
  return parts.join('');
}

// Mirrors old behavior (riskier line join)
function normalizeOld(value) {
  return value
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\n([a-zа-яё])/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

// Mirrors current conservative behavior
function normalizeNew(value) {
  return value
    .replace(/\u00ad/g, '\ue000')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/([A-Za-zА-Яа-яЁё])\ue000\n([A-Za-zА-Яа-яЁё])/g, '$1$2')
    .replace(/([A-Za-zА-Яа-яЁё])-\n([A-Za-zА-Яа-яЁё])/g, '$1$2')
    .replace(/\ue000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .trim();
}

function countIssues(text) {
  return {
    spacesBeforePunct: (text.match(/\s+[.,;:!?](?=\s|$)/g) ?? []).length,
    inlineSoftHyphen: (text.match(/\u00ad/g) ?? []).length,
    zeroWidth: (text.match(/[\u200b\u200c\u200d\ufeff]/g) ?? []).length,
    tripleBreaks: (text.match(/\n{3,}/g) ?? []).length,
  };
}

function firstDiffIndex(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function snippetAt(text, index, radius = 180) {
  if (index < 0) return text.slice(0, radius * 2).replace(/\n/g, ' ⏎ ');
  const from = Math.max(0, index - radius);
  const to = Math.min(text.length, index + radius);
  return text.slice(from, to).replace(/\n/g, ' ⏎ ');
}

function printPreview(file, rawText, before, after, context) {
  const diffAt = firstDiffIndex(before, after);
  const beforeIssues = countIssues(before);
  const afterIssues = countIssues(after);

  console.log('\n============================================================');
  console.log(`FILE: ${file}`);
  console.log(`RAW chars: ${rawText.length}, BEFORE chars: ${before.length}, AFTER chars: ${after.length}`);
  console.log('Issues BEFORE:', beforeIssues);
  console.log('Issues AFTER :', afterIssues);
  if (diffAt >= 0) {
    console.log(`First diff at index: ${diffAt}`);
    console.log('\n--- BEFORE SNIPPET ---');
    console.log(snippetAt(before, diffAt, Math.floor(context / 2)));
    console.log('\n--- AFTER SNIPPET ----');
    console.log(snippetAt(after, diffAt, Math.floor(context / 2)));
  } else {
    console.log('No diff between BEFORE and AFTER normalization.');
    console.log('\n--- SAMPLE ---');
    console.log(snippetAt(after, 0, Math.floor(context / 2)));
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const files = await listHtmlFiles(args.dir);
  const selected = args.file
    ? files.filter((f) => f.toLowerCase().includes(args.file.toLowerCase()))
    : files.slice(0, args.limit);

  if (!selected.length) {
    console.log(`No html files found. dir=${args.dir} fileFilter="${args.file}"`);
    return;
  }

  console.log(`Previewing ${selected.length} file(s) from ${args.dir}`);
  for (const file of selected) {
    const html = await readFile(file, 'utf8');
    const rawText = htmlToTextRaw(html);
    const before = normalizeOld(rawText);
    const after = normalizeNew(rawText);
    printPreview(path.basename(file), rawText, before, after, args.context);
  }
}

main().catch((error) => {
  console.error('Preview tool failed:', error);
  process.exitCode = 1;
});

