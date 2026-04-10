import { TaskMaster } from '../../src/main/agent/task-master';

describe('TaskMaster buildPlan', () => {
  it('creates bounded assignments for create mode specialists', () => {
    const taskMaster = new TaskMaster('G:/AgentPrime', 'Build a three.js flight simulator with React UI');

    const plan = taskMaster.buildPlan({
      mode: 'create',
      specialists: [
        'executive_router',
        'task_master',
        'template_scaffold_specialist',
        'javascript_specialist',
        'pipeline_specialist',
        'integration_verifier',
      ],
    });

    expect(plan.activeStepId).toBeDefined();
    expect(plan.summary).toContain('create');
    expect(plan.claimedFiles.template_scaffold_specialist).toEqual(
      expect.arrayContaining(['package.json', 'index.html', 'src/game/**'])
    );
    expect(plan.claimedFiles.javascript_specialist).toEqual(
      expect.arrayContaining(['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.css', 'README.md'])
    );
    expect(plan.claimedFiles.pipeline_specialist).toEqual(
      expect.arrayContaining(['package.json', 'tsconfig*.json', 'vite.config.*', 'README.md'])
    );
    expect(plan.steps.map((step) => step.specialist)).toEqual([
      'template_scaffold_specialist',
      'javascript_specialist',
      'pipeline_specialist',
      'integration_verifier',
    ]);
  });

  it('focuses repair assignments on retry files', () => {
    const taskMaster = new TaskMaster('G:/AgentPrime', 'Fix the project until it builds');

    const plan = taskMaster.buildPlan({
      mode: 'repair',
      specialists: ['task_master', 'repair_specialist', 'integration_verifier'],
      retryContext: {
        missingFiles: ['src/App.tsx'],
        errors: ['Build failed in backend/app.py and vite.config.ts'],
      },
    });

    expect(plan.claimedFiles.repair_specialist).toEqual(
      expect.arrayContaining(['src/App.tsx', 'backend/app.py', 'vite.config.ts'])
    );
    const repairStep = plan.steps.find((step) => step.specialist === 'repair_specialist');
    expect(repairStep?.acceptanceCriteria.join(' ')).toContain('src/App.tsx');
  });

  it('keeps direct verifier-owned specialists in the repair plan', () => {
    const taskMaster = new TaskMaster('G:/AgentPrime', 'Repair the verifier failures only');

    const plan = taskMaster.buildPlan({
      mode: 'repair',
      specialists: ['task_master', 'security_specialist', 'data_contract_specialist', 'repair_specialist', 'integration_verifier'],
      retryContext: {
        missingFiles: [],
        errors: ['Unauthorized token in src/auth/session.ts', 'Type mismatch in src/api/contracts.ts'],
        findings: [
          {
            severity: 'error',
            summary: 'Unauthorized token in src/auth/session.ts',
            files: ['src/auth/session.ts'],
            suggestedOwner: 'security_specialist',
          },
          {
            severity: 'error',
            summary: 'Type mismatch in src/api/contracts.ts',
            files: ['src/api/contracts.ts'],
            suggestedOwner: 'data_contract_specialist',
          },
        ],
      },
    });

    expect(plan.steps.map((step) => step.specialist)).toEqual(expect.arrayContaining([
      'security_specialist',
      'data_contract_specialist',
      'repair_specialist',
    ]));
    expect(plan.claimedFiles.security_specialist).toEqual(expect.arrayContaining(['src/**', 'backend/**']));
    expect(plan.claimedFiles.data_contract_specialist).toEqual(expect.arrayContaining(['src/**', 'prisma/**']));
  });
});
