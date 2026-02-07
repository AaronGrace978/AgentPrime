/**
 * Fine-tuning Infrastructure Tests - Proprietary Models
 */

import { FineTuningManager } from '../../src/main/ai-providers/fine-tuning-manager';

describe('FineTuningManager', () => {
  let manager: FineTuningManager;

  beforeEach(() => {
    manager = new FineTuningManager();
  });

  describe('Training Data Management', () => {
    it('should collect training data from user interactions', async () => {
      await manager.recordInteraction({
        prompt: 'Write a React component',
        completion: 'const MyComponent = () => { return <div>Hello</div>; }',
        accepted: true,
        feedback: 'good'
      });
      
      const data = await manager.getTrainingData();
      expect(data).toHaveLength(1);
    });

    it('should filter low-quality training examples', async () => {
      await manager.recordInteraction({
        prompt: 'test',
        completion: 'bad output',
        accepted: false,
        feedback: 'rejected'
      });
      
      const filtered = await manager.getQualityFilteredData();
      expect(filtered).toHaveLength(0);
    });

    it('should deduplicate training examples', async () => {
      const example = {
        prompt: 'same prompt',
        completion: 'same completion',
        accepted: true
      };
      
      await manager.recordInteraction(example);
      await manager.recordInteraction(example);
      
      const deduped = await manager.getDeduplicatedData();
      expect(deduped).toHaveLength(1);
    });

    it('should balance training dataset', async () => {
      // Add many examples of one type
      for (let i = 0; i < 100; i++) {
        await manager.recordInteraction({
          prompt: 'JavaScript task',
          completion: 'JS code',
          accepted: true,
          category: 'javascript'
        });
      }
      
      // Add few of another
      for (let i = 0; i < 10; i++) {
        await manager.recordInteraction({
          prompt: 'Python task',
          completion: 'Python code',
          accepted: true,
          category: 'python'
        });
      }
      
      const balanced = await manager.getBalancedDataset();
      const jsCounts = balanced.filter(d => d.category === 'javascript').length;
      const pythonCounts = balanced.filter(d => d.category === 'python').length;
      
      expect(Math.abs(jsCounts - pythonCounts)).toBeLessThan(20);
    });
  });

  describe('Model Fine-tuning', () => {
    it('should prepare training data in correct format', async () => {
      await manager.recordInteraction({
        prompt: 'test prompt',
        completion: 'test completion',
        accepted: true
      });
      
      const formatted = await manager.prepareTrainingData('openai');
      expect(formatted).toHaveProperty('messages');
      expect(Array.isArray(formatted.messages)).toBe(true);
    });

    it('should split data into train/validation sets', async () => {
      for (let i = 0; i < 100; i++) {
        await manager.recordInteraction({
          prompt: `prompt ${i}`,
          completion: `completion ${i}`,
          accepted: true
        });
      }
      
      const split = await manager.splitDataset(0.8);
      expect(split.train.length).toBe(80);
      expect(split.validation.length).toBe(20);
    });

    it('should initiate fine-tuning job', async () => {
      const job = await manager.startFineTuning({
        provider: 'openai',
        baseModel: 'gpt-4',
        trainingData: 'training-data-id',
        hyperparameters: {
          epochs: 3,
          batchSize: 4,
          learningRate: 0.0001
        }
      });
      
      expect(job).toBeDefined();
      expect(job.id).toBeTruthy();
      expect(job.status).toBe('pending');
    });

    it('should monitor fine-tuning progress', async () => {
      const job = await manager.startFineTuning({
        provider: 'openai',
        baseModel: 'gpt-4',
        trainingData: 'training-data-id'
      });
      
      const status = await manager.getFineTuningStatus(job.id);
      expect(status).toBeDefined();
      expect(['pending', 'running', 'completed', 'failed']).toContain(status.status);
    });

    it('should handle fine-tuning failures gracefully', async () => {
      const job = await manager.startFineTuning({
        provider: 'invalid',
        baseModel: 'nonexistent',
        trainingData: 'bad-data'
      });
      
      await expect(manager.waitForCompletion(job.id)).rejects.toThrow();
    });
  });

  describe('Model Deployment', () => {
    it('should deploy fine-tuned model', async () => {
      const deployment = await manager.deployModel({
        modelId: 'ft-model-123',
        name: 'agentprime-completion-v1',
        provider: 'openai'
      });
      
      expect(deployment).toBeDefined();
      expect(deployment.endpoint).toBeTruthy();
    });

    it('should validate model before deployment', async () => {
      const validation = await manager.validateModel('ft-model-123', {
        testCases: [
          { prompt: 'test 1', expectedQuality: 0.8 },
          { prompt: 'test 2', expectedQuality: 0.8 }
        ]
      });
      
      expect(validation.passed).toBeDefined();
      expect(validation.score).toBeGreaterThan(0);
    });

    it('should rollback failed deployments', async () => {
      const deployment = await manager.deployModel({
        modelId: 'ft-model-bad',
        name: 'test-model'
      });
      
      await manager.rollbackDeployment(deployment.id);
      const status = await manager.getDeploymentStatus(deployment.id);
      expect(status.active).toBe(false);
    });
  });

  describe('Model Evaluation', () => {
    it('should evaluate model performance', async () => {
      const evaluation = await manager.evaluateModel('ft-model-123', {
        testSet: 'validation-data-id',
        metrics: ['accuracy', 'perplexity', 'latency']
      });
      
      expect(evaluation).toHaveProperty('accuracy');
      expect(evaluation).toHaveProperty('perplexity');
      expect(evaluation).toHaveProperty('latency');
    });

    it('should compare models', async () => {
      const comparison = await manager.compareModels([
        'base-model',
        'ft-model-v1',
        'ft-model-v2'
      ]);
      
      expect(comparison).toHaveLength(3);
      expect(comparison[0]).toHaveProperty('modelId');
      expect(comparison[0]).toHaveProperty('score');
    });

    it('should track model performance over time', async () => {
      await manager.recordModelMetrics('ft-model-123', {
        accuracy: 0.95,
        latency: 45,
        throughput: 100
      });
      
      const history = await manager.getModelHistory('ft-model-123');
      expect(history).toHaveLength(1);
    });
  });

  describe('Cost Management', () => {
    it('should estimate fine-tuning cost', async () => {
      const cost = await manager.estimateCost({
        provider: 'openai',
        baseModel: 'gpt-4',
        trainingExamples: 1000,
        epochs: 3
      });
      
      expect(cost).toBeGreaterThan(0);
    });

    it('should track actual fine-tuning costs', async () => {
      const job = await manager.startFineTuning({
        provider: 'openai',
        baseModel: 'gpt-4',
        trainingData: 'data-id'
      });
      
      await manager.recordCost(job.id, 50.00);
      const totalCost = await manager.getTotalCost();
      expect(totalCost).toBeGreaterThanOrEqual(50.00);
    });
  });

  describe('Data Privacy', () => {
    it('should anonymize sensitive training data', async () => {
      await manager.recordInteraction({
        prompt: 'User email: user@example.com',
        completion: 'Processed email',
        accepted: true
      });
      
      const anonymized = await manager.getAnonymizedData();
      expect(anonymized[0].prompt).not.toContain('user@example.com');
    });

    it('should allow data deletion', async () => {
      const id = await manager.recordInteraction({
        prompt: 'test',
        completion: 'test',
        accepted: true
      });
      
      await manager.deleteTrainingData(id);
      const data = await manager.getTrainingData();
      expect(data.find(d => d.id === id)).toBeUndefined();
    });

    it('should export training data for compliance', async () => {
      await manager.recordInteraction({
        prompt: 'test',
        completion: 'test',
        accepted: true
      });
      
      const exported = await manager.exportData('json');
      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
    });
  });
});

