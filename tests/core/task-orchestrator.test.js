/**
 * AgentPrime - TaskOrchestrator Tests
 * Tests for task decomposition and sequencing
 */

const { TaskOrchestrator } = require('../../src/main/core/task-orchestrator');
const { getCodebaseEmbeddings } = require('../../src/main/core/codebase-embeddings');

// Mock dependencies
jest.mock('../../src/main/core/agent-coordinator', () => ({
  getAgentCoordinator: jest.fn(() => ({
    orchestrateComplexTask: jest.fn()
  }))
}));

jest.mock('../../src/main/mirror/mirror-singleton', () => ({
  getRelevantPatterns: jest.fn()
}));

jest.mock('../../src/main/core/codebase-embeddings', () => ({
  getCodebaseEmbeddings: jest.fn()
}));

describe.skip('TaskOrchestrator', () => {
  let orchestrator;
  let mockCoordinator;
  let mockGetRelevantPatterns;
  let mockGetCodebaseEmbeddings;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCoordinator = {
      orchestrateComplexTask: jest.fn()
    };

    mockGetRelevantPatterns = jest.fn();
    mockGetCodebaseEmbeddings = jest.fn();

    // Setup mock implementations
    require('../../src/main/core/agent-coordinator').getAgentCoordinator.mockReturnValue(mockCoordinator);
    require('../../src/main/mirror/mirror-singleton').getRelevantPatterns = mockGetRelevantPatterns;
    require('../../src/main/core/codebase-embeddings').getCodebaseEmbeddings = mockGetCodebaseEmbeddings;

    orchestrator = new TaskOrchestrator();
  });

  describe('decomposeTask', () => {
    const mockContext = {
      workspacePath: '/test/workspace',
      files: ['src/app.js', 'src/utils.js'],
      language: 'javascript'
    };

    test('should decompose a simple task into subtasks', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const result = await orchestrator.decomposeTask('Create a login form', mockContext);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.subtasks).toBeInstanceOf(Array);
      expect(result.subtasks.length).toBeGreaterThan(0);
      expect(result.executionStrategy).toBeDefined();
    });

    test('should handle complex multi-step tasks', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const complexTask = 'Build a complete user authentication system with registration, login, and password reset';
      const result = await orchestrator.decomposeTask(complexTask, mockContext);

      expect(result.subtasks.length).toBeGreaterThan(2);
      expect(result.executionStrategy).toBe('hybrid');
    });

    test('should use codebase patterns for task decomposition', async () => {
      const mockPatterns = [
        {
          id: 'auth-pattern',
          characteristics: { complexity: 'high', domain: 'authentication' },
          examples: ['implement login', 'create user registration']
        }
      ];

      mockGetRelevantPatterns.mockResolvedValue(mockPatterns);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const result = await orchestrator.decomposeTask('Implement user login', mockContext);

      expect(mockGetRelevantPatterns).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'Implement user login',
          context: mockContext
        })
      );
      expect(result.subtasks).toBeDefined();
    });

    test('should create dependency chains for complex tasks', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const result = await orchestrator.decomposeTask(
        'Create a full-stack app with database, API, and frontend',
        mockContext
      );

      expect(result.dependencies).toBeDefined();
      expect(result.dependencies.length).toBeGreaterThan(0);

      // Check that dependencies form a valid chain
      const dependencyMap = new Map();
      result.dependencies.forEach(dep => {
        dependencyMap.set(dep.from, dep.to);
      });

      expect(dependencyMap.size).toBe(result.dependencies.length);
    });

    test('should estimate task duration', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const result = await orchestrator.decomposeTask('Simple task', mockContext);

      expect(result.estimatedDuration).toBeDefined();
      expect(typeof result.estimatedDuration).toBe('number');
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    test('should handle different programming languages', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const pythonContext = { ...mockContext, language: 'python' };
      const result = await orchestrator.decomposeTask('Create a data processor', pythonContext);

      expect(result.subtasks.some(subtask =>
        subtask.description.toLowerCase().includes('python') ||
        subtask.agent.toLowerCase().includes('python')
      )).toBe(true);
    });
  });

  describe('executeTaskPlan', () => {
    test('should execute a task plan using the coordinator', async () => {
      const mockTaskPlan = {
        id: 'plan-123',
        originalTask: 'Test task',
        subtasks: [
          { id: 'sub1', description: 'First step', agent: 'agent1' },
          { id: 'sub2', description: 'Second step', agent: 'agent2' }
        ],
        executionStrategy: 'sequential',
        dependencies: [],
        sharedContext: {},
        estimatedDuration: 5000
      };

      mockCoordinator.orchestrateComplexTask.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        outcome: { result: 'Task completed' }
      });

      const result = await orchestrator.executeTaskPlan(mockTaskPlan);

      expect(mockCoordinator.orchestrateComplexTask).toHaveBeenCalledWith(
        mockTaskPlan.originalTask,
        expect.objectContaining({
          subtasks: mockTaskPlan.subtasks,
          strategy: mockTaskPlan.executionStrategy,
          dependencies: mockTaskPlan.dependencies
        })
      );
      expect(result.success).toBe(true);
    });

    test('should handle execution failures', async () => {
      const mockTaskPlan = {
        id: 'plan-fail',
        originalTask: 'Failing task',
        subtasks: [{ id: 'sub1', description: 'Fail step', agent: 'agent1' }],
        executionStrategy: 'sequential',
        dependencies: [],
        sharedContext: {},
        estimatedDuration: 1000
      };

      mockCoordinator.orchestrateComplexTask.mockRejectedValue(
        new Error('Execution failed')
      );

      const result = await orchestrator.executeTaskPlan(mockTaskPlan);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution failed');
    });
  });

  describe('Task Plan Management', () => {
    test('should store and retrieve task plans', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const taskPlan = await orchestrator.decomposeTask('Test task', {
        workspacePath: '/test'
      });

      expect(orchestrator.plans.has(taskPlan.id)).toBe(true);
      expect(orchestrator.plans.get(taskPlan.id)).toBe(taskPlan);
    });

    test('should generate unique plan IDs', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const plan1 = await orchestrator.decomposeTask('Task 1', { workspacePath: '/test' });
      const plan2 = await orchestrator.decomposeTask('Task 2', { workspacePath: '/test' });

      expect(plan1.id).not.toBe(plan2.id);
      expect(orchestrator.plans.size).toBe(2);
    });
  });

  describe('Shared Context Management', () => {
    test('should maintain shared context across subtasks', async () => {
      const mockTaskPlan = {
        id: 'plan-context',
        originalTask: 'Context sharing task',
        subtasks: [
          { id: 'sub1', description: 'Setup context', agent: 'agent1' },
          { id: 'sub2', description: 'Use context', agent: 'agent2' }
        ],
        executionStrategy: 'sequential',
        dependencies: [{ from: 'sub1', to: 'sub2', type: 'data' }],
        sharedContext: { initialData: 'test' },
        estimatedDuration: 2000
      };

      mockCoordinator.orchestrateComplexTask.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        outcome: {
          result: 'Task completed',
          sharedContext: { initialData: 'test', processedData: 'result' }
        }
      });

      await orchestrator.executeTaskPlan(mockTaskPlan);

      expect(mockCoordinator.orchestrateComplexTask).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sharedContext: { initialData: 'test' }
        })
      );
    });
  });

  describe('Dependency Resolution', () => {
    test('should validate dependency chains', async () => {
      mockGetRelevantPatterns.mockResolvedValue([]);
      mockGetCodebaseEmbeddings.mockResolvedValue({
        findSimilar: jest.fn().mockResolvedValue([])
      });

      const result = await orchestrator.decomposeTask(
        'Create API, then frontend, then tests',
        { workspacePath: '/test', language: 'javascript' }
      );

      // Check for valid dependency structure
      const depMap = new Map();
      result.dependencies.forEach(dep => {
        if (dep.type === 'hard') {
          depMap.set(dep.from, dep.to);
        }
      });

      // Ensure no circular dependencies
      const visited = new Set();
      const visiting = new Set();

      const hasCycle = (node) => {
        if (visiting.has(node)) return true;
        if (visited.has(node)) return false;

        visiting.add(node);
        if (depMap.has(node)) {
          if (hasCycle(depMap.get(node))) return true;
        }
        visiting.delete(node);
        visited.add(node);
        return false;
      };

      for (const [from] of depMap) {
        if (hasCycle(from)) {
          fail('Circular dependency detected');
        }
      }
    });

    test('should handle data dependencies', async () => {
      const mockTaskPlan = {
        id: 'plan-data-dep',
        originalTask: 'Data flow task',
        subtasks: [
          { id: 'generate-data', description: 'Generate data', agent: 'data-agent' },
          { id: 'process-data', description: 'Process data', agent: 'processor-agent' }
        ],
        executionStrategy: 'sequential',
        dependencies: [{
          from: 'generate-data',
          to: 'process-data',
          type: 'data',
          description: 'Pass generated data to processor'
        }],
        sharedContext: {},
        estimatedDuration: 3000
      };

      mockCoordinator.orchestrateComplexTask.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        outcome: { result: 'Data processed successfully' }
      });

      const result = await orchestrator.executeTaskPlan(mockTaskPlan);

      expect(result.success).toBe(true);
      expect(mockCoordinator.orchestrateComplexTask).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dependencies: expect.arrayContaining([
            expect.objectContaining({
              type: 'data',
              description: expect.stringContaining('data')
            })
          ])
        })
      );
    });
  });
});
