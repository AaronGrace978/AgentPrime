import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SpecializedAgentLoop } from '../src/main/agent/specialized-agent-loop';
import * as specializedAgents from '../src/main/agent/specialized-agents';
import { transactionManager } from '../src/main/core/transaction-manager';
import { reviewSessionManager } from '../src/main/agent/review-session-manager';
import * as telemetry from '../src/main/core/telemetry-service';
import * as projectTester from '../src/main/agent/tools/projectTester';
import { ProjectRunner } from '../src/main/agent/tools/projectRunner';
import { ProjectAutoFixer } from '../src/main/agent/tools/project-auto-fixer';
import { TimeoutError } from '../src/main/core/timeout-utils';
import { resolveVibeCoderExecutionPolicy } from '../src/main/agent/behavior-profile';

describe('SpecializedAgentLoop orchestration retry', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('retries specialist orchestration once after a transient failure', async () => {
    const workspacePath = createTempDir('agentprime-specialized-retry-');
    const loop = new SpecializedAgentLoop({ workspacePath, model: 'qwen-test' } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    const executeSpy = jest.spyOn(specializedAgents, 'executeWithSpecialists')
      .mockRejectedValueOnce(new Error('temporary upstream failure'))
      .mockResolvedValue({
        results: [],
        finalAnalysis: '',
        executedTools: [],
        scaffoldApplied: false,
        scaffoldTemplateId: undefined,
        skippedGenerativePass: false,
      } as any);

    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('application');
    jest.spyOn(loop as any, 'verifyProject').mockImplementation(async () => ({
      isComplete: true,
      missingFiles: [],
      errors: [],
      createdFiles: [],
    }));
    jest.spyOn(loop as any, 'buildResponse').mockReturnValue('retry succeeded');
    jest.spyOn(loop as any, 'finalizeProject').mockResolvedValue(undefined);

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 0,
      getOperations: () => [],
    } as any);
    jest.spyOn(transactionManager, 'commitTransaction').mockImplementation(() => undefined);
    jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'recordFileChange').mockResolvedValue(undefined as any);
    jest.spyOn(transactionManager, 'getLastCheckpoint').mockReturnValue(null);
    jest.spyOn(transactionManager, 'rollbackToCheckpoint').mockResolvedValue(undefined);
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    const result = await loop.run('Build a small tool');

    expect(result).toBe('retry succeeded');
    expect(executeSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it('rolls back immediately when a stop is requested before orchestration begins', async () => {
    const workspacePath = createTempDir('agentprime-specialized-stop-');
    const loop = new SpecializedAgentLoop({ workspacePath, model: 'qwen-test' } as any);
    const rollbackSpy = jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 0,
      getOperations: () => [],
    } as any);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    loop.requestStop('user requested');
    const result = await loop.run('Build a small tool');

    expect(rollbackSpy).not.toHaveBeenCalled();
    expect(result).toContain('Agent stopped by user');
  });

  it('retries after critical browser verification issues and succeeds on the next pass', async () => {
    const workspacePath = createTempDir('agentprime-specialized-browser-retry-');
    const loop = new SpecializedAgentLoop({ workspacePath, model: 'qwen-test' } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    const executeSpy = jest.spyOn(specializedAgents, 'executeWithSpecialists').mockResolvedValue({
      results: [],
      finalAnalysis: '',
      executedTools: [],
      scaffoldApplied: false,
      scaffoldTemplateId: undefined,
      skippedGenerativePass: false,
    } as any);
    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('application');
    jest.spyOn(loop as any, 'verifyProject').mockImplementation(async () => ({
      isComplete: true,
      missingFiles: [],
      errors: [],
      createdFiles: [],
    }));
    jest.spyOn(loop as any, 'buildResponse').mockReturnValue('browser retry succeeded');
    jest.spyOn(loop as any, 'finalizeProject').mockResolvedValue(undefined);
    jest.spyOn(ProjectRunner, 'autoRun').mockResolvedValue({
      success: true,
      validation: { issues: [] },
      installResult: null,
      buildResult: null,
      runResult: null,
    } as any);
    const browserSpy = jest.spyOn(projectTester, 'testProjectInBrowser')
      .mockResolvedValueOnce({
        passed: false,
        score: 42,
        issues: [{
          severity: 'critical',
          category: 'click',
          description: 'Primary action button is blocked',
          suggestedFix: 'Fix overlay pointer-events',
        }],
        suggestions: [],
        consoleErrors: [],
        consoleWarnings: [],
        testedElements: [],
      })
      .mockResolvedValueOnce({
        passed: true,
        score: 96,
        issues: [],
        suggestions: [],
        consoleErrors: [],
        consoleWarnings: [],
        testedElements: [],
      });

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 1,
      getOperations: () => [],
    } as any);
    jest.spyOn(transactionManager, 'commitTransaction').mockImplementation(() => undefined);
    jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'recordFileChange').mockResolvedValue(undefined as any);
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    const result = await loop.run('Ship a working browser flow');

    expect(result).toBe('browser retry succeeded');
    expect(executeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(browserSpy).toHaveBeenCalledTimes(2);
  });

  it('runs deterministic auto-fixer before escalating missing dependency issues to LLM repair', async () => {
    const workspacePath = createTempDir('agentprime-specialized-autofix-deps-');
    fs.mkdirSync(path.join(workspacePath, 'src', 'components'), { recursive: true });
    fs.writeFileSync(
      path.join(workspacePath, 'package.json'),
      JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { react: '^18.2.0' } }, null, 2)
    );
    fs.writeFileSync(
      path.join(workspacePath, 'src', 'components', 'Terminal.tsx'),
      'import { Terminal } from "xterm";\nexport const terminal = Terminal;\n'
    );

    const loop = new SpecializedAgentLoop({ workspacePath, model: 'qwen-test' } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    const executeSpy = jest.spyOn(specializedAgents, 'executeWithSpecialists').mockResolvedValue({
      results: [],
      finalAnalysis: '',
      executedTools: [],
      scaffoldApplied: false,
      scaffoldTemplateId: undefined,
      skippedGenerativePass: false,
    } as any);
    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('application');
    jest.spyOn(loop as any, 'verifyProject').mockResolvedValue({
      isComplete: true,
      missingFiles: [],
      errors: [],
      createdFiles: [],
    });
    jest.spyOn(loop as any, 'buildResponse').mockReturnValue('autofix succeeded');
    jest.spyOn(loop as any, 'finalizeProject').mockResolvedValue(undefined);
    const autoFixSpy = jest.spyOn(ProjectAutoFixer, 'fixProject').mockImplementation(async () => {
      const packageJsonPath = path.join(workspacePath, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      packageJson.dependencies.xterm = '^5.3.0';
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

      return {
        success: true,
        fixes: ['Added missing runtime dependency inferred from imports: xterm@^5.3.0'],
        errors: [],
      };
    });
    const autoRunSpy = jest.spyOn(ProjectRunner, 'autoRun')
      .mockResolvedValueOnce({
        success: false,
        validation: {
          issues: ['package.json is missing dependency "xterm" imported by src/components/Terminal.tsx'],
        },
        installResult: null,
        buildResult: null,
        runResult: null,
      } as any)
      .mockResolvedValueOnce({
        success: true,
        validation: { issues: [] },
        installResult: null,
        buildResult: null,
        runResult: null,
      } as any);
    jest.spyOn(projectTester, 'testProjectInBrowser').mockResolvedValue({
      passed: true,
      score: 95,
      issues: [],
      suggestions: [],
      consoleErrors: [],
      consoleWarnings: [],
      testedElements: [],
    });

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 1,
      getOperations: () => [],
    } as any);
    jest.spyOn(transactionManager, 'commitTransaction').mockImplementation(() => undefined);
    jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'recordFileChange').mockResolvedValue(undefined as any);
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    const result = await loop.run('Build a terminal panel');

    expect(result).toBe('autofix succeeded');
    expect(autoFixSpy).toHaveBeenCalledTimes(1);
    expect(autoRunSpy).toHaveBeenCalledTimes(2);
    expect(executeSpy.mock.invocationCallOrder.length).toBeGreaterThan(1);
    expect(autoFixSpy.mock.invocationCallOrder[0]).toBeLessThan(
      executeSpy.mock.invocationCallOrder[1]
    );
  });

  it('rolls back to the last checkpoint when a timeout happens after verification succeeds', async () => {
    const workspacePath = createTempDir('agentprime-specialized-timeout-');
    const loop = new SpecializedAgentLoop({ workspacePath, model: 'qwen-test' } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    jest.spyOn(specializedAgents, 'executeWithSpecialists').mockResolvedValue({
      results: [],
      finalAnalysis: '',
      executedTools: [],
      scaffoldApplied: false,
      scaffoldTemplateId: undefined,
      skippedGenerativePass: false,
    } as any);
    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('application');
    jest.spyOn(loop as any, 'verifyProject').mockResolvedValue({
      isComplete: true,
      missingFiles: [],
      errors: [],
      createdFiles: [],
    });
    jest.spyOn(loop as any, 'finalizeProject').mockRejectedValue(
      new TimeoutError('verification timed out', 1500)
    );
    jest.spyOn(ProjectRunner, 'autoRun').mockResolvedValue({
      success: true,
      validation: { issues: [] },
      installResult: null,
      buildResult: null,
      runResult: null,
    } as any);
    jest.spyOn(projectTester, 'testProjectInBrowser').mockResolvedValue({
      passed: true,
      score: 90,
      issues: [],
      suggestions: [],
      consoleErrors: [],
      consoleWarnings: [],
      testedElements: [],
    });

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 1,
      getOperations: () => [],
    } as any);
    jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    const rollbackToCheckpointSpy = jest
      .spyOn(transactionManager, 'rollbackToCheckpoint')
      .mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'getLastCheckpoint').mockReturnValue('checkpoint_1');
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    await expect(loop.run('Build a resilient app')).rejects.toThrow('verification timed out');
    expect(rollbackToCheckpointSpy).toHaveBeenCalledWith('checkpoint_1');
  });

  it('rolls back before commit when route verification rejects modified files', async () => {
    const workspacePath = createTempDir('agentprime-specialized-route-rollback-');
    const loop = new SpecializedAgentLoop({
      workspacePath,
      model: 'qwen-test',
      agentRoutePlan: {
        verificationPlan: {
          strategy: 'diagnostics',
          skipProjectVerification: false,
        },
      },
      ideContext: {
        diagnostics: [
          {
            filePath: 'src/main.tsx',
            line: 3,
            column: 8,
            message: 'Type error remains',
            severity: 'error',
          },
        ],
      },
    } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    jest.spyOn(specializedAgents, 'executeWithSpecialists').mockResolvedValue({
      results: [],
      finalAnalysis: '',
      executedTools: [
        {
          toolCall: { name: 'write_file', arguments: { path: 'src/main.tsx' } },
          result: { action: 'write_file', path: 'src/main.tsx', success: true },
          specialist: 'javascript_specialist',
        },
      ],
      scaffoldApplied: false,
      scaffoldTemplateId: undefined,
      skippedGenerativePass: false,
    } as any);
    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('application');
    jest.spyOn(loop as any, 'verifyProject').mockResolvedValue({
      isComplete: true,
      missingFiles: [],
      errors: [],
      createdFiles: ['src/main.tsx'],
    });
    jest.spyOn(loop as any, 'buildResponse').mockReturnValue('route validation failed response');
    jest.spyOn(loop as any, 'finalizeProject').mockResolvedValue(undefined);
    jest.spyOn(ProjectRunner, 'autoRun').mockResolvedValue({
      success: true,
      validation: { issues: [] },
      installResult: null,
      buildResult: null,
      runResult: null,
    } as any);
    jest.spyOn(projectTester, 'testProjectInBrowser').mockResolvedValue({
      passed: true,
      score: 92,
      issues: [],
      suggestions: [],
      consoleErrors: [],
      consoleWarnings: [],
      testedElements: [],
    });

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 1,
      getOperations: () => [{ path: 'src/main.tsx' }],
    } as any);
    const commitSpy = jest.spyOn(transactionManager, 'commitTransaction').mockImplementation(() => undefined);
    const rollbackSpy = jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'recordFileChange').mockResolvedValue(undefined as any);
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    const result = await loop.run('Fix the remaining TypeScript error');

    expect(result).toContain('Validation failed');
    expect(rollbackSpy).toHaveBeenCalled();
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('falls back to deterministic scaffold review after scaffold-first create retries still fail', async () => {
    const workspacePath = createTempDir('agentprime-specialized-scaffold-fallback-');
    const loop = new SpecializedAgentLoop({ workspacePath, model: 'qwen-test' } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    const executeSpy = jest.spyOn(specializedAgents, 'executeWithSpecialists').mockResolvedValue({
      results: [],
      finalAnalysis: '',
      executedTools: [],
      scaffoldApplied: true,
      scaffoldTemplateId: 'threejs-platformer',
      skippedGenerativePass: false,
    } as any);

    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('threejs');
    jest.spyOn(loop as any, 'verifyProject').mockResolvedValue({
      isComplete: false,
      missingFiles: [],
      errors: ['[Build] src/game/Game.ts failed to compile'],
      createdFiles: [],
    });
    const fallbackReviewSpy = jest
      .spyOn(loop as any, 'runDeterministicScaffoldReview')
      .mockResolvedValue('fallback scaffold review');

    jest.spyOn(transactionManager, 'startTransaction')
      .mockReturnValueOnce({
        getOperationCount: () => 1,
        getOperations: () => [],
      } as any)
      .mockReturnValueOnce({
        getOperationCount: () => 1,
        getOperations: () => [],
      } as any);
    const rollbackSpy = jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'recordFileChange').mockResolvedValue(undefined as any);
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    const result = await loop.run('Build a three.js side scroller with WASD movement and jumping');

    expect(result).toBe('fallback scaffold review');
    expect(executeSpy).toHaveBeenCalled();
    expect(rollbackSpy).toHaveBeenCalled();
    expect(fallbackReviewSpy).toHaveBeenCalled();
  });

  it('does not fall back to deterministic scaffold review when VibeCoder repair policy blocks scaffold/create work', async () => {
    const workspacePath = createTempDir('agentprime-specialized-vibecoder-no-fallback-');
    const loop = new SpecializedAgentLoop({
      workspacePath,
      model: 'qwen-test',
      vibeCoderExecutionPolicy: resolveVibeCoderExecutionPolicy('vibecoder', 'Fix the broken three.js platformer build'),
    } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    jest.spyOn(specializedAgents, 'executeWithSpecialists').mockResolvedValue({
      results: [],
      finalAnalysis: '',
      executedTools: [],
      scaffoldApplied: false,
      scaffoldTemplateId: undefined,
      skippedGenerativePass: false,
    } as any);

    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('threejs');
    jest.spyOn(loop as any, 'verifyProject').mockResolvedValue({
      isComplete: false,
      missingFiles: [],
      errors: ['[Build] src/game/Game.ts failed to compile'],
      createdFiles: [],
    });
    jest.spyOn(loop as any, 'buildResponse').mockReturnValue('repair response without scaffold fallback');
    const fallbackReviewSpy = jest
      .spyOn(loop as any, 'runDeterministicScaffoldReview')
      .mockResolvedValue('fallback scaffold review');

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 1,
      getOperations: () => [],
    } as any);
    jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'recordFileChange').mockResolvedValue(undefined as any);
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    const result = await loop.run('Fix the broken three.js platformer build');

    expect(result).toBe('repair response without scaffold fallback');
    expect(fallbackReviewSpy).not.toHaveBeenCalled();
  });

  it('rolls back immediate-apply specialist changes when verification never passes', async () => {
    const workspacePath = createTempDir('agentprime-specialized-failed-apply-rollback-');
    const loop = new SpecializedAgentLoop({
      workspacePath,
      model: 'qwen-test',
      monolithicApplyImmediately: true,
    } as any);

    jest.spyOn(specializedAgents, 'routeToSpecialists').mockReturnValue(['javascript_specialist'] as any);
    jest.spyOn(specializedAgents, 'executeWithSpecialists').mockResolvedValue({
      results: [],
      finalAnalysis: '',
      executedTools: [],
      scaffoldApplied: false,
      scaffoldTemplateId: undefined,
      skippedGenerativePass: false,
    } as any);
    jest.spyOn(loop as any, 'getProjectFiles').mockReturnValue([]);
    jest.spyOn(loop as any, 'detectLanguage').mockReturnValue('typescript');
    jest.spyOn(loop as any, 'detectProjectType').mockReturnValue('application');
    jest.spyOn(loop as any, 'verifyProject').mockResolvedValue({
      isComplete: false,
      missingFiles: [],
      errors: ['Mixed frontend entrypoints detected'],
      createdFiles: ['src/main.tsx', 'src/main.js'],
    });

    jest.spyOn(transactionManager, 'startTransaction').mockReturnValue({
      getOperationCount: () => 2,
      getOperations: () => [],
    } as any);
    const commitSpy = jest.spyOn(transactionManager, 'commitTransaction').mockImplementation(() => undefined);
    const rollbackSpy = jest.spyOn(transactionManager, 'rollbackTransaction').mockResolvedValue(undefined);
    jest.spyOn(transactionManager, 'recordFileChange').mockResolvedValue(undefined as any);
    jest.spyOn(reviewSessionManager, 'createSessionFromOperations').mockReturnValue(null);
    jest.spyOn(telemetry, 'getTelemetryService').mockReturnValue({
      track: jest.fn(),
    } as any);

    const result = await loop.run('Build a website that must compile');

    expect(result).toContain('## ⚠️ Project Needs Fixes');
    expect(result).toContain('### ↩️ Changes Reverted');
    expect(result).toContain('Mixed frontend entrypoints detected');
    expect(rollbackSpy).toHaveBeenCalled();
    expect(commitSpy).not.toHaveBeenCalled();
  });
});
