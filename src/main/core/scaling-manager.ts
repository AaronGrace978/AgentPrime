/**
 * AgentPrime - Scaling Manager
 * Dynamic resource allocation and performance optimization
 */

import type {
  ScalingConfig,
  ResourceMetrics,
  InstanceInfo,
  InstanceConfig,
  ScalingDecision,
  LoadPrediction,
  PerformanceProfile,
  ScalingEvent,
  WorkloadPattern,
  AdaptiveConfig,
  ScalingMetrics
} from '../../types/scaling-manager';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as crypto from 'crypto';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Track CPU times for delta calculation
let previousCPUTimes: { idle: number; total: number } | null = null;

// Worker process tracking
interface WorkerProcess {
  instanceId: string;
  process: child_process.ChildProcess;
  port: number;
  startedAt: number;
}

export class ScalingManager extends EventEmitter {
  private config: ScalingConfig;
  private instances: Map<string, InstanceInfo> = new Map();
  private metrics: ResourceMetrics[] = [];
  private scalingDecisions: ScalingDecision[] = [];
  private performanceProfiles: Map<string, PerformanceProfile> = new Map();
  private workloadPatterns: Map<string, WorkloadPattern> = new Map();
  private adaptiveConfig: AdaptiveConfig;

  private monitoringTimer?: NodeJS.Timeout;
  private scalingTimer?: NodeJS.Timeout;
  private predictionTimer?: NodeJS.Timeout;
  
  // Worker process management
  private workerProcesses: Map<string, WorkerProcess> = new Map();
  private nextWorkerPort: number = 4500;

  constructor(config?: Partial<ScalingConfig>) {
    super();

    this.config = {
      enabled: true,
      minInstances: 1,
      maxInstances: 10,
      targetCPUUsage: 70,
      targetMemoryUsage: 80,
      scaleUpThreshold: 85,
      scaleDownThreshold: 30,
      cooldownPeriod: 300, // 5 minutes
      predictionEnabled: true,
      autoScaling: true,
      ...config
    };

    this.adaptiveConfig = {
      learningRate: 0.1,
      adjustmentInterval: 15, // minutes
      performanceWindow: 60, // minutes
      confidenceThreshold: 0.8,
      explorationRate: 0.1
    };

    // Create initial instance (main)
    this.createInstance('main', {
      cpuCores: os.cpus().length,
      memoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      storageGB: 100, // placeholder
      networkMbps: 1000 // placeholder
    });

    if (this.config.enabled) {
      this.startMonitoring();
      this.startScaling();
      if (this.config.predictionEnabled) {
        this.startPrediction();
      }
    }
  }

  /**
   * Create a new instance
   */
  async createInstance(type: InstanceInfo['type'], config: InstanceInfo['config']): Promise<InstanceInfo> {
    const instance: InstanceInfo = {
      id: crypto.randomUUID(),
      type,
      status: 'starting',
      startedAt: Date.now(),
      metrics: this.getCurrentMetrics(),
      config,
      load: 0,
      capacity: this.calculateCapacity(config)
    };

    this.instances.set(instance.id, instance);

    // For 'worker' type, spawn actual process
    if (type === 'worker') {
      try {
        await this.spawnWorkerProcess(instance);
      } catch (error) {
        console.warn(`[ScalingManager] Failed to spawn worker: ${error}`);
        // Fall back to virtual instance
        setTimeout(() => {
          instance.status = 'running';
          this.emitEvent('instance_created', instance.id, { instance });
        }, 1000);
      }
    } else {
      // For other types, simulate startup
      setTimeout(() => {
        instance.status = 'running';
        this.emitEvent('instance_created', instance.id, { instance });
      }, 2000);
    }

    return instance;
  }

  /**
   * Spawn a worker process
   */
  private async spawnWorkerProcess(instance: InstanceInfo): Promise<void> {
    const port = this.nextWorkerPort++;
    
    // Spawn a Node.js worker process
    const workerScript = path.join(__dirname, '../workers/scaling-worker.js');
    
    // Create the worker script if it doesn't exist
    await this.ensureWorkerScript(workerScript);
    
    const workerProcess = child_process.spawn('node', [workerScript, String(port)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WORKER_ID: instance.id,
        WORKER_PORT: String(port),
        WORKER_TYPE: instance.type
      }
    });
    
    this.workerProcesses.set(instance.id, {
      instanceId: instance.id,
      process: workerProcess,
      port,
      startedAt: Date.now()
    });
    
