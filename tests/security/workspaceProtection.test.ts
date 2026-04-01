import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isAgentPrimeCodebase, validateWorkspaceNotSelf } from '../../src/main/security/workspaceProtection';

describe('workspaceProtection', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const createdTempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of createdTempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks the AgentPrime repository itself', () => {
    const result = validateWorkspaceNotSelf(repoRoot);

    expect(result.valid).toBe(false);
    expect(isAgentPrimeCodebase(repoRoot)).toBe(true);
  });

  it('allows same-drive workspaces outside the installation root', () => {
    const workspacePath = path.join(path.parse(repoRoot).root, 'test', 'DinoSUpreme');
    const result = validateWorkspaceNotSelf(workspacePath);

    expect(result.valid).toBe(true);
    expect(isAgentPrimeCodebase(workspacePath)).toBe(false);
  });

  it('does not treat sibling folders with shared prefixes as self-modification', () => {
    const siblingPath = path.join(
      path.dirname(repoRoot),
      `${path.basename(repoRoot)}-sandbox`,
    );
    const result = validateWorkspaceNotSelf(siblingPath);

    expect(result.valid).toBe(true);
    expect(isAgentPrimeCodebase(siblingPath)).toBe(false);
  });

  it('still blocks external folders that declare themselves as AgentPrime', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-workspace-'));
    createdTempDirs.push(tempDir);
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'agentprime' }, null, 2),
      'utf-8',
    );

    const result = validateWorkspaceNotSelf(tempDir);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('package.json');
  });
});
