/**
 * Legacy entrypoint preserved for discoverability.
 * The authoritative template verification lives in scripts/template-smoke-test.ts.
 */

const { spawn } = require('child_process');

const child = spawn('npx', ['tsx', 'scripts/template-smoke-test.ts'], {
  cwd: process.cwd(),
  shell: true,
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('close', (code) => {
  process.exitCode = code ?? 1;
});