/**
 * AgentPrime - Edge Deployment Types
 * Local AI model deployment and management
 */

export interface AIModel {
  id: string;
  name: string;
  version: string;
  provider: 'huggingface' | 'openai' | 'anthropic' | 'local' | 'custom';
  modelType: 'text' | 'vision' | 'audio' | 'multimodal';
  architecture: string;
  parameters: number; // parameter count
  size: number; // size in bytes
  quantization?: 'none' | '8bit' | '4bit' | '2bit' | '1bit';
  capabilities: ModelCapability[];
  requirements: ModelRequirements;
  metadata: ModelMetadata;
}

export interface ModelCapability {
  type: 'text_generation' | 'code_generation' | 'translation' | 'summarization' | 'question_answering' | 'classification' | 'embedding';
  quality: number; // 0-1
  latency: number; // ms
  maxTokens?: number;
  languages?: string[];
}

export interface ModelRequirements {
  memory: number; // GB
  disk: number; // GB
  compute: 'cpu' | 'gpu' | 'tpu';
  gpuMemory?: number; // GB
  platform: 'windows' | 'linux' | 'macos' | 'all';
  dependencies: string[];
}

export interface ModelMetadata {
  description: string;
  author: string;
  license: string;
  tags: string[];
  created: number;
  updated: number;
  downloads: number;
  rating: number;
  source: string;
  hash: string;
}

export interface ModelDeployment {
  id: string;
  modelId: string;
  instanceId: string;
  status: 'downloading' | 'loading' | 'ready' | 'running' | 'error' | 'stopped';
  endpoint: string;
  port: number;
  pid?: number;
  startedAt?: number;
  stoppedAt?: number;
  metrics: DeploymentMetrics;
  config: DeploymentConfig;
  error?: string;
}

export interface DeploymentMetrics {
  requestsProcessed: number;
  totalTokens: number;
  averageLatency: number;
  memoryUsage: number;
  cpuUsage: number;
  gpuUsage?: number;
  uptime: number;
  errorRate: number;
  throughput: number; // requests per second
}

export interface DeploymentConfig {
  device: 'cpu' | 'gpu' | 'auto';
  precision: 'fp32' | 'fp16' | 'int8' | 'int4';
  maxBatchSize: number;
  maxSequenceLength: number;
  cacheSize: number;
  threads: number;
  gpuLayers?: number;
  contextWindow: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
}

export interface ModelRegistry {
  models: Map<string, AIModel>;
  deployments: Map<string, ModelDeployment>;
  endpoints: Map<string, ModelEndpoint>;
}

export interface ModelEndpoint {
  id: string;
  modelId: string;
  deploymentId: string;
  url: string;
  status: 'active' | 'inactive' | 'error';
  lastUsed: number;
  usage: EndpointUsage;
}

export interface EndpointUsage {
  totalRequests: number;
  totalTokens: number;
  averageLatency: number;
  errorCount: number;
  uptime: number;
}

export interface InferenceRequest {
  id: string;
  model: string;
  prompt: string;
  parameters: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stop?: string[];
    stream?: boolean;
  };
  context?: any;
  submittedAt: number;
  processedAt?: number;
}

export interface InferenceResponse {
  id: string;
  requestId: string;
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'error';
  latency: number;
  model: string;
  error?: string;
}

export interface ModelOptimization {
  id: string;
  modelId: string;
  type: 'quantization' | 'pruning' | 'distillation' | 'compression';
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: any;
  results?: OptimizationResults;
  createdAt: number;
  completedAt?: number;
}

export interface OptimizationResults {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  qualityLoss: number;
  performanceGain: number;
  validationScore: number;
}

export interface EdgeDeploymentConfig {
  enabled: boolean;
  modelsDir: string;
  deploymentsDir: string;
  maxConcurrentModels: number;
  defaultDevice: 'cpu' | 'gpu' | 'auto';
  downloadTimeout: number;
  loadTimeout: number;
  inferenceTimeout: number;
  cacheEnabled: boolean;
  autoOptimize: boolean;
  monitoringEnabled: boolean;
}

export interface ModelDownload {
  id: string;
  modelId: string;
  url: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number; // 0-100
  speed: number; // bytes per second
  totalSize: number;
  downloadedSize: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface HardwareProfile {
  platform: string;
  cpu: {
    cores: number;
    model: string;
    architecture: string;
  };
  memory: {
    total: number;
    available: number;
  };
  gpu?: {
    name: string;
    memory: number;
    cudaVersion?: string;
  };
  capabilities: string[];
  recommendedModels: string[];
}

export interface EdgeDeploymentEvent {
  type: 'model_downloaded' | 'model_loaded' | 'deployment_started' | 'deployment_stopped' | 'inference_completed' | 'optimization_completed' | 'hardware_detected';
  data: any;
  timestamp: number;
  severity: 'info' | 'warning' | 'error';
}
