/**
 * AgentPrime - AgentCoordinator Tests
 * Tests for the multi-agent coordination system
 */

const { AgentCoordinator } = require('../../src/main/core/agent-coordinator');
const { routeToSpecialists, executeWithSpecialists } = require('../../src/main/agent/specialized-agents');

// Mock dependencies
jest.mock('../../src/main/agent/specialized-agents');
jest.mock('../../src/main/mirror/mirror-singleton', () => ({
  getRelevantPatterns: jest.fn(),
  storeTaskLearning: jest.fn()
}));
jest.mock('../../src/main/core/transaction-manager', () => ({
  transactionManager: {
    beginTransaction: jest.fn().mockReturnValue('tx-123'),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn()
  }
}));

describe('AgentCoordinator', () => {
  let coordinator;
  let mockRouteToSpecialists;
  let mockExecuteWithSpecialists;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockRouteToSpecialists = jest.fn();
    mockExecuteWithSpecialists = jest.fn();

    routeToSpecialists.mockImplementation(mockRouteToSpecialists);
    executeWithSpecialists.mockImplementation(mockExecuteWithSpecialists);

    coordinator = new AgentCoordinator();
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      expect(coordinator.config.strategy).toBe('hybrid');
      expect(coordinator.config.maxParallelAgents).toBe(3);
      expect(coordinator.config.timeout).toBe(300000);
      expect(coordinator.config.retryOnFailure).toBe(true);
    });

    test('should accept custom config', () => {
      const customConfig = {
        strategy: 'sequential',
        maxParallelAgents: 5,
        timeout: 60000
      };
      const customCoordinator = new AgentCoordinator(customConfig);

      expect(customCoordinator.config.strategy).toBe('sequential');
      expect(customCoordinator.config.maxParallelAgents).toBe(5);
      expect(customCoordinator.config.timeout).toBe(60000);
    });
  });

  describe('orchestrateComplexTask', () => {
    const mockContext = {
      workspacePath: '/test/workspace',
      files: ['test.js', 'test.py'],
      language: 'javascript'
    };

    const mockTask = 'Create a React component with TypeScript support';

    test('should successfully orchestrate a simple task', async () => {
      mockRouteToSpecialists.mockResolvedValue({
        agents: ['frontend-agent', 'typescript-agent'],
        strategy: 'parallel'
      });

      mockExecuteWithSpecialists.mockResolvedValue({
        success: true,
        result: 'Component created successfully',
        subtasks: [
          { id: 'subtask-1', status: 'completed' },
          { id: 'subtask-2', status: 'completed' }
        ]
      });

      const result = await coordinator.orchestrateComplexTask(mockTask, mockContext);

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.outcome).toBeDefined();
      expect(mockRouteToSpecialists).toHaveBeenCalledWith(mockTask, mockContext);
      expect(mockExecuteWithSpecialists).toHaveBeenCalled();
    });

    test('should handle routing failures', async () => {
      mockRouteToSpecialists.mockRejectedValue(new Error('Routing failed'));

      const result = await coordinator.orchestrateComplexTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Routing failed');
    });

    test('should handle execution failures with retry', async () => {
      mockRouteToSpecialists.mockResolvedValue({
        agents: ['frontend-agent'],
        strategy: 'sequential'
      });

      mockExecuteWithSpecialists
        .mockRejectedValueOnce(new Error('Execution failed'))
        .mockResolvedValueOnce({
          success: true,
          result: 'Success on retry',
          subtasks: [{ id: 'subtask-1', status: 'completed' }]
        });

      const result = await coordinator.orchestrateComplexTask(mockTask, mockContext);

      expect(result.success).toBe(true);
      expect(mockExecuteWithSpecialists).toHaveBeenCalledTimes(2);
    });

    test('should respect timeout configuration', async () => {
      const timeoutCoordinator = new AgentCoordinator({ timeout: 100 });

      mockRouteToSpecialists.mockResolvedValue({
        agents: ['slow-agent'],
        strategy: 'sequential'
      });

      mockExecuteWithSpecialists.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      const result = await timeoutCoordinator.orchestrateComplexTask(mockTask, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should handle parallel execution strategy', async () => {
      mockRouteToSpecialists.mockResolvedValue({
        agents: ['agent1', 'agent2', 'agent3', 'agent4'],
        strategy: 'parallel'
      });

      mockExecuteWithSpecialists.mockResolvedValue({
        success: true,
        result: 'Parallel execution completed',
        subtasks: [
          { id: 'subtask-1', status: 'completed' },
          { id: 'subtask-2', status: 'completed' }
        ]
      });

      const result = await coordinator.orchestrateComplexTask(mockTask, mockContext);

      expect(result.success).toBe(true);
      expect(mockExecuteWithSpecialists).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ strategy: 'parallel' })
      );
    });
  });

  describe('Task History', () => {
    test('should maintain task history', async () => {
      mockRouteToSpecialists.mockResolvedValue({
        agents: ['test-agent'],
        strategy: 'sequential'
      });

      mockExecuteWithSpecialists.mockResolvedValue({
        success: true,
        result: 'Task completed',
        subtasks: [{ id: 'subtask-1', status: 'completed' }]
      });

      await coordinator.orchestrateComplexTask('Task 1', { workspacePath: '/test' });
      await coordinator.orchestrateComplexTask('Task 2', { workspacePath: '/test' });

      expect(coordinator.taskHistory).toHaveLength(2);
      expect(coordinator.taskHistory[0].task).toBe('Task 1');
      expect(coordinator.taskHistory[1].task).toBe('Task 2');
    });

    test('should include failure outcomes in history', async () => {
      mockRouteToSpecialists.mockRejectedValue(new Error('Routing failed'));

      await coordinator.orchestrateComplexTask('Failed Task', { workspacePath: '/test' });

      expect(coordinator.taskHistory).toHaveLength(1);
      expect(coordinator.taskHistory[0].success).toBe(false);
      expect(coordinator.taskHistory[0].error).toContain('Routing failed');
    });
  });

  describe('Active Tasks Management', () => {
    test('should track active tasks', async () => {
      mockRouteToSpecialists.mockResolvedValue({
        agents: ['test-agent'],
        strategy: 'sequential'
      });

      mockExecuteWithSpecialists.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          result: 'Completed',
          subtasks: [{ id: 'subtask-1', status: 'completed' }]
        }), 10))
      );

      const taskPromise = coordinator.orchestrateComplexTask('Test Task', { workspacePath: '/test' });

      expect(coordinator.activeTasks.size).toBe(1);

      await taskPromise;

      expect(coordinator.activeTasks.size).toBe(0);
    });
  });

  describe('Conflict Resolution', () => {
    test('should handle agent conflicts', async () => {
      mockRouteToSpecialists.mockResolvedValue({
        agents: ['agent1', 'agent2'],
        strategy: 'parallel',
        conflicts: [{
          type: 'resource_conflict',
          agents: ['agent1', 'agent2'],
          resource: 'file.txt'
        }]
      });

      mockExecuteWithSpecialists.mockResolvedValue({
        success: true,
        result: 'Conflict resolved',
        subtasks: [{ id: 'subtask-1', status: 'completed' }],
        conflictsResolved: 1
      });

      const result = await coordinator.orchestrateComplexTask('Conflicting Task', {
        workspacePath: '/test'
      });

      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(1);
    });
  });
});
