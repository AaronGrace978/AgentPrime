/**
 * AgentPrime - Telemetry Service
 *
 * Collects anonymous usage data to help improve the application.
 * - Respects user's telemetry preference
 * - Queues events and batches them for efficiency
 * - Stores locally with option to send to endpoint
 * - Never collects personal data, code content, or API keys
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Event types that can be tracked
export type TelemetryEventType =
  | 'app_start'
  | 'app_close'
  | 'session_duration'
  | 'feature_used'
  | 'ai_request'
  | 'ai_response'
  | 'completion_accepted'
  | 'completion_rejected'
  | 'agent_task_start'
  | 'agent_task_complete'
  | 'generation_phase'
  | 'error_occurred'
  | 'template_used'
  | 'provider_changed'
  | 'settings_changed'
  | 'workspace_opened'
  | 'file_operation';

export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestamp: number;
  sessionId: string;
  data: Record<string, any>;
}

export interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string; // Optional remote endpoint
  batchSize: number; // Number of events before flushing
  flushInterval: number; // Ms between auto-flushes
  maxStoredEvents: number; // Max events to store locally
}

export interface TelemetryStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  sessionCount: number;
  lastEventTime: number | null;
  oldestEventTime: number | null;
}

class TelemetryService {
  private config: TelemetryConfig = {
    enabled: false,
    batchSize: 50,
    flushInterval: 60000, // 1 minute
    maxStoredEvents: 10000,
  };

  private eventQueue: TelemetryEvent[] = [];
  private sessionId: string;
  private installId: string;
  private sessionStartTime: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private dataPath: string;
  private eventsFilePath: string;
  private configFilePath: string;

  constructor() {
    this.sessionId = this.generateId();
    this.installId = '';
    this.sessionStartTime = Date.now();
    this.dataPath = path.join(this.resolveUserDataPath(), 'telemetry');
    this.eventsFilePath = path.join(this.dataPath, 'events.json');
    this.configFilePath = path.join(this.dataPath, 'config.json');
  }

  /**
   * Initialize the telemetry service
   */
  async initialize(): Promise<void> {
    // Ensure telemetry directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load or create install ID (anonymous identifier)
    this.installId = await this.getOrCreateInstallId();

    // Load saved config
    this.loadConfig();

    // Load any pending events from disk
    this.loadPendingEvents();

    // Start flush timer if enabled
    if (this.config.enabled) {
      this.startFlushTimer();
    }

    // Track app start
    this.track('app_start', {
      version: typeof app?.getVersion === 'function' ? app.getVersion() : 'unknown',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
    });

    console.log(
      `[Telemetry] Initialized (enabled: ${this.config.enabled}, installId: ${this.installId.substring(0, 8)}...)`
    );
  }

  /**
   * Enable or disable telemetry
   */
  setEnabled(enabled: boolean): void {
    const wasEnabled = this.config.enabled;
    this.config.enabled = enabled;
    this.saveConfig();

    if (enabled && !wasEnabled) {
      this.startFlushTimer();
      this.track('settings_changed', { setting: 'telemetry_enabled', value: true });
      console.log('[Telemetry] Enabled');
    } else if (!enabled && wasEnabled) {
      this.stopFlushTimer();
      console.log('[Telemetry] Disabled');
    }
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Track an event
   */
  track(type: TelemetryEventType, data: Record<string, any> = {}): void {
    if (!this.config.enabled) {
      return;
    }

    const event: TelemetryEvent = {
      id: this.generateId(),
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data: this.sanitizeData(data),
    };

    this.eventQueue.push(event);

    // Auto-flush if batch size reached
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush events to storage/endpoint
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const eventsToFlush = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Load existing events
      let storedEvents: TelemetryEvent[] = [];
      if (fs.existsSync(this.eventsFilePath)) {
        try {
          const data = fs.readFileSync(this.eventsFilePath, 'utf-8');
          storedEvents = JSON.parse(data);
        } catch (e) {
          console.warn('[Telemetry] Error reading stored events:', e);
        }
      }

      // Add new events
      storedEvents.push(...eventsToFlush);

      // Trim to max size (keep most recent)
      if (storedEvents.length > this.config.maxStoredEvents) {
        storedEvents = storedEvents.slice(-this.config.maxStoredEvents);
      }

      // Save to disk
      fs.writeFileSync(this.eventsFilePath, JSON.stringify(storedEvents, null, 2));

      // If we have a remote endpoint, try to send
      if (this.config.endpoint) {
        await this.sendToEndpoint(eventsToFlush);
      }

      console.log(`[Telemetry] Flushed ${eventsToFlush.length} events`);
    } catch (error) {
      console.error('[Telemetry] Error flushing events:', error);
      // Put events back in queue
      this.eventQueue.unshift(...eventsToFlush);
    }
  }

  /**
   * Get telemetry statistics
   */
  getStats(): TelemetryStats {
    let storedEvents: TelemetryEvent[] = [];

    try {
      if (fs.existsSync(this.eventsFilePath)) {
        const data = fs.readFileSync(this.eventsFilePath, 'utf-8');
        storedEvents = JSON.parse(data);
      }
    } catch (e) {
      console.warn('[Telemetry] Error reading events for stats:', e);
    }

    // Combine with pending queue
    const allEvents = [...storedEvents, ...this.eventQueue];

    // Calculate stats
    const eventsByType: Record<string, number> = {};
    const sessionIds = new Set<string>();

    for (const event of allEvents) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      sessionIds.add(event.sessionId);
    }

    return {
      totalEvents: allEvents.length,
      eventsByType,
      sessionCount: sessionIds.size,
      lastEventTime: allEvents.length > 0 ? allEvents[allEvents.length - 1].timestamp : null,
      oldestEventTime: allEvents.length > 0 ? allEvents[0].timestamp : null,
    };
  }

  /**
   * Clear all telemetry data
   */
  clearData(): void {
    this.eventQueue = [];

    try {
      if (fs.existsSync(this.eventsFilePath)) {
        fs.unlinkSync(this.eventsFilePath);
      }
      console.log('[Telemetry] Data cleared');
    } catch (e) {
      console.error('[Telemetry] Error clearing data:', e);
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get anonymous install ID
   */
  getInstallId(): string {
    return this.installId;
  }

  /**
   * Shutdown telemetry service
   */
  async shutdown(): Promise<void> {
    // Track session end
    if (this.config.enabled) {
      this.track('session_duration', {
        durationMs: Date.now() - this.sessionStartTime,
        durationMinutes: Math.round((Date.now() - this.sessionStartTime) / 60000),
      });

      this.track('app_close', {
        cleanShutdown: true,
      });
    }

    this.stopFlushTimer();
    await this.flush();

    console.log('[Telemetry] Shutdown complete');
  }

  // Private methods

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private async getOrCreateInstallId(): Promise<string> {
    const installIdPath = path.join(this.dataPath, 'install_id');

    try {
      if (fs.existsSync(installIdPath)) {
        return fs.readFileSync(installIdPath, 'utf-8').trim();
      }
    } catch (e) {
      // Will create new one
    }

    // Create new anonymous install ID
    const newId = this.generateId();
    try {
      fs.writeFileSync(installIdPath, newId);
    } catch (e) {
      console.warn('[Telemetry] Could not save install ID:', e);
    }

    return newId;
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const data = fs.readFileSync(this.configFilePath, 'utf-8');
        const savedConfig = JSON.parse(data);
        this.config = { ...this.config, ...savedConfig };
      }
    } catch (e) {
      console.warn('[Telemetry] Error loading config:', e);
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error('[Telemetry] Error saving config:', e);
    }
  }

  private loadPendingEvents(): void {
    // Events are stored on disk, not loaded into memory
    // They will be read when needed for stats or sending
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private sanitizeData(data: Record<string, any>): Record<string, any> {
    // Remove any potentially sensitive data
    const sanitized: Record<string, any> = {};

    const sensitiveKeys = [
      'apikey',
      'api_key',
      'key',
      'token',
      'secret',
      'password',
      'credential',
      'auth',
      'code',
      'content',
      'source',
      'body',
      'email',
      'username',
      'user',
      'name',
      'path',
    ];

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Skip sensitive keys
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        continue;
      }

      // Only allow primitive values and arrays of primitives
      if (typeof value === 'string') {
        // Truncate long strings and ensure no paths or sensitive data
        sanitized[key] = value.length > 100 ? value.substring(0, 100) + '...' : value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value
          .slice(0, 10)
          .map((v) =>
            typeof v === 'string' ? (v.length > 50 ? v.substring(0, 50) + '...' : v) : v
          );
      }
    }

    return sanitized;
  }

  private resolveUserDataPath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return app.getPath('userData');
      }
    } catch {
      // Fall through to CLI-safe default.
    }

    return path.join(os.homedir(), '.agentprime');
  }

  private async sendToEndpoint(events: TelemetryEvent[]): Promise<void> {
    if (!this.config.endpoint) {
      return;
    }

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installId: this.installId,
          events,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log(`[Telemetry] Sent ${events.length} events to endpoint`);
    } catch (error) {
      console.warn('[Telemetry] Failed to send to endpoint:', error);
      // Events are still stored locally, so no data loss
    }
  }
}

// Singleton instance
let telemetryInstance: TelemetryService | null = null;

export function getTelemetryService(): TelemetryService {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryService();
  }
  return telemetryInstance;
}

export function initializeTelemetry(): Promise<void> {
  return getTelemetryService().initialize();
}

export default TelemetryService;
