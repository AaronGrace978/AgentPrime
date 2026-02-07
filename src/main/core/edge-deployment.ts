/**
 * AgentPrime - Edge Deployment
 * Local AI model deployment and management
 */

import type {
  AIModel,
  ModelDeployment,
  InferenceRequest,
  InferenceResponse,
  ModelOptimization,
  EdgeDeploymentConfig,
  ModelDownload,
  HardwareProfile,
  EdgeDeploymentEvent,
  ModelRegistry,
  ModelEndpoint,
  DeploymentMetrics
} from '../../types/edge-deployment';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';
import * as child_process from 'child_process';

// Runtime detection for local inference backends
interface LocalInferenceBackend {
  name: 'llama.cpp' | 'ollama' | 'onnx' | 'none';
  available: boolean;
  path?: string;
  version?: string;
}

// Active model process (for llama.cpp server mode)
interface ModelProcess {
  modelId: string;
  process: child_process.ChildProcess;
  port: number;
  pid: number;
}

export class EdgeDeploymentManager extends EventEmitter {
  private config: EdgeDeploymentConfig;
  private registry: ModelRegistry;
  private downloads: Map<string, ModelDownload> = new Map();
  private optimizations: Map<string, ModelOptimization> = new Map();
  private hardwareProfile: HardwareProfile;
  private inferenceQueue: InferenceRequest[] = [];
  private activeInferences: Map<string, InferenceRequest> = new Map();

  private monitoringTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private inferenceBackend: LocalInferenceBackend = { name: 'none', available: false };
  private modelProcesses: Map<string, ModelProcess> = new Map();

  constructor(config?: Partial<EdgeDeploymentConfig>) {
    super();

    this.config = {
      enabled: true,
      modelsDir: path.join(process.cwd(), 'models'),
      deploymentsDir: path.join(process.cwd(), 'deployments'),
      maxConcurrentModels: 3,
      defaultDevice: 'auto',
      downloadTimeout: 3600000, // 1 hour
      loadTimeout: 300000, // 5 minutes
      inferenceTimeout: 30000, // 30 seconds
      cacheEnabled: true,
      autoOptimize: true,
      monitoringEnabled: true,
      ...config
    };

    this.hardwareProfile = this.detectHardware();
    this.registry = {
      models: new Map(),
      deployments: new Map(),
      endpoints: new Map()
    };

    // Ensure directories exist
    fs.mkdirSync(this.config.modelsDir, { recursive: true });
    fs.mkdirSync(this.config.deploymentsDir, { recursive: true });

    if (this.config.enabled) {
      this.startMonitoring();
      this.startCleanup();
      this.detectHardware();
    }
  }

  /**
   * Download and register a model
   */
  async downloadModel(modelId: string, source?: string): Promise<ModelDownload> {
    // Get model info from registry or source
    const model = await this.getModelInfo(modelId, source);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Check if already downloaded
    const localPath = path.join(this.config.modelsDir, modelId);
    if (fs.existsSync(localPath)) {
      throw new Error(`Model ${modelId} already exists locally`);
    }

    const download: ModelDownload = {
      id: crypto.randomUUID(),
      modelId,
      url: model.metadata.source,
      status: 'pending',
      progress: 0,
      speed: 0,
      totalSize: model.size,
      downloadedSize: 0,
      startedAt: Date.now()
    };

    this.downloads.set(download.id, download);

    try {
      await this.performDownload(download, localPath);
      download.status = 'completed';
      download.completedAt = Date.now();

      // Register model
      this.registry.models.set(modelId, model);

      this.emitEvent('model_downloaded', { model, download });

    } catch (error: any) {
      download.status = 'failed';
      download.error = error.message;
      throw error;
    }

    return download;
  }

