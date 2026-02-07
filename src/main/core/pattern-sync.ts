/**
 * AgentPrime - Pattern Synchronization
 * Synchronizes patterns across team members with version control
 */

import { getTeamMirror } from './team-mirror';
import type { TeamPattern } from './team-mirror';

/**
 * Sync event
 */
export interface SyncEvent {
  type: 'pattern-added' | 'pattern-updated' | 'pattern-deleted' | 'conflict';
  patternId: string;
  teamId: string;
  userId: string;
  timestamp: number;
  data?: any;
}

/**
 * Pattern Sync - Synchronizes patterns across team
 */
export class PatternSync {
  private syncQueue: SyncEvent[] = [];
  private syncListeners: Map<string, (event: SyncEvent) => void> = new Map();
  private isSyncing: boolean = false;
  private lastSyncTime: number = 0;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(private syncIntervalMs: number = 5000) {
    this.startAutoSync();
  }

  /**
   * Start automatic synchronization
   */
  private startAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (!this.isSyncing && this.syncQueue.length > 0) {
        // Get teamId from the first queued event
        const teamId = this.syncQueue[0]?.teamId;
        if (teamId) {
          this.sync(teamId).catch(error => {
            console.warn('[PatternSync] Auto-sync failed:', error);
          });
        }
      }
    }, this.syncIntervalMs);
  }

  /**
   * Synchronize patterns with team
   */
  async sync(teamId: string): Promise<{
    synced: number;
    conflicts: number;
    updates: SyncEvent[];
  }> {
    if (this.isSyncing) {
      console.log('[PatternSync] Sync already in progress, skipping');
      return { synced: 0, conflicts: 0, updates: [] };
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      console.log(`[PatternSync] Starting sync for team ${teamId}`);

      // Process sync queue
      const events = [...this.syncQueue];
      this.syncQueue = [];

      let synced = 0;
      let conflicts = 0;
      const updates: SyncEvent[] = [];

      const teamMirror = getTeamMirror(teamId);

      for (const event of events) {
        try {
          switch (event.type) {
            case 'pattern-added':
            case 'pattern-updated':
              // Sync pattern to team
              const pattern = event.data as TeamPattern;
              const result = await teamMirror.sharePatterns(
                teamId,
                [pattern],
                event.userId,
                pattern.visibility
              );
              synced += result.shared;
              conflicts += result.conflicts.length;
              updates.push(event);
              break;

            case 'pattern-deleted':
              // Handle deletion (would need backend support)
              updates.push(event);
              break;

            case 'conflict':
              conflicts++;
              updates.push(event);
              break;
          }
        } catch (error: any) {
          console.warn(`[PatternSync] Failed to sync event ${event.type}:`, error.message);
        }
      }

      this.lastSyncTime = Date.now();
      const duration = Date.now() - startTime;

      console.log(`[PatternSync] Sync complete: ${synced} synced, ${conflicts} conflicts (${duration}ms)`);

      // Notify listeners
      for (const event of updates) {
        this.notifyListeners(event);
      }

      return { synced, conflicts, updates };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Queue pattern for synchronization
   */
  queuePatternSync(
    pattern: TeamPattern,
    userId: string,
    type: 'pattern-added' | 'pattern-updated' = 'pattern-added'
  ): void {
    const event: SyncEvent = {
      type,
      patternId: pattern.id || '',
      teamId: pattern.teamId,
      userId,
      timestamp: Date.now(),
      data: pattern
    };

    this.syncQueue.push(event);
    console.log(`[PatternSync] Queued ${type} for pattern ${pattern.id}`);
  }

  /**
   * Real-time pattern updates (WebSocket in production)
   */
  onPatternUpdate(
    teamId: string,
    callback: (event: SyncEvent) => void
  ): () => void {
    const listenerId = `${teamId}-${Date.now()}`;
    this.syncListeners.set(listenerId, callback);

    // Return unsubscribe function
    return () => {
      this.syncListeners.delete(listenerId);
    };
  }

  /**
   * Version control for pattern evolution
   */
  async getPatternVersions(
    teamId: string,
    patternId: string
  ): Promise<TeamPattern[]> {
    const teamMirror = getTeamMirror(teamId);
    const patterns = await teamMirror.getTeamPatterns(teamId);
    const pattern = patterns.find(p => p.id === patternId);

    if (!pattern) return [];

    const versions: TeamPattern[] = [pattern];

    // Add previous versions
    if (pattern.previousVersions) {
      versions.push(...pattern.previousVersions);
    }

    return versions.sort((a, b) => b.version - a.version);
  }

  /**
   * Rollback to previous pattern version
   */
  async rollbackPattern(
    teamId: string,
    patternId: string,
    version: number,
    userId: string
  ): Promise<boolean> {
    const versions = await this.getPatternVersions(teamId, patternId);
    const targetVersion = versions.find(v => v.version === version);

    if (!targetVersion) {
      return false;
    }

    // Create new version from old one
    const rolledBack: TeamPattern = {
      ...targetVersion,
      version: versions[0].version + 1, // Increment version
      sharedAt: Date.now(),
      userId,
      previousVersions: versions.slice(0, 1) // Current version becomes previous
    };

    // Queue sync
    this.queuePatternSync(rolledBack, userId, 'pattern-updated');

    return true;
  }

  /**
   * Notify listeners of sync events
   */
  private notifyListeners(event: SyncEvent): void {
    for (const listener of this.syncListeners.values()) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[PatternSync] Listener error:', error);
      }
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    queueSize: number;
    isSyncing: boolean;
    lastSyncTime: number;
    listeners: number;
  } {
    return {
      queueSize: this.syncQueue.length,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      listeners: this.syncListeners.size
    };
  }

  /**
   * Stop auto-sync
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Singleton instance
let patternSyncInstance: PatternSync | null = null;

export function getPatternSync(): PatternSync {
  if (!patternSyncInstance) {
    patternSyncInstance = new PatternSync();
  }
  return patternSyncInstance;
}

