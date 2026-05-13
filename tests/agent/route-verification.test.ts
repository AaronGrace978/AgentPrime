import { validateRouteModifiedFiles } from '../../src/main/agent/route-verification';

function routePlan(overrides: any = {}) {
  return {
    verificationPlan: {
      strategy: 'diagnostics',
      skipProjectVerification: false,
    },
    ...overrides,
  } as any;
}

describe('validateRouteModifiedFiles', () => {
  it('skips diagnostics for inspect-only route plans', () => {
    const result = validateRouteModifiedFiles(
      routePlan({ verificationPlan: { strategy: 'inspect-only', skipProjectVerification: true } }),
      {
        diagnostics: [
          { severity: 'error', filePath: 'src/App.tsx', line: 1, column: 1, message: 'broken' },
        ],
      } as any,
      ['src/App.tsx']
    );

    expect(result.success).toBe(true);
    expect(result.diagnosticCount).toBe(0);
  });

  it('blocks when modified files still have IDE errors', () => {
    const result = validateRouteModifiedFiles(
      routePlan(),
      {
        diagnostics: [
          { severity: 'error', filePath: 'G:/repo/src/App.tsx', line: 12, column: 4, message: 'Type mismatch' },
        ],
      } as any,
      ['src/App.tsx']
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Type mismatch');
  });

  it('does not block on unrelated diagnostics', () => {
    const result = validateRouteModifiedFiles(
      routePlan(),
      {
        diagnostics: [
          { severity: 'error', filePath: 'src/Other.ts', line: 3, column: 1, message: 'old error' },
        ],
      } as any,
      ['src/App.tsx']
    );

    expect(result.success).toBe(true);
    expect(result.diagnosticCount).toBe(1);
  });
});
