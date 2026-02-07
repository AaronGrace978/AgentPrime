/**
 * AgentPrime - Cloud Sync Types
 * Cross-device synchronization with conflict resolution
 */

export interface SyncDevice {
  id: string;
  name: string;
  platform: 'windows' | 'macos' | 'linux' | 'web';
  version: string;
  lastSync: number;
  status: 'online' | 'offline' | 'syncing';
  capabilities: DeviceCapabilities;
}

export interface DeviceCapabilities {
  supportsRealTime: boolean;
  supportsLargeFiles: boolean;
  supportsEncryption: boolean;
  maxFileSize: number;
}

export interface SyncSession {
  id: string;
  deviceId: string;
  userId: string;
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'failed';
  stats: SyncStats;
}

export interface SyncStats {
  filesSynced: number;
  bytesTransferred: number;
  conflictsResolved: number;
  errors: number;
  duration: number;
}

export interface SyncItem {
  id: string;
  path: string;
  type: 'file' | 'folder' | 'settings' | 'preferences';
  lastModified: number;
  size: number;
  hash: string;
  version: number;
  deviceId: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
}

export interface SyncConflict {
  id: string;
  itemId: string;
  path: string;
  type: 'content' | 'deletion' | 'move' | 'metadata';
  conflictingVersions: SyncItem[];
  resolution?: ConflictResolution;
  detectedAt: number;
  resolvedAt?: number;
}

export interface ConflictResolution {
  strategy: 'manual' | 'automatic' | 'keep-local' | 'keep-remote' | 'merge';
  resolvedBy: 'user' | 'system';
  resolvedItem?: SyncItem;
  timestamp: number;
}

export interface CloudStorage {
  provider: 'dropbox' | 'google-drive' | 'onedrive' | 'aws-s3' | 'azure-blob';
  accountId: string;
  accountName: string;
  quota: {
    used: number;
    total: number;
  };
  connected: boolean;
  lastSync: number;
}

export interface SyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number; // minutes
  conflictResolution: 'manual' | 'automatic' | 'keep-local' | 'keep-remote';
  excludedPaths: string[];
  maxFileSize: number;
  bandwidthLimit?: number; // KB/s
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface SyncQueue {
  pending: SyncItem[];
  inProgress: SyncItem[];
  completed: SyncItem[];
  failed: SyncItem[];
}

export interface BackupSnapshot {
  id: string;
  timestamp: number;
  deviceId: string;
  items: SyncItem[];
  totalSize: number;
  compressed: boolean;
  encrypted: boolean;
}

export interface SyncEvent {
  type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'conflict_detected' | 'conflict_resolved' | 'device_connected' | 'device_disconnected' | 'cloud_connected' | 'backup_restored';
  deviceId: string;
  data: any;
  timestamp: number;
}
