/**
 * Matrix Mode Trigger Engine
 * Event-based triggers for automated task execution
 */

import fs from 'fs';
import path from 'path';
import { TriggerConfig, TriggerType } from './types';
import { TaskQueue, getTaskQueue } from './task-queue';

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export interface TriggerEvent {
  type: TriggerType;
  triggerId: string;
  data: any;
  timestamp: number;
}

export type TriggerCallback = (event: TriggerEvent) => void;

// Base trigger interface
interface Trigger {
  id: string;
  type: TriggerType;
  config: TriggerConfig;
  start(): void;
  stop(): void;
  isActive(): boolean;
}

/**
 * File watcher trigger - triggers on file system changes
 */
class FileWatcherTrigger implements Trigger {
  id: string;
  type: TriggerType = 'file';
  config: TriggerConfig;
  private watcher: fs.FSWatcher | null = null;
  private callback: TriggerCallback;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;

  constructor(config: TriggerConfig, callback: TriggerCallback) {
    this.id = config.id;
    this.config = config;
    this.callback = callback;
    this.debounceMs = config.config.debounceMs || 500;
  }

  start(): void {
    const watchPath = this.config.config.path;
    if (!watchPath || !fs.existsSync(watchPath)) {
      console.warn(`[FileWatcherTrigger] Path does not exist: ${watchPath}`);
      return;
    }

    const options: fs.WatchOptions = {
      recursive: this.config.config.recursive !== false,
      persistent: true
    };

    this.watcher = fs.watch(watchPath, options, (eventType, filename) => {
      // Debounce rapid changes
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        // Check file pattern if specified
        if (this.config.config.pattern) {
          const pattern = new RegExp(this.config.config.pattern);
          if (filename && !pattern.test(filename)) {
            return;
          }
        }

        this.callback({
          type: 'file',
          triggerId: this.id,
          data: {
            eventType,
            filename,
            path: watchPath
          },
          timestamp: Date.now()
        });
      }, this.debounceMs);
    });

    console.log(`[FileWatcherTrigger] Watching: ${watchPath}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  isActive(): boolean {
    return this.watcher !== null;
  }
}

/**
 * Polling trigger - triggers at regular intervals by checking a condition
 */
class PollingTrigger implements Trigger {
  id: string;
  type: TriggerType = 'event';
  config: TriggerConfig;
  private interval: NodeJS.Timeout | null = null;
  private callback: TriggerCallback;
  private checker: () => Promise<boolean>;
  private lastValue: any = undefined;

  constructor(
    config: TriggerConfig,
    callback: TriggerCallback,
    checker: () => Promise<boolean>
  ) {
    this.id = config.id;
    this.config = config;
    this.callback = callback;
    this.checker = checker;
  }

  start(): void {
    const intervalMs = this.config.config.intervalMs || 60000;

    this.interval = setInterval(async () => {
      try {
        const shouldTrigger = await this.checker();
        if (shouldTrigger) {
          this.callback({
            type: 'event',
            triggerId: this.id,
            data: { checked: true },
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error(`[PollingTrigger] Check failed:`, error);
      }
    }, intervalMs);

    console.log(`[PollingTrigger] Started with interval: ${intervalMs}ms`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  isActive(): boolean {
    return this.interval !== null;
  }
}

/**
 * Event trigger - triggers on custom events
 */
class EventTrigger implements Trigger {
  id: string;
  type: TriggerType = 'event';
  config: TriggerConfig;
  private callback: TriggerCallback;
  private active: boolean = false;

  constructor(config: TriggerConfig, callback: TriggerCallback) {
    this.id = config.id;
    this.config = config;
    this.callback = callback;
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  // Called externally to fire the trigger
  fire(data: any): void {
    if (!this.active) return;

    this.callback({
      type: 'event',
      triggerId: this.id,
      data,
      timestamp: Date.now()
    });
  }
}

export class TriggerEngine {
  private triggers: Map<string, Trigger> = new Map();
  private taskQueue: TaskQueue;
  private eventListeners: Map<string, Set<TriggerCallback>> = new Map();

  constructor(taskQueue?: TaskQueue) {
    this.taskQueue = taskQueue || getTaskQueue();
  }

  /**
   * Register a trigger
   */
  registerTrigger(config: TriggerConfig): string {
    let trigger: Trigger;

    const callback: TriggerCallback = (event) => {
      this.handleTriggerEvent(config, event);
    };

    switch (config.type) {
      case 'file':
        trigger = new FileWatcherTrigger(config, callback);
        break;
      
      case 'event':
        trigger = new EventTrigger(config, callback);
        break;
      
      default:
        throw new Error(`Unknown trigger type: ${config.type}`);
    }

    this.triggers.set(config.id, trigger);

    if (config.enabled) {
      trigger.start();
    }

    console.log(`[TriggerEngine] Registered trigger: ${config.id} (${config.type})`);
    return config.id;
  }

  /**
   * Create a file watcher trigger
   */
  createFileWatcher(
    taskId: string,
    watchPath: string,
    options: {
      pattern?: string;
      recursive?: boolean;
      debounceMs?: number;
    } = {}
  ): string {
    const config: TriggerConfig = {
      id: generateId(),
      type: 'file',
      taskId,
      enabled: true,
      config: {
        path: watchPath,
        ...options
      },
      createdAt: Date.now()
    };

    return this.registerTrigger(config);
  }

  /**
   * Create a polling trigger
   */
  createPollingTrigger(
    taskId: string,
    checker: () => Promise<boolean>,
    intervalMs: number = 60000
  ): string {
    const config: TriggerConfig = {
      id: generateId(),
      type: 'event',
      taskId,
      enabled: true,
      config: {
        intervalMs
      },
      createdAt: Date.now()
    };

    const callback: TriggerCallback = (event) => {
      this.handleTriggerEvent(config, event);
    };

    const trigger = new PollingTrigger(config, callback, checker);
    this.triggers.set(config.id, trigger);
    trigger.start();

    console.log(`[TriggerEngine] Created polling trigger: ${config.id}`);
    return config.id;
  }

  /**
   * Create an event-based trigger
   */
  createEventTrigger(taskId: string, eventName: string): string {
    const config: TriggerConfig = {
      id: generateId(),
      type: 'event',
      taskId,
      enabled: true,
      config: {
        eventName
      },
      createdAt: Date.now()
    };

    const trigger = new EventTrigger(config, (event) => {
      this.handleTriggerEvent(config, event);
    });

    this.triggers.set(config.id, trigger);
    trigger.start();

    // Register event listener
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add((event) => {
      (trigger as EventTrigger).fire(event);
    });

    console.log(`[TriggerEngine] Created event trigger: ${config.id} for event: ${eventName}`);
    return config.id;
  }

  /**
   * Emit a custom event
   */
  emit(eventName: string, data: any): void {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      for (const listener of listeners) {
        listener({
          type: 'event',
          triggerId: '',
          data: { eventName, ...data },
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Handle trigger event
   */
  private handleTriggerEvent(config: TriggerConfig, event: TriggerEvent): void {
    console.log(`[TriggerEngine] Trigger fired: ${config.id}`);
    
    // Update trigger stats
    config.lastTriggeredAt = event.timestamp;

    // Enqueue the associated task
    if (config.taskId) {
      try {
        const run = this.taskQueue.enqueue(config.taskId, config.type);
        console.log(`[TriggerEngine] Task enqueued: ${run.id}`);
      } catch (error) {
        console.error(`[TriggerEngine] Failed to enqueue task:`, error);
      }
    }
  }

  /**
   * Unregister a trigger
   */
  unregisterTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;

    trigger.stop();
    this.triggers.delete(triggerId);

    console.log(`[TriggerEngine] Unregistered trigger: ${triggerId}`);
    return true;
  }

  /**
   * Enable a trigger
   */
  enableTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;

    if (!trigger.isActive()) {
      trigger.start();
      trigger.config.enabled = true;
    }
    return true;
  }

  /**
   * Disable a trigger
   */
  disableTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;

    if (trigger.isActive()) {
      trigger.stop();
      trigger.config.enabled = false;
    }
    return true;
  }

  /**
   * Get trigger info
   */
  getTrigger(triggerId: string): TriggerConfig | undefined {
    return this.triggers.get(triggerId)?.config;
  }

  /**
   * Get all triggers
   */
  getAllTriggers(): TriggerConfig[] {
    return Array.from(this.triggers.values()).map(t => t.config);
  }

  /**
   * Get triggers for a task
   */
  getTriggersForTask(taskId: string): TriggerConfig[] {
    return this.getAllTriggers().filter(t => t.taskId === taskId);
  }

  /**
   * Stop all triggers
   */
  stopAll(): void {
    for (const trigger of this.triggers.values()) {
      trigger.stop();
    }
    console.log('[TriggerEngine] All triggers stopped');
  }

  /**
   * Start all enabled triggers
   */
  startAll(): void {
    for (const trigger of this.triggers.values()) {
      if (trigger.config.enabled && !trigger.isActive()) {
        trigger.start();
      }
    }
    console.log('[TriggerEngine] All enabled triggers started');
  }
}

// Singleton instance
let triggerEngineInstance: TriggerEngine | null = null;

export function getTriggerEngine(): TriggerEngine {
  if (!triggerEngineInstance) {
    triggerEngineInstance = new TriggerEngine();
  }
  return triggerEngineInstance;
}

export default TriggerEngine;
