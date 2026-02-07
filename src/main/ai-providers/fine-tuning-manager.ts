/**
 * Fine-tuning Manager - Proprietary Model Training
 * 
 * Manages the entire fine-tuning lifecycle:
 * - Training data collection
 * - Model fine-tuning
 * - Deployment and monitoring
 * - Performance evaluation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface TrainingInteraction {
  id?: string;
  prompt: string;
  completion: string;
  accepted: boolean;
  feedback?: string;
  category?: string;
  teamId?: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface FineTuningJob {
  id: string;
  provider: string;
  baseModel: string;
  trainingData: string;
  modelId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  hyperparameters?: {
    epochs?: number;
    batchSize?: number;
    learningRate?: number;
  };
  createdAt: number;
  completedAt?: number;
}

export interface ModelDeployment {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  endpoint?: string;
  active: boolean;
  deployedAt: number;
}

export interface ModelEvaluation {
  modelId: string;
  accuracy?: number;
  perplexity?: number;
  latency?: number;
  score: number;
  timestamp: number;
}

export class FineTuningManager {
  private trainingData: Map<string, TrainingInteraction> = new Map();
  private jobs: Map<string, FineTuningJob> = new Map();
  private deployments: Map<string, ModelDeployment> = new Map();
  private evaluations: Map<string, ModelEvaluation[]> = new Map();
  private costs: Map<string, number> = new Map();
  private dataDir: string;

  constructor(dataDir: string = './data/fine-tuning') {
    this.dataDir = dataDir;
    this.ensureDataDir();
    this.loadData();
  }

  /**
   * Record a training interaction
   */
  async recordInteraction(interaction: TrainingInteraction): Promise<string> {
    const id = interaction.id || this.generateId();
    const data: TrainingInteraction = {
      ...interaction,
      id,
      timestamp: interaction.timestamp || Date.now()
    };

    this.trainingData.set(id, data);
    await this.saveData();

    return id;
  }

  /**
   * Get all training data
   */
  async getTrainingData(): Promise<TrainingInteraction[]> {
    return Array.from(this.trainingData.values());
  }

  /**
   * Get quality-filtered training data
   */
  async getQualityFilteredData(): Promise<TrainingInteraction[]> {
    return Array.from(this.trainingData.values())
      .filter(d => d.accepted && d.feedback !== 'rejected');
  }

  /**
   * Get deduplicated training data
   */
  async getDeduplicatedData(): Promise<TrainingInteraction[]> {
    const seen = new Set<string>();
    const deduped: TrainingInteraction[] = [];

    for (const data of this.trainingData.values()) {
      const key = `${data.prompt}:${data.completion}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(data);
      }
    }

    return deduped;
  }

  /**
   * Get balanced dataset
   */
  async getBalancedDataset(): Promise<TrainingInteraction[]> {
    const byCategory = new Map<string, TrainingInteraction[]>();

    // Group by category
    for (const data of this.trainingData.values()) {
      const category = data.category || 'general';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(data);
    }

    // Find minimum count
    let minCount = Infinity;
    for (const items of byCategory.values()) {
      minCount = Math.min(minCount, items.length);
    }

    // Balance by sampling
    const balanced: TrainingInteraction[] = [];
    for (const items of byCategory.values()) {
      const sampled = this.sampleArray(items, minCount);
      balanced.push(...sampled);
    }

    return balanced;
  }

  /**
   * Get team training data
   */
  async getTeamTrainingData(teamId: string): Promise<TrainingInteraction[]> {
    return Array.from(this.trainingData.values())
      .filter(d => d.teamId === teamId);
  }

  /**
   * Prepare training data in provider format
   */
  async prepareTrainingData(provider: string): Promise<any> {
    const data = await this.getQualityFilteredData();

    if (provider === 'openai') {
      return {
        messages: data.map(d => ({
          messages: [
            { role: 'user', content: d.prompt },
            { role: 'assistant', content: d.completion }
          ]
        }))
      };
    }

    // Add other provider formats as needed
    return data;
  }

  /**
   * Split dataset into train/validation
   */
  async splitDataset(trainRatio: number = 0.8): Promise<{
    train: TrainingInteraction[];
    validation: TrainingInteraction[];
  }> {
    const data = await this.getDeduplicatedData();
    const shuffled = this.shuffleArray(data);
    const splitIndex = Math.floor(data.length * trainRatio);

    return {
      train: shuffled.slice(0, splitIndex),
      validation: shuffled.slice(splitIndex)
    };
  }

  /**
   * Start fine-tuning job
   */
  async startFineTuning(config: {
    provider: string;
    baseModel: string;
    trainingData: string;
    hyperparameters?: FineTuningJob['hyperparameters'];
  }): Promise<FineTuningJob> {
    const job: FineTuningJob = {
      id: this.generateId(),
      provider: config.provider,
      baseModel: config.baseModel,
      trainingData: config.trainingData,
      status: 'pending',
      hyperparameters: config.hyperparameters,
      createdAt: Date.now()
    };

    this.jobs.set(job.id, job);
    await this.saveData();

    // In production, this would call the provider's API
    // For now, simulate the job
    this.simulateFineTuning(job.id);

    return job;
  }

  /**
   * Get fine-tuning status
   */
  async getFineTuningStatus(jobId: string): Promise<FineTuningJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    return job;
  }

  /**
   * Wait for fine-tuning completion
   */
  async waitForCompletion(jobId: string, timeout: number = 3600000): Promise<FineTuningJob> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const job = await this.getFineTuningStatus(jobId);
      
      if (job.status === 'completed') {
        return job;
      }
      
      if (job.status === 'failed') {
        throw new Error(`Fine-tuning failed: ${job.error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('Fine-tuning timeout');
  }

  /**
   * Deploy fine-tuned model
   */
  async deployModel(config: {
    modelId: string;
    name: string;
    provider?: string;
  }): Promise<ModelDeployment> {
    const deployment: ModelDeployment = {
      id: this.generateId(),
      modelId: config.modelId,
      name: config.name,
      provider: config.provider || 'openai',
      endpoint: `https://api.example.com/models/${config.modelId}`,
      active: true,
      deployedAt: Date.now()
    };

    this.deployments.set(deployment.id, deployment);
    await this.saveData();

    return deployment;
  }

  /**
   * Validate model before deployment
   */
  async validateModel(modelId: string, config: {
    testCases: Array<{ prompt: string; expectedQuality: number }>;
  }): Promise<{ passed: boolean; score: number }> {
    let totalScore = 0;
    
    for (const testCase of config.testCases) {
      // In production, this would call the model API
      // For now, simulate validation
      const score = Math.random() * 0.4 + 0.6; // 0.6-1.0
      totalScore += score;
    }
    
    const avgScore = totalScore / config.testCases.length;
    
    return {
      passed: avgScore >= 0.8,
      score: avgScore
    };
  }

  /**
   * Rollback deployment
   */
  async rollbackDeployment(deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (deployment) {
      deployment.active = false;
      await this.saveData();
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<ModelDeployment> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    return deployment;
  }

  /**
   * Evaluate model performance
   */
  async evaluateModel(modelId: string, config: {
    testSet: string;
    metrics: string[];
  }): Promise<ModelEvaluation> {
    // In production, this would run actual evaluation
    // For now, simulate metrics
    const evaluation: ModelEvaluation = {
      modelId,
      accuracy: config.metrics.includes('accuracy') ? Math.random() * 0.2 + 0.8 : undefined,
      perplexity: config.metrics.includes('perplexity') ? Math.random() * 10 + 5 : undefined,
      latency: config.metrics.includes('latency') ? Math.random() * 50 + 20 : undefined,
      score: Math.random() * 0.2 + 0.8,
      timestamp: Date.now()
    };

    if (!this.evaluations.has(modelId)) {
      this.evaluations.set(modelId, []);
    }
    this.evaluations.get(modelId)!.push(evaluation);

    return evaluation;
  }

  /**
   * Compare multiple models
   */
  async compareModels(modelIds: string[]): Promise<Array<{ modelId: string; score: number }>> {
    const results: Array<{ modelId: string; score: number }> = [];

    for (const modelId of modelIds) {
      const evaluation = await this.evaluateModel(modelId, {
        testSet: 'validation',
        metrics: ['accuracy', 'latency']
      });
      results.push({ modelId, score: evaluation.score });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Get model performance history
   */
  async getModelHistory(modelId: string): Promise<ModelEvaluation[]> {
    return this.evaluations.get(modelId) || [];
  }

  /**
   * Record model metrics
   */
  async recordModelMetrics(modelId: string, metrics: Partial<ModelEvaluation>): Promise<void> {
    const evaluation: ModelEvaluation = {
      modelId,
      ...metrics,
      score: metrics.score || 0,
      timestamp: Date.now()
    };

    if (!this.evaluations.has(modelId)) {
      this.evaluations.set(modelId, []);
    }
    this.evaluations.get(modelId)!.push(evaluation);
  }

  /**
   * Estimate fine-tuning cost
   */
  async estimateCost(config: {
    provider: string;
    baseModel: string;
    trainingExamples: number;
    epochs: number;
  }): Promise<number> {
    // Rough cost estimates (in USD)
    const costPerExample = 0.008; // OpenAI GPT-4 fine-tuning
    return config.trainingExamples * config.epochs * costPerExample;
  }

  /**
   * Record actual cost
   */
  async recordCost(jobId: string, cost: number): Promise<void> {
    this.costs.set(jobId, cost);
    await this.saveData();
  }

  /**
   * Get total costs
   */
  async getTotalCost(): Promise<number> {
    let total = 0;
    for (const cost of this.costs.values()) {
      total += cost;
    }
    return total;
  }

  /**
   * Anonymize sensitive data
   */
  async getAnonymizedData(): Promise<TrainingInteraction[]> {
    const data = await this.getTrainingData();
    
    return data.map(d => ({
      ...d,
      prompt: this.anonymizeText(d.prompt),
      completion: this.anonymizeText(d.completion)
    }));
  }

  /**
   * Delete training data
   */
  async deleteTrainingData(id: string): Promise<void> {
    this.trainingData.delete(id);
    await this.saveData();
  }

  /**
   * Export data for compliance
   */
  async exportData(format: 'json' | 'csv'): Promise<string> {
    const data = await this.getTrainingData();
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }
    
    // CSV format
    const headers = ['id', 'prompt', 'completion', 'accepted', 'timestamp'];
    const rows = data.map(d => [
      d.id,
      d.prompt,
      d.completion,
      d.accepted,
      d.timestamp
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Private helper methods
   */

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private sampleArray<T>(array: T[], count: number): T[] {
    const shuffled = this.shuffleArray(array);
    return shuffled.slice(0, count);
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private anonymizeText(text: string): string {
    // Simple anonymization - replace emails, IPs, etc.
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      const dataFile = path.join(this.dataDir, 'training-data.json');
      if (fs.existsSync(dataFile)) {
        const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        this.trainingData = new Map(Object.entries(data.trainingData || {}));
        this.jobs = new Map(Object.entries(data.jobs || {}));
        this.deployments = new Map(Object.entries(data.deployments || {}));
        this.costs = new Map(Object.entries(data.costs || {}));
      }
    } catch (error) {
      console.error('Failed to load fine-tuning data:', error);
    }
  }

  private async saveData(): Promise<void> {
    try {
      const dataFile = path.join(this.dataDir, 'training-data.json');
      const data = {
        trainingData: Object.fromEntries(this.trainingData),
        jobs: Object.fromEntries(this.jobs),
        deployments: Object.fromEntries(this.deployments),
        costs: Object.fromEntries(this.costs)
      };
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save fine-tuning data:', error);
    }
  }

  private simulateFineTuning(jobId: string): void {
    // Simulate fine-tuning progress
    setTimeout(() => {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'running';
        job.progress = 0;
      }
    }, 1000);

    setTimeout(() => {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.progress = 100;
        job.modelId = `ft-${this.generateId()}`;
        job.completedAt = Date.now();
        this.saveData();
      }
    }, 5000);
  }
}

// Singleton instance
let fineTuningManager: FineTuningManager | null = null;

export function getFineTuningManager(): FineTuningManager {
  if (!fineTuningManager) {
    fineTuningManager = new FineTuningManager();
  }
  return fineTuningManager;
}

