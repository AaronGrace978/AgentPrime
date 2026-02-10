/**
 * Matrix Mode System Intel
 * Runtime health telemetry for CPU, memory, battery, temperature, and disks.
 */

import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';

export interface BatteryHealth {
  available: boolean;
  percent?: number;
  status?: string;
  designCapacityMah?: number;
  fullChargeCapacityMah?: number;
  healthPercent?: number;
}

export interface DiskUsage {
  name: string;
  mount: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export interface SystemAlert {
  level: 'warning' | 'critical';
  kind: 'cpu' | 'memory' | 'temperature' | 'disk' | 'battery';
  message: string;
  value?: number;
  threshold?: number;
}

export interface SystemHealthSnapshot {
  timestamp: number;
  cpuUsagePercent: number;
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  temperatureC?: number | null;
  gpu: Array<{ name: string; memoryBytes?: number }>;
  battery?: BatteryHealth;
  disks?: DiskUsage[];
  alerts: SystemAlert[];
}

export interface TelemetryWatchThresholds {
  cpuWarnPercent: number;
  memoryWarnPercent: number;
  temperatureWarnC: number;
  diskWarnPercent: number;
  batteryLowPercent: number;
}

export interface TelemetryWatchConfig {
  intervalMs?: number;
  thresholds?: Partial<TelemetryWatchThresholds>;
}

export interface WatchStatus {
  running: boolean;
  intervalMs: number;
  thresholds: TelemetryWatchThresholds;
  startedAt?: number;
  lastSnapshotAt?: number;
}

const DEFAULT_THRESHOLDS: TelemetryWatchThresholds = {
  cpuWarnPercent: 85,
  memoryWarnPercent: 85,
  temperatureWarnC: 80,
  diskWarnPercent: 90,
  batteryLowPercent: 20
};

function safeJsonCommand(command: string): any | null {
  try {
    const raw = execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toPercent(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((used / total) * 1000) / 10;
}

function normalizeArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function sampleCpuUsagePercent(sampleMs: number = 250): Promise<number> {
  const first = os.cpus();
  await new Promise(resolve => setTimeout(resolve, sampleMs));
  const second = os.cpus();

  let idleDelta = 0;
  let totalDelta = 0;

  for (let i = 0; i < first.length; i += 1) {
    const t1 = first[i].times;
    const t2 = second[i].times;
    const total1 = t1.user + t1.nice + t1.sys + t1.idle + t1.irq;
    const total2 = t2.user + t2.nice + t2.sys + t2.idle + t2.irq;
    totalDelta += total2 - total1;
    idleDelta += t2.idle - t1.idle;
  }

  if (totalDelta <= 0) return 0;
  const busy = totalDelta - idleDelta;
  return Math.round((busy / totalDelta) * 1000) / 10;
}

export class SystemIntel extends EventEmitter {
  private watchTimer: NodeJS.Timeout | null = null;
  private watchStartedAt: number | undefined;
  private lastSnapshotAt: number | undefined;
  private watchIntervalMs = 60000;
  private watchThresholds: TelemetryWatchThresholds = { ...DEFAULT_THRESHOLDS };

  async getHealthSnapshot(): Promise<SystemHealthSnapshot> {
    const timestamp = Date.now();
    const cpuUsagePercent = await sampleCpuUsagePercent();

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = Math.max(totalMemory - freeMemory, 0);
    const memoryUsedPercent = toPercent(usedMemory, totalMemory);

    const temperatureC = this.getTemperatureC();
    const gpu = this.getGpuInfo();
    const battery = this.getBatteryHealth();
    const disks = this.getDiskUsage();

    const snapshot: SystemHealthSnapshot = {
      timestamp,
      cpuUsagePercent,
      memory: {
        totalBytes: totalMemory,
        usedBytes: usedMemory,
        freeBytes: freeMemory,
        usedPercent: memoryUsedPercent
      },
      temperatureC,
      gpu,
      battery,
      disks,
      alerts: []
    };

    snapshot.alerts = this.evaluateAlerts(snapshot, this.watchThresholds);
    return snapshot;
  }

  getBatteryHealth(): BatteryHealth {
    if (process.platform === 'win32') {
      const data = safeJsonCommand(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus,DesignCapacity,FullChargeCapacity | ConvertTo-Json -Compress"'
      );
      const batteries = normalizeArray<any>(data);
      if (batteries.length === 0) {
        return { available: false };
      }

      const battery = batteries[0];
      const design = Number(battery.DesignCapacity) || undefined;
      const full = Number(battery.FullChargeCapacity) || undefined;
      const health = design && full ? toPercent(full, design) : undefined;

      return {
        available: true,
        percent: Number(battery.EstimatedChargeRemaining) || undefined,
        status: String(battery.BatteryStatus ?? ''),
        designCapacityMah: design,
        fullChargeCapacityMah: full,
        healthPercent: health
      };
    }

    return { available: false };
  }

  getDiskUsage(): DiskUsage[] {
    if (process.platform === 'win32') {
      const data = safeJsonCommand(
        'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free,Root | ConvertTo-Json -Compress"'
      );
      const drives = normalizeArray<any>(data);
      return drives
        .map((drive) => {
          const used = Number(drive.Used) || 0;
          const free = Number(drive.Free) || 0;
          const total = used + free;
          return {
            name: String(drive.Name ?? ''),
            mount: String(drive.Root ?? `${drive.Name}:\\`),
            totalBytes: total,
            usedBytes: used,
            freeBytes: free,
            usedPercent: toPercent(used, total)
          } satisfies DiskUsage;
        })
        .filter(d => d.totalBytes > 0);
    }

    const root = '/';
    try {
      const stats = fs.statfsSync(root);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = Math.max(total - free, 0);
      return [{
        name: root,
        mount: root,
        totalBytes: total,
        usedBytes: used,
        freeBytes: free,
        usedPercent: toPercent(used, total)
      }];
    } catch {
      return [];
    }
  }

  startTelemetryWatch(config: TelemetryWatchConfig = {}): WatchStatus {
    this.stopTelemetryWatch();
    this.watchIntervalMs = Math.max(config.intervalMs || 60000, 5000);
    this.watchThresholds = { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) };
    this.watchStartedAt = Date.now();

    this.watchTimer = setInterval(async () => {
      try {
        const snapshot = await this.getHealthSnapshot();
        this.lastSnapshotAt = snapshot.timestamp;
        this.emit('telemetryTick', snapshot);
        if (snapshot.alerts.length > 0) {
          this.emit('telemetryAlert', snapshot.alerts, snapshot);
        }
      } catch (error) {
        this.emit('telemetryError', error);
      }
    }, this.watchIntervalMs);

    return this.getWatchStatus();
  }

  stopTelemetryWatch(): WatchStatus {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    this.watchStartedAt = undefined;
    return this.getWatchStatus();
  }

  getWatchStatus(): WatchStatus {
    return {
      running: !!this.watchTimer,
      intervalMs: this.watchIntervalMs,
      thresholds: { ...this.watchThresholds },
      startedAt: this.watchStartedAt,
      lastSnapshotAt: this.lastSnapshotAt
    };
  }

  private evaluateAlerts(snapshot: SystemHealthSnapshot, thresholds: TelemetryWatchThresholds): SystemAlert[] {
    const alerts: SystemAlert[] = [];

    if (snapshot.cpuUsagePercent >= thresholds.cpuWarnPercent) {
      alerts.push({
        level: snapshot.cpuUsagePercent >= thresholds.cpuWarnPercent + 10 ? 'critical' : 'warning',
        kind: 'cpu',
        message: `CPU usage is high (${snapshot.cpuUsagePercent}%).`,
        value: snapshot.cpuUsagePercent,
        threshold: thresholds.cpuWarnPercent
      });
    }

    if (snapshot.memory.usedPercent >= thresholds.memoryWarnPercent) {
      alerts.push({
        level: snapshot.memory.usedPercent >= thresholds.memoryWarnPercent + 10 ? 'critical' : 'warning',
        kind: 'memory',
        message: `Memory usage is high (${snapshot.memory.usedPercent}%).`,
        value: snapshot.memory.usedPercent,
        threshold: thresholds.memoryWarnPercent
      });
    }

    if (typeof snapshot.temperatureC === 'number' && snapshot.temperatureC >= thresholds.temperatureWarnC) {
      alerts.push({
        level: snapshot.temperatureC >= thresholds.temperatureWarnC + 10 ? 'critical' : 'warning',
        kind: 'temperature',
        message: `System temperature is high (${snapshot.temperatureC}C).`,
        value: snapshot.temperatureC,
        threshold: thresholds.temperatureWarnC
      });
    }

    for (const disk of snapshot.disks || []) {
      if (disk.usedPercent >= thresholds.diskWarnPercent) {
        alerts.push({
          level: disk.usedPercent >= thresholds.diskWarnPercent + 5 ? 'critical' : 'warning',
          kind: 'disk',
          message: `Disk ${disk.name} is ${disk.usedPercent}% full.`,
          value: disk.usedPercent,
          threshold: thresholds.diskWarnPercent
        });
      }
    }

    if (snapshot.battery?.available && typeof snapshot.battery.percent === 'number' && snapshot.battery.percent <= thresholds.batteryLowPercent) {
      alerts.push({
        level: snapshot.battery.percent <= 10 ? 'critical' : 'warning',
        kind: 'battery',
        message: `Battery is low (${snapshot.battery.percent}%).`,
        value: snapshot.battery.percent,
        threshold: thresholds.batteryLowPercent
      });
    }

    return alerts;
  }

  private getGpuInfo(): Array<{ name: string; memoryBytes?: number }> {
    if (process.platform === 'win32') {
      const data = safeJsonCommand(
        'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress"'
      );
      const gpuList = normalizeArray<any>(data);
      return gpuList.map(gpu => ({
        name: String(gpu.Name ?? 'Unknown GPU'),
        memoryBytes: Number(gpu.AdapterRAM) || undefined
      }));
    }

    return [];
  }

  private getTemperatureC(): number | null {
    if (process.platform !== 'win32') {
      return null;
    }

    const data = safeJsonCommand(
      'powershell -NoProfile -Command "Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | Select-Object CurrentTemperature | ConvertTo-Json -Compress"'
    );
    const values = normalizeArray<any>(data);
    if (values.length === 0) {
      return null;
    }

    const raw = Number(values[0].CurrentTemperature);
    if (!raw) {
      return null;
    }

    // ACPI thermal zone value is tenths of Kelvin.
    const celsius = (raw / 10) - 273.15;
    return Math.round(celsius * 10) / 10;
  }
}

let systemIntelInstance: SystemIntel | null = null;

export function getSystemIntel(): SystemIntel {
  if (!systemIntelInstance) {
    systemIntelInstance = new SystemIntel();
  }
  return systemIntelInstance;
}

export async function initializeSystemIntel(): Promise<SystemIntel> {
  return getSystemIntel();
}

export function shutdownSystemIntel(): void {
  if (systemIntelInstance) {
    systemIntelInstance.stopTelemetryWatch();
  }
}

export default SystemIntel;
