import { readdir } from 'node:fs/promises';
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
  const parsedRoot = path.resolve(process.cwd(), 'test_sources', 'parsed_live');
  const entries = await readdir(parsedRoot, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.resolve(parsedRoot, e.name))
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, limit);

  for (const dir of dirs) {
    console.log(`\n--- seed batch: ${dir} ---`);
    await runNode('scripts/seed-ege-live-validated.mjs', ['--parsedDir', dir]);
  }
}

await main();
