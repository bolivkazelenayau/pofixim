import { readFile, readdir } from 'node:fs/promises';
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

function runHarvest(type, count) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/harvest-ege.mjs', '--types', String(type), '--source', 'live', '--count', String(count)], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`harvest retry type ${type} failed with code ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const limit = Number(args.limit ?? 13);
  const expectedRows = Number(args.expectedRows ?? process.env.HARVEST_FILL_VALUE ?? 100);
  const parsedRoot = path.resolve(process.cwd(), 'test_sources', 'parsed_live');
  const entries = await readdir(parsedRoot, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.resolve(parsedRoot, e.name))
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, limit);

  const typesToRetry = new Set();
  for (const dir of dirs) {
    const reportPath = path.resolve(dir, 'report.json');
    let report;
    try {
      report = JSON.parse(await readFile(reportPath, 'utf8'));
    } catch {
      continue;
    }
    const onlyType = Array.isArray(report.expectedTypes) && report.expectedTypes.length === 1 ? Number(report.expectedTypes[0]) : null;
    const rows = Number(report.validRows ?? 0);
    if (Number.isInteger(onlyType) && rows < expectedRows) {
      typesToRetry.add(onlyType);
    }
  }

  if (!typesToRetry.size) {
    console.log(`No incomplete runs found (expectedRows=${expectedRows}).`);
    return;
  }

  console.log(`Retrying incomplete live types: ${[...typesToRetry].sort((a, b) => a - b).join(', ')}`);
  for (const type of [...typesToRetry].sort((a, b) => a - b)) {
    await runHarvest(type, 1);
  }
}

await main();
