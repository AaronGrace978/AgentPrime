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
      expect.arrayContaining(['src/**/*.ts', 'src/**/*.tsx'])
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
});
