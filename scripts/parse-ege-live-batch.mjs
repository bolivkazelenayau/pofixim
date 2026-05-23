import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
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

function runNode(script, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with code ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const limit = Number(args.limit ?? 13);
  const rawRoot = path.resolve(process.cwd(), 'test_sources', 'raw_live');
  const entries = await readdir(rawRoot, { withFileTypes: true });
  const dirs = (
    await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const dir = path.resolve(rawRoot, e.name);
          const hasManifest = await access(path.resolve(dir, 'manifest.json'))
            .then(() => true)
            .catch(() => false);
          return hasManifest ? dir : null;
        }),
    )
  )
    .filter(Boolean)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, limit);

  for (const dir of dirs) {
    console.log(`\n--- parse batch: ${dir} ---`);
    await runNode('scripts/parse-ege-live-html.mjs', ['--rawDir', dir]);
  }
}

await main();
