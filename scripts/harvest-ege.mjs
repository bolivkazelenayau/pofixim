import { spawn } from 'node:child_process';

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
  const value = (spec ?? '9-21').trim();
  const out = new Set();
  for (const chunk of value.split(',')) {
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

function runNodeScript(scriptPath, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${scriptPath} failed with code ${code}`));
    });
  });
}

const args = parseArgs(process.argv);
const source = (args.source ?? 'local').toLowerCase();
const profile = args.profile ?? 'strict_fipi';
const count = Number(args.count ?? 100);
const types = parseTypesSpec(args.types ?? '9-21');
const perType = args['per-type'] === 'true';

if (types.length === 0) {
  console.error('No valid types selected. Use --types 9-21 or --types 15 or --types 9,10,11');
  process.exit(1);
}

console.log(`Source: ${source}`);
console.log(`Profile: ${profile}`);
console.log(`Count: ${count}`);
console.log(`Types: ${types.join(',')}`);
if (perType) console.log('Mode: per-type');

if (source !== 'local') {
  if (source === 'live') {
    console.log('\n=== Harvest raw variants from live site ===');
    if (perType) {
      for (const type of types) {
        console.log(`\n--- Live per-type run: ${type} ---`);
        await runNodeScript('scripts/harvest-ege-live.mjs', {
          HARVEST_TYPES: String(type),
          HARVEST_COUNT: String(count),
        });
      }
    } else {
      await runNodeScript('scripts/harvest-ege-live.mjs', {
        HARVEST_TYPES: types.join(','),
        HARVEST_COUNT: String(count),
      });
    }
    console.log('\nLive harvest completed (raw HTML + manifest).');
    console.log('Next step: convert raw HTML to markdown/jsonl and import to DB.');
    process.exit(0);
  }
  console.error(`Unknown source: ${source}. Use --source local or --source live`);
  process.exit(2);
}

if (count !== 100) {
  console.log('Note: for local source, --count is informational and does not limit parsed rows.');
}

const typesEnv = { EGE_TYPES: types.join(',') };

if (types.some((t) => t <= 19)) {
  console.log('\n=== Ensure enum ege_multi_select ===');
  await runNodeScript('scripts/apply-ege-multi-select-enum.mjs');
}
if (types.includes(20)) {
  console.log('\n=== Ensure enum ege20_complex_sentence_punctuation ===');
  await runNodeScript('scripts/apply-ege20-enum.mjs');
}
if (types.some((t) => t >= 9 && t <= 11)) {
  console.log('\n=== Seed 9-11 ===');
  await runNodeScript('scripts/seed-ege9-11-from-md.mjs', typesEnv);
}
if (types.some((t) => t >= 12 && t <= 19)) {
  console.log('\n=== Seed 12-19 ===');
  await runNodeScript('scripts/seed-ege12-19-from-md.mjs', typesEnv);
}
if (types.includes(20)) {
  console.log('\n=== Seed 20 ===');
  await runNodeScript('scripts/seed-ege20-from-md.mjs');
}
if (types.includes(21)) {
  console.log('\n=== Seed 21 ===');
  await runNodeScript('scripts/seed-ege21-from-md.mjs');
}

console.log('\nHarvest completed.');