  /**
   * Deploy a model locally
   */
  async deployModel(modelId: string, config?: Partial<ModelDeployment['config']>): Promise<ModelDeployment> {
    const model = this.registry.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found. Download it first.`);
    }

    // Check deployment limits
    const activeDeployments = Array.from(this.registry.deployments.values())
      .filter(d => d.status === 'running');

    if (activeDeployments.length >= this.config.maxConcurrentModels) {
      throw new Error('Maximum concurrent deployments reached');
    }

    // Check hardware compatibility
    if (!this.isModelCompatible(model)) {
      throw new Error(`Model ${modelId} is not compatible with current hardware`);
    }

    const deploymentId = crypto.randomUUID();
    const port = await this.findAvailablePort(8000);

    const deployment: ModelDeployment = {
      id: deploymentId,
      modelId,
      instanceId: crypto.randomUUID(),
      status: 'loading',
      endpoint: `http://localhost:${port}`,
      port,
      startedAt: Date.now(),
      metrics: {
        requestsProcessed: 0,
        totalTokens: 0,
        averageLatency: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        uptime: 0,
        errorRate: 0,
        throughput: 0
      },
      config: {
        device: this.config.defaultDevice,
        precision: 'fp16',
        maxBatchSize: 1,
        maxSequenceLength: 2048,
        cacheSize: 512,
        threads: Math.max(1, os.cpus().length - 1),
        contextWindow: 2048,
        temperature: 0.7,
        topP: 0.9,
        repetitionPenalty: 1.1,
        ...config
      }
    };

    this.registry.deployments.set(deploymentId, deployment);

    try {
      await this.startModelProcess(deployment);
      deployment.status = 'ready';

      // Create endpoint
      const endpoint: ModelEndpoint = {
        id: crypto.randomUUID(),
        modelId,
        deploymentId,
        url: deployment.endpoint,
        status: 'active',
        lastUsed: Date.now(),
        usage: {
          totalRequests: 0,
          totalTokens: 0,
          averageLatency: 0,
          errorCount: 0,
          uptime: 0
        }
      };

      this.registry.endpoints.set(endpoint.id, endpoint);

      this.emitEvent('deployment_started', { model, deployment, endpoint });

    } catch (error: any) {
      deployment.status = 'error';
      deployment.error = error.message;
      throw error;
    }

