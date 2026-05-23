import { spawn } from 'node:child_process';

const STEPS = [
  'scripts/apply-ege-multi-select-enum.mjs',
  'scripts/apply-ege20-enum.mjs',
  'scripts/seed-ege9-11-from-md.mjs',
  'scripts/seed-ege12-19-from-md.mjs',
  'scripts/seed-ege20-from-md.mjs',
  'scripts/seed-ege21-from-md.mjs',
];

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${scriptPath} failed with code ${code}`));
    });
  });
}

for (const step of STEPS) {
  console.log(`\n=== Running ${step} ===`);
  await runNodeScript(step);
}

console.log('\nAll seed steps completed.');
