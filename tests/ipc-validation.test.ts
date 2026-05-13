import { isPathInsideWorkspace, resolveValidatedPath, validateSettings } from '../src/main/security/ipcValidation';

describe('ipcValidation hardening', () => {
  it('does not allow sibling-prefix workspace escapes', () => {
    const workspace = process.platform === 'win32' ? 'C:\\repo\\app' : '/repo/app';
    const sibling = process.platform === 'win32' ? 'C:\\repo\\app-evil\\file.ts' : '/repo/app-evil/file.ts';

    expect(isPathInsideWorkspace(sibling, workspace)).toBe(false);
  });

  it('allows paths inside the workspace', () => {
    const workspace = process.platform === 'win32' ? 'C:\\repo\\app' : '/repo/app';
    const child = process.platform === 'win32' ? 'C:\\repo\\app\\src\\file.ts' : '/repo/app/src/file.ts';

    expect(isPathInsideWorkspace(child, workspace)).toBe(true);
  });

  it('rejects resolved traversal outside workspace', () => {
    const workspace = process.platform === 'win32' ? 'C:\\repo\\app' : '/repo/app';
    const result = resolveValidatedPath('../secret.txt', workspace, { sanitizeFilename: false });

    expect(result.valid).toBe(false);
  });

  it('rejects unknown and prototype settings keys', () => {
    expect(validateSettings({ fontSize: 16 }).valid).toBe(true);
    expect(validateSettings({ unknownSetting: true }).valid).toBe(false);
    expect(validateSettings({ constructor: { polluted: true } }).valid).toBe(false);
  });
});
