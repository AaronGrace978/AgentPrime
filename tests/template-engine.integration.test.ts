import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import TemplateEngine from '../src/main/legacy/template-engine.ts';

describe('TemplateEngine integration', () => {
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

  it('creates projects with derived variables and installs across multiple manifests', async () => {
    const tempRoot = createTempDir('agentprime-template-engine-');
    const templatesDir = path.join(tempRoot, 'templates');
    const templateDir = path.join(templatesDir, 'sample-template');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.mkdirSync(path.join(templateDir, 'backend'), { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'registry.json'),
      JSON.stringify({
        templates: [
          {
            id: 'sample-template',
            name: 'Sample Template',
            category: 'frontend',
            postCreate: ['npm install', 'python environment setup (backend)']
          }
        ],
        categories: [{ id: 'frontend', name: 'Frontend' }]
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(templateDir, 'template.json'),
      JSON.stringify({
        id: 'sample-template',
        name: 'Sample Template',
        postCreate: ['npm install', 'python environment setup (backend)'],
        directories: ['backend'],
        files: [
          { template: 'package.json', path: 'package.json' },
          { template: 'README.md', path: 'README.md' },
          { template: 'backend/requirements.txt', path: 'backend/requirements.txt' }
        ]
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(templateDir, 'package.json'),
      JSON.stringify({ name: '{{packageName}}', description: '{{description}}' }, null, 2)
    );
    fs.writeFileSync(
      path.join(templateDir, 'README.md'),
      '# {{projectName}}\n\n{{description}}\n\n{{currentYear}}'
    );
    fs.writeFileSync(
      path.join(templateDir, 'backend/requirements.txt'),
      'fastapi==0.1.0'
    );

    const nodeInstalls: string[] = [];
    const pythonInstalls: string[] = [];
    const engine = new TemplateEngine(templatesDir) as TemplateEngine & {
      installNodeDependencies: (projectPath: string) => Promise<{ success: boolean; output: string }>;
      installPythonDependencies: (projectPath: string) => Promise<{ success: boolean; output: string }>;
    };

    jest.spyOn(engine, 'installNodeDependencies').mockImplementation(async (projectPath: string) => {
      nodeInstalls.push(projectPath);
      return { success: true, output: 'npm ok' };
    });
    jest.spyOn(engine, 'installPythonDependencies').mockImplementation(async (projectPath: string) => {
      pythonInstalls.push(projectPath);
      return { success: true, output: 'python ok' };
    });

    const result = await engine.createProject('sample-template', tempRoot, {
      projectName: 'My Fancy App',
      author: 'Test Author',
      description: 'A generated sample'
    });

    expect(result.success).toBe(true);
    expect(result.dependenciesInstalled).toBe(true);
    expect(result.postCreate).toEqual(['npm install', 'python environment setup (backend)']);
    expect(nodeInstalls).toEqual([path.join(tempRoot, 'My Fancy App')]);
    expect(pythonInstalls).toEqual([path.join(tempRoot, 'My Fancy App', 'backend')]);

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(tempRoot, 'My Fancy App', 'package.json'), 'utf-8')
    );
    expect(packageJson.name).toBe('my-fancy-app');

    const readme = fs.readFileSync(path.join(tempRoot, 'My Fancy App', 'README.md'), 'utf-8');
    expect(readme).toContain('# My Fancy App');
    expect(readme).toContain('A generated sample');
    expect(readme).toContain(String(new Date().getFullYear()));
  });

  it('fails fast when a declared template source file is missing', async () => {
    const tempRoot = createTempDir('agentprime-template-engine-missing-');
    const templatesDir = path.join(tempRoot, 'templates');
    const templateDir = path.join(templatesDir, 'broken-template');
    fs.mkdirSync(templateDir, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'registry.json'),
      JSON.stringify({
        templates: [{ id: 'broken-template', name: 'Broken Template', category: 'frontend' }],
        categories: [{ id: 'frontend', name: 'Frontend' }]
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(templateDir, 'template.json'),
      JSON.stringify({
        id: 'broken-template',
        name: 'Broken Template',
        files: [{ template: 'missing.txt', path: 'missing.txt' }]
      }, null, 2)
    );

    const engine = new TemplateEngine(templatesDir);

    await expect(
      engine.createProject('broken-template', tempRoot, {
        projectName: 'broken-project'
      })
    ).rejects.toThrow('Template file not found');

    expect(fs.existsSync(path.join(tempRoot, 'broken-project'))).toBe(false);
  });

  it('rolls back in-place materialization when a template fails partway through', async () => {
    const tempRoot = createTempDir('agentprime-template-engine-rollback-');
    const templatesDir = path.join(tempRoot, 'templates');
    const templateDir = path.join(templatesDir, 'broken-in-place');
    const workspacePath = path.join(tempRoot, 'workspace');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.mkdirSync(workspacePath, { recursive: true });

    fs.writeFileSync(
      path.join(templatesDir, 'registry.json'),
      JSON.stringify({
        templates: [{ id: 'broken-in-place', name: 'Broken In Place', category: 'frontend' }],
        categories: [{ id: 'frontend', name: 'Frontend' }]
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(templateDir, 'template.json'),
      JSON.stringify({
        id: 'broken-in-place',
        name: 'Broken In Place',
        directories: ['src'],
        files: [
          { template: 'README.md', path: 'README.md' },
          { template: 'missing.ts', path: 'src/missing.ts' }
        ]
      }, null, 2)
    );

    fs.writeFileSync(path.join(templateDir, 'README.md'), '# Updated scaffold\n');
    fs.writeFileSync(path.join(workspacePath, 'README.md'), '# Existing workspace\n');

    const engine = new TemplateEngine(templatesDir);

    await expect(
      engine.materializeProject({
        templateId: 'broken-in-place',
        targetDir: workspacePath,
        variables: { projectName: 'workspace' },
        mode: 'in-place',
        runPostCreate: false
      })
    ).rejects.toThrow('Template file not found');

    expect(fs.readFileSync(path.join(workspacePath, 'README.md'), 'utf-8')).toBe('# Existing workspace\n');
    expect(fs.existsSync(path.join(workspacePath, 'src'))).toBe(false);
  });
});
