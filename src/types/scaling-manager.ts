/**
 * AgentPrime - Scaling Manager Types
 * Dynamic resource allocation and performance optimization
 */

export interface ScalingConfig {
  enabled: boolean;
  minInstances: number;
  maxInstances: number;
  targetCPUUsage: number; // percentage
  targetMemoryUsage: number; // percentage
  scaleUpThreshold: number; // percentage
  scaleDownThreshold: number; // percentage
  cooldownPeriod: number; // seconds
  predictionEnabled: boolean;
  autoScaling: boolean;
}

export interface ResourceMetrics {
  timestamp: number;
  cpuUsage: number; // percentage
  memoryUsage: number; // percentage
  diskUsage: number; // percentage
  networkUsage: number; // percentage
  activeConnections: number;
  requestQueueLength: number;
  responseTime: number; // ms
  errorRate: number; // percentage
}

export interface InstanceInfo {
  id: string;
  type: 'main' | 'worker' | 'ai' | 'storage' | 'proxy';
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  startedAt: number;
  metrics: ResourceMetrics;
  config: InstanceConfig;
  load: number; // 0-100
  capacity: number; // max concurrent operations
}

export interface InstanceConfig {
  cpuCores: number;
  memoryGB: number;
  storageGB: number;
  networkMbps: number;
  specializedFor?: string[]; // e.g., ['ai', 'collaboration']
}

export interface ScalingDecision {
  id: string;
  timestamp: number;
  action: 'scale_up' | 'scale_down' | 'no_action';
  reason: string;
  instances: ScalingInstanceAction[];
  predictedLoad?: number;
  confidence?: number;
}

export interface ScalingInstanceAction {
  instanceId: string;
  action: 'create' | 'terminate' | 'reconfigure';
  instanceType: InstanceInfo['type'];
  config?: Partial<InstanceConfig>;
}

export interface LoadPrediction {
  timestamp: number;
  predictedLoad: number; // 0-100
  confidence: number; // 0-1
  timeHorizon: number; // minutes
  factors: LoadFactor[];
}

export interface LoadFactor {
  name: string;
  impact: number; // -1 to 1
  weight: number; // 0-1
  value: any;
}

export interface PerformanceProfile {
  id: string;
  name: string;
  description: string;
  targetMetrics: {
    maxResponseTime: number;
    maxErrorRate: number;
    minThroughput: number;
  };
  scalingRules: ScalingRule[];
  resourceLimits: ResourceLimits;
  active: boolean;
}

export interface ScalingRule {
  id: string;
  condition: ScalingCondition;
  action: ScalingAction;
  cooldown: number; // seconds
  priority: number;
}

export interface ScalingCondition {
  metric: keyof ResourceMetrics;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  duration: number; // seconds - condition must hold for this long
}

export interface ScalingAction {
  type: 'scale_up' | 'scale_down' | 'adjust_resources';
  instances: number;
  instanceType?: InstanceInfo['type'];
  config?: Partial<InstanceConfig>;
}

export interface ResourceLimits {
  maxCPU: number;
  maxMemory: number;
  maxStorage: number;
  maxNetwork: number;
  maxInstances: number;
}

export interface ScalingEvent {
  type: 'instance_created' | 'instance_terminated' | 'scaling_decision' | 'performance_alert' | 'resource_limit_reached' | 'profile_applied';
  instanceId?: string;
  data: any;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface WorkloadPattern {
  id: string;
  name: string;
  pattern: 'constant' | 'periodic' | 'bursty' | 'growing' | 'declining';
  periodicity?: number; // hours
  amplitude: number;
  baseline: number;
  lastUpdated: number;
  accuracy: number; // 0-1
}

export interface AdaptiveConfig {
  learningRate: number;
  adjustmentInterval: number; // minutes
  performanceWindow: number; // minutes
  confidenceThreshold: number;
  explorationRate: number; // for A/B testing different configs
}

export interface ScalingMetrics {
  totalInstances: number;
  activeInstances: number;
  averageLoad: number;
  scalingEvents: number;
  uptime: number; // percentage
  costEfficiency: number; // performance per cost unit
  predictionAccuracy: number;
}
