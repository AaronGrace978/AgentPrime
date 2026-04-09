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
import { TimeoutError } from '../src/main/core/timeout-utils';

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
});
