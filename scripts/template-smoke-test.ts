import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import TemplateEngine from '../src/main/legacy/template-engine';

type CommandSpec = {
  command: string;
  cwd?: string;
  requiredTools?: string[];
};

const pythonCommand = process.platform === 'win32' ? 'py -3' : 'python3';

const templateCommands: Record<string, CommandSpec[]> = {
  'electron-react': [{ command: 'npm run build', requiredTools: ['npm'] }],
  'tauri-react': [
    { command: 'npm run build', requiredTools: ['npm'] },
    { command: 'cargo check', cwd: 'src-tauri', requiredTools: ['cargo'] }
  ],
  'fullstack-react-fastapi': [
    { command: 'npm run build', cwd: 'frontend', requiredTools: ['npm'] },
    { command: `${pythonCommand} -m compileall .`, cwd: 'backend', requiredTools: [pythonCommand] }
  ],
  'fullstack-react-express': [{ command: 'npm run build', requiredTools: ['npm'] }],
  'nextjs-fullstack': [{ command: 'npm run build', requiredTools: ['npm'] }],
  'vue-vite': [{ command: 'npm run build', requiredTools: ['npm'] }],
  'sveltekit': [
    { command: 'npm run check', requiredTools: ['npm'] },
    { command: 'npm run build', requiredTools: ['npm'] }
  ],
  'python-cli': [{ command: `${pythonCommand} -m compileall src tests`, requiredTools: [pythonCommand] }],
  'go-microservice': [{ command: 'go mod tidy && go build ./...', requiredTools: ['go'] }],
  'rust-cli': [{ command: 'cargo build', requiredTools: ['cargo'] }],
  'threejs-game': [{ command: 'npm run build', requiredTools: ['npm'] }]
};

function isToolAvailable(commandSpec: string): boolean {
  const [command, ...args] = commandSpec.split(' ').filter(Boolean);
  if (!command) {
    return false;
  }

  const result = spawnSync(command, [...args, '--version'], {
    shell: true,
    stdio: 'ignore',
    env: { ...process.env }
  });

  return result.status === 0;
}

async function runCommand(command: string, cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed (${code}): ${command}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const templatesDir = path.resolve(__dirname, '../templates');
  const engine = new TemplateEngine(templatesDir);
  const registry = engine.loadRegistry();
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-template-smoke-'));
  const keepArtifacts = process.env.AGENTPRIME_KEEP_TEMPLATE_SMOKE === 'true';
  const filter = new Set(
    (process.env.AGENTPRIME_TEMPLATE_FILTER || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const failures: Array<{ templateId: string; error: string }> = [];
  const skipped: Array<{ templateId: string; reason: string }> = [];

  console.log(`Using smoke directory: ${baseDir}`);

  for (const template of registry.templates) {
    const templateId = template.id;
    if (filter.size > 0 && !filter.has(templateId)) {
      continue;
    }
    const commands = templateCommands[templateId];

    if (!commands) {
      failures.push({ templateId, error: 'No smoke commands configured for template.' });
      continue;
    }

    const projectName = `smoke-${templateId}`;
    console.log(`\n=== Generating ${templateId} ===`);

    try {
      const result = await engine.createProject(templateId, baseDir, {
        projectName,
        author: 'AgentPrime Smoke Test',
        description: `Smoke test project for ${template.name}`
      });

      console.log(result.installOutput || 'No automatic install output.');

      for (const spec of commands) {
        const missingTools = (spec.requiredTools || []).filter((tool) => !isToolAvailable(tool));
        if (missingTools.length > 0) {
          const reason = `Missing required tools: ${missingTools.join(', ')}`;
          if (process.env.CI === 'true' || process.env.AGENTPRIME_FAIL_ON_MISSING_TOOLCHAIN === 'true') {
            throw new Error(reason);
          }
          console.warn(`Skipping ${templateId} command "${spec.command}" (${reason})`);
          skipped.push({ templateId, reason: `${spec.command} - ${reason}` });
          continue;
        }

        const cwd = spec.cwd ? path.join(result.projectPath, spec.cwd) : result.projectPath;
        console.log(`\n--- ${templateId}: ${spec.command} (${cwd}) ---`);
        await runCommand(spec.command, cwd);
      }
    } catch (error: any) {
      failures.push({
        templateId,
        error: error?.message || String(error)
      });
    }
  }

  if (failures.length > 0) {
    console.error('\nTemplate smoke test failures:');
    for (const failure of failures) {
      console.error(`- ${failure.templateId}: ${failure.error}`);
    }
    if (!keepArtifacts) {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
    process.exitCode = 1;
    return;
  }

  if (skipped.length > 0) {
    console.warn('\nTemplate smoke test skipped commands:');
    for (const entry of skipped) {
      console.warn(`- ${entry.templateId}: ${entry.reason}`);
    }
  }

  console.log('\nAll templates generated and built successfully.');
  if (!keepArtifacts) {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