    workerProcess.stdout?.on('data', (data) => {
      console.log(`[Worker ${instance.id.slice(0, 8)}] ${data.toString().trim()}`);
    });
    
    workerProcess.stderr?.on('data', (data) => {
      console.error(`[Worker ${instance.id.slice(0, 8)}] ${data.toString().trim()}`);
    });
    
    workerProcess.on('exit', (code) => {
      console.log(`[ScalingManager] Worker ${instance.id} exited with code ${code}`);
      this.workerProcesses.delete(instance.id);
      instance.status = 'stopped';
      this.instances.delete(instance.id);
      this.emitEvent('instance_terminated', instance.id, { instance, exitCode: code });
    });
    
    // Wait for worker to be ready
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        instance.status = 'running';
        this.emitEvent('instance_created', instance.id, { instance, port });
        resolve();
      }, 500);
    });
  }

  /**
   * Ensure worker script exists
   */
  private async ensureWorkerScript(scriptPath: string): Promise<void> {
    const workerDir = path.dirname(scriptPath);
    
    if (!fs.existsSync(workerDir)) {
      fs.mkdirSync(workerDir, { recursive: true });
    }
    
    if (!fs.existsSync(scriptPath)) {
      // Create a simple worker script
      const workerCode = `
// AgentPrime Scaling Worker
const http = require('http');
const port = process.argv[2] || 4500;
const workerId = process.env.WORKER_ID || 'unknown';

console.log('Worker starting on port ' + port);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      workerId: workerId,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }));
  } else if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      cpu: process.cpuUsage(),
      memory: process.memoryUsage(),
      pid: process.pid
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log('Worker ready on port ' + port);
});

process.on('SIGTERM', () => {
  console.log('Worker shutting down...');
  server.close(() => process.exit(0));
});
`;
      fs.writeFileSync(scriptPath, workerCode);
    }
  }

  /**
   * Run command in Docker container
   */
  async runInDocker(image: string, command: string[], options?: {
    name?: string;
    env?: Record<string, string>;
    ports?: Array<{ host: number; container: number }>;
    volumes?: Array<{ host: string; container: string }>;
  }): Promise<{ containerId: string; exitCode: number; output: string }> {
    const args = ['run', '--rm'];
    
    if (options?.name) {
      args.push('--name', options.name);
    }
    
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }
    
    if (options?.ports) {
      for (const port of options.ports) {
        args.push('-p', `${port.host}:${port.container}`);
      }
    }
    
    if (options?.volumes) {
      for (const vol of options.volumes) {
        args.push('-v', `${vol.host}:${vol.container}`);
      }
    }
    
    args.push(image, ...command);
    
    return new Promise((resolve, reject) => {
      const dockerProcess = child_process.spawn('docker', args);
      let output = '';
      
      dockerProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      dockerProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });
      
      dockerProcess.on('close', (code) => {
        resolve({
          containerId: options?.name || 'ephemeral',
          exitCode: code || 0,
          output
        });
      });
      
      dockerProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      const result = child_process.execSync('docker --version', { encoding: 'utf-8' });
      return result.includes('Docker version');
    } catch {
      return false;
    }
  }

  /**
   * Terminate an instance
   */
  async terminateInstance(instanceId: string): Promise<boolean> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status === 'stopped') {
      return false;
    }

    instance.status = 'stopping';

    // Kill worker process if it exists
    const worker = this.workerProcesses.get(instanceId);
    if (worker) {
      try {
        // Send SIGTERM for graceful shutdown
        worker.process.kill('SIGTERM');
        
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!worker.process.killed) {
            worker.process.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        console.warn(`[ScalingManager] Failed to kill worker ${instanceId}:`, error);
      }
    } else {
      // Virtual instance - simulate shutdown
      setTimeout(() => {
        instance.status = 'stopped';
        this.instances.delete(instanceId);
        this.emitEvent('instance_terminated', instanceId, { instance });
      }, 1000);
    }

    return true;
  }

  /**
   * Get current scaling metrics
   */
  getScalingMetrics(): ScalingMetrics {
    const instances = Array.from(this.instances.values());
    const activeInstances = instances.filter(i => i.status === 'running');

    const totalLoad = activeInstances.reduce((sum, i) => sum + i.load, 0);
    const averageLoad = activeInstances.length > 0 ? totalLoad / activeInstances.length : 0;

    return {
      totalInstances: instances.length,
      activeInstances: activeInstances.length,
      averageLoad,
      scalingEvents: this.scalingDecisions.length,
      uptime: this.calculateUptime(),
      costEfficiency: this.calculateCostEfficiency(),
      predictionAccuracy: this.calculatePredictionAccuracy()
    };
  }

  /**
   * Create or update performance profile
   */
  createPerformanceProfile(profile: Omit<PerformanceProfile, 'id'>): string {
    const id = crypto.randomUUID();
    const fullProfile: PerformanceProfile = {
      id,
      ...profile
    };

    this.performanceProfiles.set(id, fullProfile);
    return id;
  }

  /**
   * Apply performance profile
   */
  applyPerformanceProfile(profileId: string): boolean {
    const profile = this.performanceProfiles.get(profileId);
    if (!profile) return false;

    // Deactivate other profiles
    for (const [id, p] of this.performanceProfiles) {
      if (id !== profileId) {
        p.active = false;
      }
    }

    profile.active = true;
    this.emitEvent('profile_applied', undefined, { profile });

    return true;
  }

  /**
   * Get current resource metrics
   */
  getCurrentMetrics(): ResourceMetrics {
    // Get actual system metrics
    const cpuUsage = this.getCPUUsage();
    const memoryUsage = this.getMemoryUsage();
    const diskUsage = this.getDiskUsage();

    return {
      timestamp: Date.now(),
      cpuUsage,
      memoryUsage,
      diskUsage,
      networkUsage: 0, // Would need network monitoring
      activeConnections: 0, // Would need connection tracking
      requestQueueLength: 0, // Would need request queue monitoring
      responseTime: 0, // Would need response time tracking
      errorRate: 0 // Would need error tracking
    };
  }

  /**
   * Predict future load
   */
  async predictLoad(timeHorizon: number = 15): Promise<LoadPrediction> {
    const recentMetrics = this.metrics.slice(-60); // Last hour
    const patterns = Array.from(this.workloadPatterns.values());

    // Simple prediction based on recent trends and patterns
    const currentLoad = this.getCurrentAverageLoad();
    let predictedLoad = currentLoad;
    let confidence = 0.5;

    // Apply pattern-based predictions
    for (const pattern of patterns) {
      if (this.matchesCurrentTime(pattern)) {
        predictedLoad = this.applyPatternPrediction(predictedLoad, pattern, timeHorizon);
        confidence = Math.min(confidence + 0.2, 0.9);
      }
    }

    // Apply trend analysis
    if (recentMetrics.length >= 10) {
      const trend = this.calculateTrend(recentMetrics);
      predictedLoad += trend * timeHorizon;
      confidence = Math.min(confidence + 0.1, 0.95);
    }

    const factors: LoadPrediction['factors'] = [
      {
        name: 'current_load',
        impact: currentLoad / 100,
        weight: 0.4,
        value: currentLoad
      },
      {
        name: 'time_patterns',
        impact: patterns.length > 0 ? 0.1 : 0,
        weight: 0.3,
        value: patterns.length
      },
      {
        name: 'recent_trend',
        impact: recentMetrics.length >= 10 ? this.calculateTrend(recentMetrics) / 50 : 0,
        weight: 0.3,
        value: recentMetrics.length
      }
    ];

    return {
      timestamp: Date.now(),
      predictedLoad: Math.max(0, Math.min(100, predictedLoad)),
      confidence,
      timeHorizon,
      factors
    };
  }

  /**
   * Force scaling decision
   */
  async forceScaling(action: 'scale_up' | 'scale_down', instances: number = 1): Promise<ScalingDecision> {
    const decision: ScalingDecision = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      action,
      reason: 'Manual scaling request',
      instances: []
    };

    for (let i = 0; i < instances; i++) {
      const instanceAction = {
        instanceId: crypto.randomUUID(),
        action: (action === 'scale_up' ? 'create' : 'terminate') as 'create' | 'terminate',
        instanceType: 'worker' as const
      };
      decision.instances.push(instanceAction);

      if (action === 'scale_up') {
        await this.createInstance('worker', {
          cpuCores: 2,
          memoryGB: 4,
          storageGB: 50,
          networkMbps: 500
        });
      }
    }

    this.scalingDecisions.push(decision);
    this.emitEvent('scaling_decision', undefined, { decision });

    return decision;
  }

  // Private methods

  private startMonitoring(): void {
    this.monitoringTimer = setInterval(() => {
      const metrics = this.getCurrentMetrics();
      this.metrics.push(metrics);

      // Keep only recent metrics (last 24 hours)
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      this.metrics = this.metrics.filter(m => m.timestamp > oneDayAgo);

      // Update instance metrics
      for (const instance of this.instances.values()) {
        if (instance.status === 'running') {
          instance.metrics = metrics;
          instance.load = this.calculateInstanceLoad(instance, metrics);
        }
      }
    }, 30000); // 30 seconds
  }

  private startScaling(): void {
    this.scalingTimer = setInterval(async () => {
      if (!this.config.autoScaling) return;

      const decision = await this.makeScalingDecision();
      if (decision.action !== 'no_action') {
        this.scalingDecisions.push(decision);
        await this.executeScalingDecision(decision);
        this.emitEvent('scaling_decision', undefined, { decision });
      }
    }, 60000); // 1 minute
  }

  private startPrediction(): void {
    this.predictionTimer = setInterval(async () => {
      // Update workload patterns
      await this.updateWorkloadPatterns();

      // Make predictions
      const prediction = await this.predictLoad();
      if (prediction.confidence > this.adaptiveConfig.confidenceThreshold) {
        // Act on prediction if confident enough
        if (prediction.predictedLoad > this.config.scaleUpThreshold) {
          await this.forceScaling('scale_up', 1);
        } else if (prediction.predictedLoad < this.config.scaleDownThreshold) {
          await this.forceScaling('scale_down', 1);
        }
      }
    }, this.adaptiveConfig.adjustmentInterval * 60 * 1000);
  }

  private async makeScalingDecision(): Promise<ScalingDecision> {
    const currentMetrics = this.getCurrentMetrics();
    const activeInstances = Array.from(this.instances.values()).filter(i => i.status === 'running');
    const totalCapacity = activeInstances.reduce((sum, i) => sum + i.capacity, 0);
    const totalLoad = activeInstances.reduce((sum, i) => sum + i.load, 0);
    const averageLoad = activeInstances.length > 0 ? totalLoad / activeInstances.length : 0;

    const decision: ScalingDecision = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      action: 'no_action',
      reason: 'No scaling needed',
      instances: []
    };

    // Check cooldown period
    const lastDecision = this.scalingDecisions[this.scalingDecisions.length - 1];
    if (lastDecision && Date.now() - lastDecision.timestamp < this.config.cooldownPeriod * 1000) {
      return decision;
    }

    // Scale up conditions
    if ((currentMetrics.cpuUsage > this.config.scaleUpThreshold ||
         currentMetrics.memoryUsage > this.config.scaleUpThreshold ||
         averageLoad > this.config.scaleUpThreshold) &&
        activeInstances.length < this.config.maxInstances) {

      decision.action = 'scale_up';
      decision.reason = `High resource usage: CPU ${currentMetrics.cpuUsage}%, Memory ${currentMetrics.memoryUsage}%, Load ${averageLoad}%`;

      decision.instances.push({
        instanceId: crypto.randomUUID(),
        action: 'create',
        instanceType: 'worker',
        config: {
          cpuCores: 2,
          memoryGB: 4,
          storageGB: 50,
          networkMbps: 500
        }
      });

    // Scale down conditions
    } else if ((currentMetrics.cpuUsage < this.config.scaleDownThreshold &&
                currentMetrics.memoryUsage < this.config.scaleDownThreshold &&
                averageLoad < this.config.scaleDownThreshold) &&
               activeInstances.length > this.config.minInstances) {

      const instanceToTerminate = activeInstances.find(i => i.type === 'worker');
      if (instanceToTerminate) {
        decision.action = 'scale_down';
        decision.reason = `Low resource usage: CPU ${currentMetrics.cpuUsage}%, Memory ${currentMetrics.memoryUsage}%, Load ${averageLoad}%`;

        decision.instances.push({
          instanceId: instanceToTerminate.id,
          action: 'terminate',
          instanceType: 'worker'
        });
      }
    }

    return decision;
  }

  private async executeScalingDecision(decision: ScalingDecision): Promise<void> {
    for (const instanceAction of decision.instances) {
      switch (instanceAction.action) {
        case 'create':
          if (instanceAction.config) {
            // Merge with defaults to ensure complete config
            const fullConfig: InstanceConfig = {
              cpuCores: instanceAction.config.cpuCores ?? 2,
              memoryGB: instanceAction.config.memoryGB ?? 4,
              storageGB: instanceAction.config.storageGB ?? 50,
              networkMbps: instanceAction.config.networkMbps ?? 500,
              specializedFor: instanceAction.config.specializedFor
            };
            await this.createInstance(instanceAction.instanceType, fullConfig);
          }
          break;
        case 'terminate':
          await this.terminateInstance(instanceAction.instanceId);
          break;
      }
    }
  }

  private async updateWorkloadPatterns(): Promise<void> {
    const recentMetrics = this.metrics.slice(-1440); // Last 24 hours at 1-minute intervals

    if (recentMetrics.length < 60) return; // Need at least 1 hour of data

    // Analyze patterns
    const hourlyLoads = this.groupMetricsByHour(recentMetrics);
    const pattern = this.detectWorkloadPattern(hourlyLoads);

    if (pattern) {
      const patternId = crypto.randomUUID();
      this.workloadPatterns.set(patternId, {
        id: patternId,
        name: `Pattern-${Date.now()}`,
        pattern: pattern.type,
        periodicity: pattern.periodicity,
        amplitude: pattern.amplitude,
        baseline: pattern.baseline,
        lastUpdated: Date.now(),
        accuracy: 0.8 // Would calculate based on prediction accuracy
      });
    }
  }

  private getCPUUsage(): number {
    // Calculate actual CPU usage using OS module
    const cpus = os.cpus();
    
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      const { user, nice, sys, idle, irq } = cpu.times;
      totalIdle += idle;
      totalTick += user + nice + sys + idle + irq;
    }
    
    if (previousCPUTimes) {
      const idleDelta = totalIdle - previousCPUTimes.idle;
      const totalDelta = totalTick - previousCPUTimes.total;
      const usage = totalDelta > 0 ? 100 - (idleDelta / totalDelta * 100) : 0;
      
      previousCPUTimes = { idle: totalIdle, total: totalTick };
      return Math.round(usage * 10) / 10;
    }
    
    previousCPUTimes = { idle: totalIdle, total: totalTick };
    
    // Use load average as fallback
    const loadAvg = os.loadavg()[0];
    const cpuCount = cpus.length;
    return Math.min(100, Math.round((loadAvg / cpuCount) * 100 * 10) / 10);
  }

  private getMemoryUsage(): number {
    // Use both system memory and process memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // System-wide memory usage
    const systemUsage = (usedMem / totalMem) * 100;
    
    return Math.round(systemUsage * 10) / 10;
  }

  private getDiskUsage(): number {
    // Get disk usage for current drive/partition
    try {
      if (process.platform === 'win32') {
        // Windows: use wmic command
        const result = child_process.execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf-8' });
        const lines = result.split('\n').filter(line => line.trim());
        
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          if (parts.length >= 3) {
            const freeSpace = parseInt(parts[1], 10);
            const totalSize = parseInt(parts[2], 10);
            if (totalSize > 0) {
              return Math.round(((totalSize - freeSpace) / totalSize) * 100 * 10) / 10;
            }
          }
        }
      } else {
        // Unix: use df command
        const result = child_process.execSync('df -k / | tail -1', { encoding: 'utf-8' });
        const parts = result.trim().split(/\s+/);
        
        if (parts.length >= 5) {
          // Usage percentage is usually in position 4 (e.g., "45%")
          const usageStr = parts[4].replace('%', '');
          return parseInt(usageStr, 10);
        }
      }
    } catch (error) {
      console.warn('[ScalingManager] Failed to get disk usage:', error);
    }
    
    return 50; // Default fallback
  }

  private calculateCapacity(config: InstanceInfo['config']): number {
    // Calculate capacity based on resources
    return Math.floor((config.cpuCores * config.memoryGB) / 2);
  }

  private calculateInstanceLoad(instance: InstanceInfo, metrics: ResourceMetrics): number {
    // Calculate load based on instance type and metrics
    switch (instance.type) {
      case 'ai':
        return metrics.cpuUsage * 0.7 + metrics.memoryUsage * 0.3;
      case 'worker':
        return metrics.cpuUsage * 0.6 + metrics.memoryUsage * 0.4;
      default:
        return (metrics.cpuUsage + metrics.memoryUsage) / 2;
    }
  }

  private getCurrentAverageLoad(): number {
    const activeInstances = Array.from(this.instances.values()).filter(i => i.status === 'running');
    if (activeInstances.length === 0) return 0;

    const totalLoad = activeInstances.reduce((sum, i) => sum + i.load, 0);
    return totalLoad / activeInstances.length;
  }

  private calculateUptime(): number {
    const instances = Array.from(this.instances.values());
    if (instances.length === 0) return 100;

    const totalUptime = instances.reduce((sum, i) => {
      const uptime = Date.now() - i.startedAt;
      return sum + uptime;
    }, 0);

    const averageUptime = totalUptime / instances.length;
    const maxPossibleUptime = Date.now() - Math.min(...instances.map(i => i.startedAt));

    return (averageUptime / maxPossibleUptime) * 100;
  }

  private calculateCostEfficiency(): number {
    // Simplified cost efficiency calculation
    const metrics = this.getScalingMetrics();
    const performance = metrics.averageLoad * metrics.uptime / 100;
    const cost = metrics.totalInstances * 10; // Mock cost per instance
    return cost > 0 ? performance / cost : 0;
  }

  private calculatePredictionAccuracy(): number {
    // Simplified prediction accuracy
    return 0.85;
  }

  private matchesCurrentTime(pattern: WorkloadPattern): boolean {
    // Simplified time matching
    return Math.random() > 0.7; // 30% chance for demo
  }

  private applyPatternPrediction(currentLoad: number, pattern: WorkloadPattern, horizon: number): number {
    // Apply pattern-based adjustment
    switch (pattern.pattern) {
      case 'periodic':
        return currentLoad + pattern.amplitude * Math.sin(Date.now() / 1000 / 3600);
      case 'growing':
        return currentLoad + pattern.amplitude * (horizon / 60); // Increase over time
      case 'bursty':
        return Math.random() > 0.8 ? currentLoad + pattern.amplitude : currentLoad;
      default:
        return currentLoad;
    }
  }

  private calculateTrend(metrics: ResourceMetrics[]): number {
    if (metrics.length < 2) return 0;

    const recent = metrics.slice(-10);
    const older = metrics.slice(-20, -10);

    const recentAvg = recent.reduce((sum, m) => sum + m.cpuUsage, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.cpuUsage, 0) / older.length;

    return recentAvg - olderAvg;
  }

  private groupMetricsByHour(metrics: ResourceMetrics[]): number[] {
    const hourly: { [hour: number]: number[] } = {};

    for (const metric of metrics) {
      const hour = Math.floor(metric.timestamp / (60 * 60 * 1000));
      if (!hourly[hour]) hourly[hour] = [];
      hourly[hour].push(metric.cpuUsage);
    }

    return Object.values(hourly).map(hourlyMetrics =>
      hourlyMetrics.reduce((sum, m) => sum + m, 0) / hourlyMetrics.length
    );
  }

  private detectWorkloadPattern(hourlyLoads: number[]): { type: WorkloadPattern['pattern']; periodicity?: number; amplitude: number; baseline: number } | null {
    if (hourlyLoads.length < 24) return null;

    const avg = hourlyLoads.reduce((sum, load) => sum + load, 0) / hourlyLoads.length;
    const variance = hourlyLoads.reduce((sum, load) => sum + Math.pow(load - avg, 2), 0) / hourlyLoads.length;
    const amplitude = Math.sqrt(variance);

    // Simple pattern detection
    if (amplitude < 5) {
      return { type: 'constant', amplitude, baseline: avg };
    }

    // Check for daily pattern
    const dayPattern = this.detectPeriodicity(hourlyLoads, 24);
    if (dayPattern > 0.7) {
      return { type: 'periodic', periodicity: 24, amplitude, baseline: avg };
    }

    return { type: 'bursty', amplitude, baseline: avg };
  }

  private detectPeriodicity(data: number[], period: number): number {
    // Simplified periodicity detection using autocorrelation
    if (data.length < period * 2) return 0;

    let correlation = 0;
    for (let i = 0; i < data.length - period; i++) {
      correlation += data[i] * data[i + period];
    }

    return correlation / (data.length - period);
  }

  private emitEvent(type: ScalingEvent['type'], instanceId: string | undefined, data: any): void {
    const event: ScalingEvent = {
      type,
      instanceId,
      data,
      timestamp: Date.now(),
      severity: 'info'
    };

    this.emit('scaling_event', event);
  }
}
