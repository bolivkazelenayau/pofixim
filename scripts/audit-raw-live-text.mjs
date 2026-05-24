import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFragment } from 'parse5';

function parseArgs(argv) {
  const args = {
    dir: path.resolve(process.cwd(), 'test_sources', 'raw_live'),
    samples: 5,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) continue;
    if (key === 'dir') args.dir = path.resolve(next);
    if (key === 'samples') args.samples = Math.max(1, Number(next) || 5);
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
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out.sort();
}

function htmlToTextRaw(html) {
  const fragment = parseFragment(html);
  const parts = [];
  const blockTags = new Set(['div', 'p', 'li', 'tr', 'td', 'th', 'section', 'ul', 'ol', 'table']);

  function visit(node) {
    if (node.nodeName === '#text') {
      parts.push(node.value ?? '');
      return;
    }
    if (node.nodeName === '#comment') return;
    const tag = node.tagName;
    if (tag === 'script' || tag === 'style') return;
    if (tag === 'br') {
      parts.push('\n');
      return;
    }
    if (blockTags.has(tag)) parts.push('\n');
    for (const child of node.childNodes ?? []) visit(child);
    if (blockTags.has(tag)) parts.push('\n');
  }

  for (const child of fragment.childNodes ?? []) visit(child);
  return parts.join('');
}

function collectMatches(text, regex, limit = 5) {
  const out = [];
  let m;
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
    if (out.length >= limit) break;
  }
  return out;
}

function count(text, regex) {
  const m = text.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`));
  return m ? m.length : 0;
}

function normalizeSnippet(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function main() {
  const args = parseArgs(process.argv);
  const files = await listHtmlFiles(args.dir);
  if (!files.length) {
    console.log(`No .html files found in ${args.dir}`);
    return;
  }

  const totals = {
    files: files.length,
    nbspEntity: 0,
    softHyphen: 0,
    zeroWidth: 0,
    spaceBeforePunct: 0,
    hyphenLineBreak: 0,
    softHyphenLineBreak: 0,
  };

  const fileRows = [];
  const globalExamples = {
    spaceBeforePunct: [],
    hyphenLineBreak: [],
    softHyphenLineBreak: [],
  };

  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const text = htmlToTextRaw(html);

    const row = {
      file: path.basename(file),
      nbspEntity: count(html, /&nbsp;/g),
      softHyphen: count(text, /\u00ad/g),
      zeroWidth: count(text, /[\u200b\u200c\u200d\ufeff]/g),
      spaceBeforePunct: count(text, /\s+[.,;:!?](?=\s|$)/g),
      hyphenLineBreak: count(text, /[A-Za-zА-Яа-яЁё]-\n[A-Za-zА-Яа-яЁё]/g),
      softHyphenLineBreak: count(text, /[A-Za-zА-Яа-яЁё]\u00ad\n[A-Za-zА-Яа-яЁё]/g),
    };

    totals.nbspEntity += row.nbspEntity;
    totals.softHyphen += row.softHyphen;
    totals.zeroWidth += row.zeroWidth;
    totals.spaceBeforePunct += row.spaceBeforePunct;
    totals.hyphenLineBreak += row.hyphenLineBreak;
    totals.softHyphenLineBreak += row.softHyphenLineBreak;

    fileRows.push(row);

    if (globalExamples.spaceBeforePunct.length < args.samples) {
      const ex = collectMatches(text, /.{0,25}\s+[.,;:!?](?=\s|$).{0,25}/g, args.samples);
      for (const v of ex) {
        if (globalExamples.spaceBeforePunct.length >= args.samples) break;
        globalExamples.spaceBeforePunct.push(normalizeSnippet(v));
      }
    }

    if (globalExamples.hyphenLineBreak.length < args.samples) {
      const ex = collectMatches(text, /.{0,20}[A-Za-zА-Яа-яЁё]-\n[A-Za-zА-Яа-яЁё].{0,20}/g, args.samples);
      for (const v of ex) {
        if (globalExamples.hyphenLineBreak.length >= args.samples) break;
        globalExamples.hyphenLineBreak.push(normalizeSnippet(v));
      }
    }

    if (globalExamples.softHyphenLineBreak.length < args.samples) {
      const ex = collectMatches(text, /.{0,20}[A-Za-zА-Яа-яЁё]\u00ad\n[A-Za-zА-Яа-яЁё].{0,20}/g, args.samples);
      for (const v of ex) {
        if (globalExamples.softHyphenLineBreak.length >= args.samples) break;
        globalExamples.softHyphenLineBreak.push(normalizeSnippet(v));
      }
    }
  }

  console.log('=== RAW LIVE HTML TEXT AUDIT ===');
  console.log(`Directory: ${args.dir}`);
  console.log(`Files: ${totals.files}`);
  console.log('');
  console.log('Totals:');
  console.log(`  &nbsp; entities: ${totals.nbspEntity}`);
  console.log(`  soft hyphen chars (U+00AD): ${totals.softHyphen}`);
  console.log(`  zero-width chars (U+200B/C/D, U+FEFF): ${totals.zeroWidth}`);
  console.log(`  spaces before punctuation: ${totals.spaceBeforePunct}`);
  console.log(`  hard hyphen line-break joins (-\\n): ${totals.hyphenLineBreak}`);
  console.log(`  soft hyphen line-break joins (U+00AD\\n): ${totals.softHyphenLineBreak}`);
  console.log('');
  console.log('Per file:');
  for (const row of fileRows) {
    console.log(
      `  ${row.file}: nbsp=${row.nbspEntity}, shy=${row.softHyphen}, zws=${row.zeroWidth}, punctSpace=${row.spaceBeforePunct}, hyphenBR=${row.hyphenLineBreak}, shyBR=${row.softHyphenLineBreak}`,
    );
  }
  console.log('');
  console.log('Examples:');
  console.log('  space-before-punctuation:');
  for (const ex of globalExamples.spaceBeforePunct) console.log(`    - ${ex}`);
  console.log('  hard-hyphen line break:');
  for (const ex of globalExamples.hyphenLineBreak) console.log(`    - ${ex}`);
  console.log('  soft-hyphen line break:');
  for (const ex of globalExamples.softHyphenLineBreak) console.log(`    - ${ex}`);
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exitCode = 1;
});

