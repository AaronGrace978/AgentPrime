import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectRunner } from '../src/main/agent/tools/projectRunner';

async function main(): Promise<void> {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-vite-debug-'));
  const writeJson = (filePath: string, value: unknown) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  };

  const packageRoot = path.join(workspace, 'vendor', 'fake-vite');
  fs.mkdirSync(packageRoot, { recursive: true });
  writeJson(path.join(packageRoot, 'package.json'), {
    name: 'vite',
    version: '1.0.0',
    bin: {
      vite: 'index.js',
    },
  });

  fs.writeFileSync(path.join(packageRoot, 'index.js'), `const fs = require('fs');
const path = require('path');
const http = require('http');
const args = process.argv.slice(2);
if (args.includes('build')) {
  const distDir = path.join(process.cwd(), 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><h1>built</h1>');
  console.log('fake vite build ok');
  process.exit(0);
}
const portIndex = args.findIndex((arg) => arg === '--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><h1>fake vite</h1>');
});
server.listen(port, '127.0.0.1', () => {
  console.log('Local: http://localhost:' + port);
});
`, 'utf-8');

  const port = (await ProjectRunner.findAvailablePort(4173)) || 4173;
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  writeJson(path.join(workspace, 'package.json'), {
    name: 'smoke-vite',
    private: true,
    scripts: {
      dev: `vite --port ${port}`,
      build: 'vite build',
    },
    devDependencies: {
      vite: 'file:./vendor/fake-vite',
    },
  });
  fs.writeFileSync(path.join(workspace, 'vite.config.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(workspace, 'index.html'), '<!doctype html><script type="module" src="/src/main.js"></script>');
  fs.writeFileSync(path.join(workspace, 'src', 'main.js'), 'console.log("vite smoke");\n');

  const result = await ProjectRunner.autoRun(workspace);
  console.log(JSON.stringify(result, null, 2));

  fs.rmSync(workspace, { recursive: true, force: true });
}

void main();
