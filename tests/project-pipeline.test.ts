import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { ProjectPipeline } = require('../src/main/core/project-pipeline');

describe('ProjectPipeline inference', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot && fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(dir);
    return dir;
  }

  it('detects modern Tauri projects from current package names and src-tauri', () => {
    const workspacePath = createTempDir('agentprime-pipeline-tauri-');
    fs.mkdirSync(path.join(workspacePath, 'src-tauri'), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, 'package.json'),
      JSON.stringify(
        {
          name: 'tauri-app',
          scripts: {
            build: 'tauri build',
            test: 'vitest',
          },
          devDependencies: {
            '@tauri-apps/cli': '^2.0.0',
          },
          dependencies: {
            '@tauri-apps/api': '^2.0.0',
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const pipeline = new ProjectPipeline(workspacePath);

    expect(pipeline.projectType).toBe('tauri');
    expect(pipeline.buildCommands).toEqual(['npm run build']);
    expect(pipeline.testCommands).toEqual(['npm test']);
  });

  it('uses build scripts instead of npm install for React app builds', () => {
    const workspacePath = createTempDir('agentprime-pipeline-react-');
    fs.writeFileSync(
      path.join(workspacePath, 'package.json'),
      JSON.stringify(
        {
          name: 'react-app',
          scripts: {
            build: 'vite build',
            test: 'vitest',
          },
          dependencies: {
            react: '^18.2.0',
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const pipeline = new ProjectPipeline(workspacePath);

    expect(pipeline.projectType).toBe('react');
    expect(pipeline.buildCommands).toEqual(['npm run build']);
    expect(pipeline.buildCommands).not.toContain('npm install');
    expect(pipeline.testCommands).toEqual(['npm test']);
  });
});