    return deployment;
  }

  /**
   * Stop a model deployment
   */
  async stopDeployment(deploymentId: string): Promise<void> {
    const deployment = this.registry.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    try {
      await this.stopModelProcess(deployment);
      deployment.status = 'stopped';
      deployment.stoppedAt = Date.now();

      // Remove endpoint
      const endpoint = Array.from(this.registry.endpoints.values())
        .find(e => e.deploymentId === deploymentId);

      if (endpoint) {
        endpoint.status = 'inactive';
      }

      this.emitEvent('deployment_stopped', { deployment });

    } catch (error: any) {
      deployment.status = 'error';
      deployment.error = error.message;
      throw error;
    }
  }

  /**
   * Run inference on a deployed model
   */
  async runInference(modelId: string, request: Omit<InferenceRequest, 'id' | 'submittedAt'>): Promise<InferenceResponse> {
    const endpoint = this.findActiveEndpoint(modelId);
    if (!endpoint) {
      throw new Error(`No active endpoint found for model ${modelId}`);
    }

    const inferenceRequest: InferenceRequest = {
      id: crypto.randomUUID(),
      ...request,
      submittedAt: Date.now()
    };

    this.inferenceQueue.push(inferenceRequest);

    try {
      const response = await this.processInference(endpoint, inferenceRequest);
      inferenceRequest.processedAt = Date.now();

      // Update metrics
      this.updateEndpointMetrics(endpoint, response);

      this.emitEvent('inference_completed', { request: inferenceRequest, response, endpoint });

      return response;
    } catch (error) {
      // Update error metrics
      endpoint.usage.errorCount++;
      throw error;
    }
  }

  /**
   * Optimize a model for edge deployment
   */
  async optimizeModel(modelId: string, optimizationType: ModelOptimization['type'], config?: any): Promise<ModelOptimization> {
    const model = this.registry.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const optimization: ModelOptimization = {
      id: crypto.randomUUID(),
      modelId,
      type: optimizationType,
      status: 'pending',
      config: config || {},
      createdAt: Date.now()
    };

    this.optimizations.set(optimization.id, optimization);

    try {
      optimization.status = 'running';
      const results = await this.performOptimization(model, optimization);

      optimization.status = 'completed';
      optimization.results = results;
      optimization.completedAt = Date.now();

      this.emitEvent('optimization_completed', { model, optimization, results });

    } catch (error) {
      optimization.status = 'failed';
      throw error;
    }

    return optimization;
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(): {
    models: AIModel[];
    deployments: ModelDeployment[];
    endpoints: ModelEndpoint[];
    downloads: ModelDownload[];
    hardware: HardwareProfile;
  } {
    return {
      models: Array.from(this.registry.models.values()),
      deployments: Array.from(this.registry.deployments.values()),
      endpoints: Array.from(this.registry.endpoints.values()),
      downloads: Array.from(this.downloads.values()),
      hardware: this.hardwareProfile
    };
  }

  // Private methods

  private async getModelInfo(modelId: string, source?: string): Promise<AIModel | null> {
    // Check local registry first
    const localModel = this.registry.models.get(modelId);
    if (localModel) return localModel;

    // Fetch from remote registry
    try {
      const registryUrl = source || 'https://registry.agentprime.dev';
      const url = `${registryUrl}/models/${modelId}`;

      const modelData = await this.fetchJson(url);
      return modelData as AIModel;
    } catch (error) {
      console.error('Failed to fetch model info:', error);
      return null;
    }
  }

  private async performDownload(download: ModelDownload, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      const startTime = Date.now();

      https.get(download.url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0');
        download.totalSize = totalSize;

        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          download.downloadedSize = downloadedSize;

          if (totalSize > 0) {
            download.progress = (downloadedSize / totalSize) * 100;
          }

          const elapsed = (Date.now() - startTime) / 1000;
          download.speed = downloadedSize / elapsed;
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (error) => {
          fs.unlink(localPath, () => {});
          reject(error);
        });

      }).on('error', (error) => {
        fs.unlink(localPath, () => {});
        reject(error);
      });

      // Timeout
      setTimeout(() => {
        reject(new Error('Download timeout'));
      }, this.config.downloadTimeout);
    });
  }

  private async startModelProcess(deployment: ModelDeployment): Promise<void> {
    // This would start the actual model process (e.g., llama.cpp, transformers)
    // For now, simulate with a timeout
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate successful startup
        deployment.pid = Math.floor(Math.random() * 10000);
        resolve();
      }, 2000);

      setTimeout(() => {
        reject(new Error('Model loading timeout'));
      }, this.config.loadTimeout);
    });
  }

  private async stopModelProcess(deployment: ModelDeployment): Promise<void> {
    if (deployment.pid) {
      // This would kill the actual process
      // For now, just simulate
      deployment.pid = undefined;
    }
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    // Simple port finding - would use proper port detection
    return startPort + Math.floor(Math.random() * 100);
  }

  private isModelCompatible(model: AIModel): boolean {
    // Check hardware requirements
    if (model.requirements.memory > this.hardwareProfile.memory.available / (1024 * 1024 * 1024)) {
      return false;
    }

    if (model.requirements.compute === 'gpu' && !this.hardwareProfile.gpu) {
      return false;
    }

    if (model.requirements.platform !== 'all' && model.requirements.platform !== this.hardwareProfile.platform) {
      return false;
    }

    return true;
  }

  private findActiveEndpoint(modelId: string): ModelEndpoint | null {
    return Array.from(this.registry.endpoints.values())
      .find(e => e.modelId === modelId && e.status === 'active') || null;
  }

  private async processInference(endpoint: ModelEndpoint, request: InferenceRequest): Promise<InferenceResponse> {
    const startTime = Date.now();

    // Check which backend to use
    await this.ensureBackendAvailable();

    let text: string;
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    if (this.inferenceBackend.name === 'ollama') {
      // Use Ollama API
      const result = await this.runOllamaInference(request.model, request.prompt, request.options);
      text = result.response;
      usage = {
        promptTokens: result.prompt_eval_count || Math.floor(request.prompt.length / 4),
        completionTokens: result.eval_count || text.length / 4,
        totalTokens: (result.prompt_eval_count || 0) + (result.eval_count || 0)
      };
    } else if (this.inferenceBackend.name === 'llama.cpp') {
      // Use llama.cpp server
      const modelProcess = this.modelProcesses.get(request.model);
      if (modelProcess) {
        text = await this.runLlamaCppInference(modelProcess.port, request.prompt, request.options);
        usage = {
          promptTokens: Math.floor(request.prompt.length / 4),
          completionTokens: Math.floor(text.length / 4),
          totalTokens: Math.floor((request.prompt.length + text.length) / 4)
        };
      } else {
        throw new Error('Model not loaded in llama.cpp');
      }
    } else {
      // Fallback to mock response
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
      text = `[Edge AI] Mock response for: ${request.prompt.substring(0, 50)}...`;
      usage = {
        promptTokens: Math.floor(request.prompt.length / 4),
        completionTokens: 100,
        totalTokens: Math.floor(request.prompt.length / 4) + 100
      };
    }

    const response: InferenceResponse = {
      id: crypto.randomUUID(),
      requestId: request.id,
      text,
      usage,
      finishReason: 'stop',
      latency: Date.now() - startTime,
      model: request.model
    };

    return response;
  }

  /**
   * Detect and initialize local inference backend
   */
  async ensureBackendAvailable(): Promise<LocalInferenceBackend> {
    if (this.inferenceBackend.available) {
      return this.inferenceBackend;
    }

    // Check for Ollama (most common)
    try {
      const result = child_process.execSync('ollama --version', { encoding: 'utf-8', timeout: 5000 });
      if (result.includes('ollama')) {
        this.inferenceBackend = {
          name: 'ollama',
          available: true,
          version: result.trim()
        };
        console.log('[EdgeDeployment] Using Ollama backend');
        return this.inferenceBackend;
      }
    } catch { /* Ollama not available */ }

    // Check for llama.cpp
    const llamaPaths = [
      '/usr/local/bin/llama-server',
      '/usr/bin/llama-server',
      path.join(process.cwd(), 'llama.cpp', 'server'),
      'C:\\llama.cpp\\server.exe'
    ];

    for (const llamaPath of llamaPaths) {
      if (fs.existsSync(llamaPath)) {
        this.inferenceBackend = {
          name: 'llama.cpp',
          available: true,
          path: llamaPath
        };
        console.log('[EdgeDeployment] Using llama.cpp backend');
        return this.inferenceBackend;
      }
    }

    console.log('[EdgeDeployment] No local inference backend found, using mock responses');
    this.inferenceBackend = { name: 'none', available: false };
    return this.inferenceBackend;
  }

  /**
   * Run inference via Ollama
   */
  private async runOllamaInference(model: string, prompt: string, options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model,
        prompt,
        stream: false,
        ...options
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid Ollama response'));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Run inference via llama.cpp server
   */
  private async runLlamaCppInference(port: number, prompt: string, options?: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        prompt,
        n_predict: options?.maxTokens || 256,
        temperature: options?.temperature || 0.7,
        ...options
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/completion',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            resolve(result.content || result.text || '');
          } catch (e) {
            reject(new Error('Invalid llama.cpp response'));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Start llama.cpp server for a model
   */
  async startLlamaCppServer(modelPath: string, port: number = 8080): Promise<ModelProcess> {
    if (!this.inferenceBackend.path) {
      throw new Error('llama.cpp not available');
    }

    const args = [
      '-m', modelPath,
      '--host', '127.0.0.1',
      '--port', String(port),
      '-c', '4096' // Context size
    ];

    const serverProcess = child_process.spawn(this.inferenceBackend.path, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const modelId = path.basename(modelPath, path.extname(modelPath));
    const modelProcess: ModelProcess = {
      modelId,
      process: serverProcess,
      port,
      pid: serverProcess.pid || 0
    };

    this.modelProcesses.set(modelId, modelProcess);

    serverProcess.on('exit', (code) => {
      console.log(`[EdgeDeployment] llama.cpp server exited with code ${code}`);
      this.modelProcesses.delete(modelId);
    });

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    return modelProcess;
  }

  /**
   * Stop llama.cpp server for a model
   */
  stopLlamaCppServer(modelId: string): boolean {
    const process = this.modelProcesses.get(modelId);
    if (process) {
      process.process.kill('SIGTERM');
      this.modelProcesses.delete(modelId);
      return true;
    }
    return false;
  }

  /**
   * Get available backend
   */
  getBackend(): LocalInferenceBackend {
    return this.inferenceBackend;
  }

  private updateEndpointMetrics(endpoint: ModelEndpoint, response: InferenceResponse): void {
    endpoint.lastUsed = Date.now();
    endpoint.usage.totalRequests++;
    endpoint.usage.totalTokens += response.usage.totalTokens;
    endpoint.usage.averageLatency =
      (endpoint.usage.averageLatency * (endpoint.usage.totalRequests - 1) + response.latency) /
      endpoint.usage.totalRequests;
    endpoint.usage.uptime = Date.now() - (endpoint.usage.uptime || Date.now());
  }

  private async performOptimization(model: AIModel, optimization: ModelOptimization): Promise<any> {
    // This would perform actual model optimization
    // For now, simulate optimization
    await new Promise(resolve => setTimeout(resolve, 5000));

    return {
      originalSize: model.size,
      optimizedSize: model.size * 0.6,
      compressionRatio: 1.67,
      qualityLoss: 0.05,
      performanceGain: 0.3,
      validationScore: 0.95
    };
  }

  private detectHardware(): HardwareProfile {
    return {
      platform: process.platform,
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'Unknown',
        architecture: os.arch()
      },
      memory: {
        total: os.totalmem(),
        available: os.freemem()
      },
      gpu: undefined, // Would detect GPU with proper libraries
      capabilities: ['cpu_inference', 'basic_optimization'],
      recommendedModels: ['distilbert', 'tinyllama']
    };
  }

  private async fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  private startMonitoring(): void {
    if (!this.config.monitoringEnabled) return;

    this.monitoringTimer = setInterval(() => {
      // Update deployment metrics
      for (const deployment of this.registry.deployments.values()) {
        if (deployment.status === 'running') {
          this.updateDeploymentMetrics(deployment);
        }
      }

      // Update endpoint metrics
      for (const endpoint of this.registry.endpoints.values()) {
        if (endpoint.status === 'active') {
          endpoint.usage.uptime = Date.now() - (endpoint.usage.uptime || Date.now());
        }
      }
    }, 30000); // 30 seconds
  }

  private updateDeploymentMetrics(deployment: ModelDeployment): void {
    // Update mock metrics
    deployment.metrics.memoryUsage = Math.random() * 100;
    deployment.metrics.cpuUsage = Math.random() * 100;
    deployment.metrics.uptime = Date.now() - (deployment.startedAt || Date.now());

    // Calculate throughput
    const timeWindow = 300; // 5 minutes
    deployment.metrics.throughput = deployment.metrics.requestsProcessed / timeWindow;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      // Clean up failed downloads
      for (const [id, download] of this.downloads) {
        if (download.status === 'failed' && Date.now() - download.startedAt > 3600000) {
          this.downloads.delete(id);
        }
      }

      // Clean up old completed downloads
      for (const [id, download] of this.downloads) {
        if (download.status === 'completed' && Date.now() - (download.completedAt || 0) > 86400000) {
          this.downloads.delete(id);
        }
      }
    }, 3600000); // 1 hour
  }

  private emitEvent(type: EdgeDeploymentEvent['type'], data: any): void {
    const event: EdgeDeploymentEvent = {
      type,
      data,
      timestamp: Date.now(),
      severity: type.includes('error') ? 'error' : type.includes('failed') ? 'warning' : 'info'
    };

    this.emit('edge_deployment_event', event);
  }
}
