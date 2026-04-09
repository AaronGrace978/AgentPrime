import {
  buildFallbackReviewPlanSummary,
  buildRepairPrompt,
  shouldAutoVerifyReviewChanges,
  type ReviewVerificationState,
} from '../src/renderer/components/App/reviewFlow';

describe('Review flow helpers', () => {
  const verification: ReviewVerificationState = {
    status: 'failed',
    projectTypeLabel: 'Vite App',
    readinessSummary: 'Ready only after npm run build succeeds and npm run dev starts successfully.',
    startCommand: 'npm run dev',
    buildCommand: 'npm run build',
    installCommand: 'npm install',
    issues: ['Build failed: Missing dependency', 'Run failed: Port already in use'],
  };

  it('auto-verifies once all accepted changes are resolved', () => {
    const shouldVerify = shouldAutoVerifyReviewChanges([
      {
        filePath: 'src/main.ts',
        oldContent: '',
        newContent: 'console.log("ok")',
        action: 'created',
        status: 'accepted',
      },
    ], {
      status: 'idle',
      issues: [],
    }, true);

    expect(shouldVerify).toBe(true);
  });

  it('does not auto-verify while review decisions are still pending', () => {
    const shouldVerify = shouldAutoVerifyReviewChanges([
      {
        filePath: 'src/main.ts',
        oldContent: '',
        newContent: 'console.log("ok")',
        action: 'created',
        status: 'pending',
      },
    ], {
      status: 'idle',
      issues: [],
    }, true);

    expect(shouldVerify).toBe(false);
  });

  it('does not auto-verify before staged changes are applied', () => {
    const shouldVerify = shouldAutoVerifyReviewChanges([
      {
        filePath: 'src/main.ts',
        oldContent: '',
        newContent: 'console.log("ok")',
        action: 'created',
        status: 'accepted',
      },
    ], {
      status: 'idle',
      issues: [],
    }, false);

    expect(shouldVerify).toBe(false);
  });

  it('builds a repair prompt from verification failures', () => {
    const prompt = buildRepairPrompt(
      'Create a polished Vite dashboard',
      verification,
      ['src/App.tsx'],
      ['src/legacy.css']
    );

    expect(prompt).toContain('Original task: Create a polished Vite dashboard');
    expect(prompt).toContain('Detected project: Vite App');
    expect(prompt).toContain('Install command: npm install');
    expect(prompt).toContain('Build command: npm run build');
    expect(prompt).toContain('Run command: npm run dev');
    expect(prompt).toContain('Accepted files:');
    expect(prompt).toContain('Rejected files (do not modify):');
    expect(prompt).toContain('Build failed: Missing dependency');
    expect(prompt).toContain('verifier-failed accepted files');
    expect(prompt).toContain('Do not add new features');
  });

  it('builds a fallback review plan summary from staged changes', () => {
    const plan = buildFallbackReviewPlanSummary('Refactor the login form', [
      {
        filePath: 'src/Login.tsx',
        oldContent: 'before',
        newContent: 'after',
        action: 'modified',
        status: 'pending',
      },
    ]);

    expect(plan.summary).toContain('1 staged file');
    expect(plan.rationale).toContain('review checkpoint');
    expect(plan.steps[0].summary).toContain('Refactor the login form');
    expect(plan.fileReasons[0]).toMatchObject({
      filePath: 'src/Login.tsx',
      owner: 'AgentPrime',
    });
  });
});
