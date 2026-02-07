/**
 * Phase 3 Integration Tests - End-to-end workflows
 */

import { CollaborationEngine } from '../../src/main/core/collaboration-engine';
import { PerformanceTracker } from '../../src/main/core/performance-tracker';
import { FineTuningManager } from '../../src/main/ai-providers/fine-tuning-manager';
import { EnhancedModelRouter } from '../../src/main/core/enhanced-model-router';

describe('Phase 3 Integration Tests', () => {
  describe('Real-time Collaboration with Performance Monitoring', () => {
    it('should maintain <50ms P95 latency during collaboration', async () => {
      const collab = new CollaborationEngine({ enableRealTimeSync: true });
      const perf = new PerformanceTracker();
      
      const session = await collab.createSession('Test', '/workspace', 'user1');
      await collab.joinSession(session.id, 'user2', 'User 2');
      
      // Grant edit permission
      session.permissions.canEdit.push('user2');
      
      // Simulate rapid changes
      for (let i = 0; i < 100; i++) {
        const start = Date.now();
        await collab.recordChange(session.id, 'user1', {
          filePath: '/test.ts',
          changeType: 'insert',
          position: { line: i, column: 0 },
          content: `line ${i}`
        });
        const latency = Date.now() - start;
        perf.recordLatency('collab-change', latency);
      }
      
      const p95 = perf.getPercentile('collab-change', 95);
      expect(p95).toBeLessThan(50);
    });

    it('should handle concurrent edits efficiently', async () => {
      const collab = new CollaborationEngine({ enableRealTimeSync: true });
      const perf = new PerformanceTracker();
      
      const session = await collab.createSession('Test', '/workspace', 'user1');
      await collab.joinSession(session.id, 'user2', 'User 2');
      session.permissions.canEdit.push('user2');
      
      // Simulate concurrent edits
      const promises = [];
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        const p1 = collab.recordChange(session.id, 'user1', {
          filePath: '/test.ts',
          changeType: 'insert',
          position: { line: i * 2, column: 0 },
          content: `user1 line ${i}`
        }).then(() => {
          perf.recordLatency('concurrent-edit', Date.now() - start);
        });
        
        const p2 = collab.recordChange(session.id, 'user2', {
          filePath: '/test.ts',
          changeType: 'insert',
          position: { line: i * 2 + 1, column: 0 },
          content: `user2 line ${i}`
        }).then(() => {
          perf.recordLatency('concurrent-edit', Date.now() - start);
        });
        
        promises.push(p1, p2);
      }
      
      await Promise.all(promises);
      
      const p95 = perf.getPercentile('concurrent-edit', 95);
      expect(p95).toBeLessThan(100); // Allow slightly higher for concurrent
    });
  });

  describe('Fine-tuned Model Performance', () => {
    it('should use fine-tuned model with low latency', async () => {
      const router = new EnhancedModelRouter();
      const perf = new PerformanceTracker();
      const fineTune = new FineTuningManager();
      
      // Simulate deployed fine-tuned model
      await fineTune.deployModel({
        modelId: 'ft-agentprime-v1',
        name: 'agentprime-completion',
        provider: 'openai'
      });
      
      // Test completion with performance tracking
      for (let i = 0; i < 100; i++) {
        const start = Date.now();
        await router.selectModel('test completion prompt', 'completion', {
          preferredModel: 'ft-agentprime-v1'
        });
        const latency = Date.now() - start;
        perf.recordLatency('ft-model-completion', latency);
      }
      
      const p95 = perf.getPercentile('ft-model-completion', 95);
      expect(p95).toBeLessThan(50);
    });

    it('should improve accuracy with fine-tuned model', async () => {
      const fineTune = new FineTuningManager();
      
      // Record training data
      const trainingExamples = [
        { prompt: 'Create React component', completion: 'const Component = () => {...}', accepted: true },
        { prompt: 'Add TypeScript types', completion: 'interface Props {...}', accepted: true },
        { prompt: 'Implement hook', completion: 'const useCustom = () => {...}', accepted: true }
      ];
      
      for (const example of trainingExamples) {
        await fineTune.recordInteraction(example);
      }
      
      // Fine-tune model
      const job = await fineTune.startFineTuning({
        provider: 'openai',
        baseModel: 'gpt-4',
        trainingData: 'test-data'
      });
      
      // Evaluate
      const evaluation = await fineTune.evaluateModel(job.modelId, {
        testSet: 'validation-data',
        metrics: ['accuracy']
      });
      
      expect(evaluation.accuracy).toBeGreaterThan(0.9);
    });
  });

  describe('Collaborative Fine-tuning', () => {
    it('should collect team training data during collaboration', async () => {
      const collab = new CollaborationEngine({ enableRealTimeSync: true });
      const fineTune = new FineTuningManager();
      
      const session = await collab.createSession('Team Session', '/workspace', 'user1');
      await collab.joinSession(session.id, 'user2', 'User 2');
      
      // Simulate AI-assisted edits that get accepted
      const change = await collab.recordChange(session.id, 'user1', {
        filePath: '/test.ts',
        changeType: 'insert',
        position: { line: 1, column: 0 },
        content: 'const aiGenerated = () => { return "AI code"; }',
        metadata: {
          aiGenerated: true,
          prompt: 'Create a function that returns AI code'
        }
      });
      
      // Record as training data
      if (change.metadata?.aiGenerated) {
        await fineTune.recordInteraction({
          prompt: change.metadata.prompt,
          completion: change.content,
          accepted: true,
          teamId: session.id
        });
      }
      
      const teamData = await fineTune.getTeamTrainingData(session.id);
      expect(teamData).toHaveLength(1);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with multiple concurrent sessions', async () => {
      const collab = new CollaborationEngine({ enableRealTimeSync: true });
      const perf = new PerformanceTracker();
      
      // Create 10 concurrent sessions
      const sessions = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          collab.createSession(`Session ${i}`, '/workspace', `user${i}`)
        )
      );
      
      // Simulate activity in all sessions
      const promises = sessions.map(async (session, i) => {
        for (let j = 0; j < 10; j++) {
          const start = Date.now();
          await collab.recordChange(session.id, `user${i}`, {
            filePath: '/test.ts',
            changeType: 'insert',
            position: { line: j, column: 0 },
            content: `line ${j}`
          });
          perf.recordLatency('multi-session', Date.now() - start);
        }
      });
      
      await Promise.all(promises);
      
      const p95 = perf.getPercentile('multi-session', 95);
      expect(p95).toBeLessThan(100);
    });

    it('should handle high-frequency fine-tuning data collection', async () => {
      const fineTune = new FineTuningManager();
      const perf = new PerformanceTracker();
      
      // Simulate rapid data collection
      for (let i = 0; i < 1000; i++) {
        const start = Date.now();
        await fineTune.recordInteraction({
          prompt: `prompt ${i}`,
          completion: `completion ${i}`,
          accepted: true
        });
        perf.recordLatency('data-collection', Date.now() - start);
      }
      
      const p95 = perf.getPercentile('data-collection', 95);
      expect(p95).toBeLessThan(50);
    });
  });

  describe('End-to-end Workflow', () => {
    it('should complete full Phase 3 workflow', async () => {
      const collab = new CollaborationEngine({ enableRealTimeSync: true });
      const router = new EnhancedModelRouter();
      const fineTune = new FineTuningManager();
      const perf = new PerformanceTracker();
      
      // 1. Create collaboration session
      const session = await collab.createSession('E2E Test', '/workspace', 'user1');
      await collab.joinSession(session.id, 'user2', 'User 2');
      
      // 2. Perform AI-assisted edits with performance tracking
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        
        // Get AI completion
        const model = await router.selectModel('write code', 'completion');
        
        // Apply change
        await collab.recordChange(session.id, 'user1', {
          filePath: '/test.ts',
          changeType: 'insert',
          position: { line: i, column: 0 },
          content: `// AI generated line ${i}`,
          metadata: { aiGenerated: true, model: model.model }
        });
        
        perf.recordLatency('e2e-workflow', Date.now() - start);
      }
      
      // 3. Collect training data
      const changes = collab.getPendingChanges(session.id);
      for (const change of changes) {
        if (change.metadata?.aiGenerated) {
          await fineTune.recordInteraction({
            prompt: 'write code',
            completion: change.content,
            accepted: true
          });
        }
      }
      
      // 4. Verify performance
      const p95 = perf.getPercentile('e2e-workflow', 95);
      expect(p95).toBeLessThan(100);
      
      // 5. Verify data collection
      const trainingData = await fineTune.getTrainingData();
      expect(trainingData.length).toBeGreaterThan(0);
    });
  });
});

