/**
 * AgentPrime - Collaboration Engine Types
 * Real-time collaborative editing and session management
 */

export interface UserPresence {
  userId: string;
  username: string;
  avatar?: string;
  color: string;
  cursor?: CursorPosition;
  lastActive: number;
  status: 'online' | 'away' | 'offline';
}

export interface CursorPosition {
  line: number;
  column: number;
  file: string;
}

export interface CollaborationSession {
  id: string;
  name: string;
  workspace: string;
  participants: UserPresence[];
  createdAt: number;
  lastActivity: number;
  settings: SessionSettings;
  permissions: SessionPermissions;
}

export interface SessionSettings {
  allowAnonymous: boolean;
  requireApproval: boolean;
  maxParticipants: number;
  autoSave: boolean;
  conflictResolution: 'manual' | 'automatic' | 'last-writer-wins';
  realTimeSync: boolean;
}

export interface SessionPermissions {
  canEdit: string[]; // user IDs
  canInvite: string[]; // user IDs
  canKick: string[]; // user IDs
  isOwner: string; // user ID
}

export interface DocumentChange {
  id: string;
  sessionId: string;
  userId: string;
  filePath: string;
  type: 'insert' | 'delete' | 'replace';
  position: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  content: string;
  timestamp: number;
  version: number;
}

export interface ConflictResolution {
  conflictId: string;
  sessionId: string;
  filePath: string;
  conflictingChanges: DocumentChange[];
  resolved: boolean;
  resolution?: {
    acceptedChange: string; // change ID
    mergedContent?: string;
    resolvedBy: string; // user ID
    timestamp: number;
  };
}

export interface CollaborationEvent {
  type: 'session_created' | 'user_joined' | 'user_left' | 'file_opened' | 'file_closed' | 'change_made' | 'conflict_detected' | 'conflict_resolved' | 'presence_updated' | 'session_expired';
  sessionId: string;
  userId: string;
  data: any;
  timestamp: number;
}

export interface SharedWorkspace {
  id: string;
  name: string;
  description?: string;
  owner: string;
  collaborators: string[];
  files: SharedFile[];
  sessions: CollaborationSession[];
  createdAt: number;
  lastModified: number;
  permissions: WorkspacePermissions;
}

export interface SharedFile {
  path: string;
  lastModified: number;
  version: number;
  lockedBy?: string; // user ID
  collaborators: string[];
}

export interface WorkspacePermissions {
  public: boolean;
  allowForking: boolean;
  requireApproval: boolean;
  collaboratorRoles: {
    [userId: string]: 'viewer' | 'editor' | 'admin';
  };
}

export interface CollaborationConfig {
  maxSessionsPerUser: number;
  sessionTimeout: number; // minutes
  maxFileSize: number; // bytes
  backupInterval: number; // minutes
  enableRealTimeSync: boolean;
  conflictResolutionStrategy: 'manual' | 'automatic' | 'last-writer-wins';
}
