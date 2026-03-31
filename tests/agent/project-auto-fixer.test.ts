import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectAutoFixer } from '../../src/main/agent/tools/project-auto-fixer';

describe('ProjectAutoFixer HTML entrypoints', () => {
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

  it('repairs malformed main.tsxx references without introducing extra x suffixes', () => {
    const workspacePath = createTempDir('agentprime-autofixer-');
    const fixes: string[] = [];
    const errors: string[] = [];

    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, 'index.html'),
      '<!DOCTYPE html><html><body><script type="module" src="/src/main.tsxx"></script></body></html>'
    );
    fs.writeFileSync(path.join(workspacePath, 'src', 'main.tsx'), 'console.log("ok");');

    (ProjectAutoFixer as any).fixHtmlEntryPoints(workspacePath, fixes, errors);

    const updatedHtml = fs.readFileSync(path.join(workspacePath, 'index.html'), 'utf-8');
    expect(updatedHtml).toContain('/src/main.tsx');
    expect(updatedHtml).not.toContain('main.tsxx');
    expect(updatedHtml).not.toContain('main.tsxxx');
    expect(errors).toEqual([]);
  });
});
