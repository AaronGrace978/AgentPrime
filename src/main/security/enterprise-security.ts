/**
 * AgentPrime - Enterprise Security Manager
 * Comprehensive security controls for enterprise deployments
 */

import * as crypto from 'crypto';
import * as os from 'os';
import { getSecureKeyStorage } from './secureKeyStorage';

/**
 * Security policy configuration
 */
export interface SecurityPolicy {
  requireEncryption: boolean;
  requireAuthentication: boolean;
  requireAuthorization: boolean;
  enableAuditLogging: boolean;
  enableRateLimiting: boolean;
  maxFailedAttempts: number;
  lockoutDuration: number; // milliseconds
  sessionTimeout: number; // milliseconds
  requireTLS: boolean;
  allowedOrigins: string[];
}

/**
 * User role and permissions
 */
export interface UserRole {
  id: string;
  name: string;
  permissions: string[];
}

/**
 * Access control entry
 */
export interface AccessControlEntry {
  userId: string;
  role: string;
  resource: string;
  action: string;
  allowed: boolean;
}

/**
 * Enterprise Security Manager
 */
export class EnterpriseSecurityManager {
  private policy: SecurityPolicy;
  private roles: Map<string, UserRole> = new Map();
  private accessControl: Map<string, AccessControlEntry[]> = new Map();
  private failedAttempts: Map<string, { count: number; lockedUntil: number }> = new Map();
  private activeSessions: Map<string, { userId: string; expiresAt: number }> = new Map();

  constructor(policy?: Partial<SecurityPolicy>) {
    this.policy = {
      requireEncryption: true,
      requireAuthentication: true,
      requireAuthorization: true,
      enableAuditLogging: true,
      enableRateLimiting: true,
      maxFailedAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      sessionTimeout: 60 * 60 * 1000, // 1 hour
      requireTLS: true,
      allowedOrigins: ['http://localhost:3000', 'http://localhost:5173'],
      ...policy
    };

    this.initializeDefaultRoles();
  }

  /**
   * Initialize default roles
   */
  private initializeDefaultRoles(): void {
    // Admin role
    this.roles.set('admin', {
      id: 'admin',
      name: 'Administrator',
      permissions: ['*'] // All permissions
    });

    // Developer role
    this.roles.set('developer', {
      id: 'developer',
      name: 'Developer',
      permissions: [
        'code:read',
        'code:write',
        'ai:use',
        'files:read',
        'files:write',
        'refactor:execute'
      ]
    });

    // Viewer role
    this.roles.set('viewer', {
      id: 'viewer',
      name: 'Viewer',
      permissions: [
        'code:read',
        'files:read'
      ]
    });
  }

  /**
   * Authenticate user
   */
  async authenticate(
    userId: string,
    credentials: { password?: string; token?: string }
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    // Check if account is locked
    const lockStatus = this.checkLockStatus(userId);
    if (lockStatus.locked) {
      return {
        success: false,
        error: `Account locked until ${lockStatus.lockedUntil ? new Date(lockStatus.lockedUntil).toISOString() : 'unknown'}`
      };
    }

    // Verify credentials
    const isValid = await this.verifyCredentials(userId, credentials);

    if (!isValid) {
      // Record failed attempt
      this.recordFailedAttempt(userId);
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }

    // Clear failed attempts on success
    this.failedAttempts.delete(userId);

    // Create session
    const sessionId = this.createSession(userId);

    return {
      success: true,
      sessionId
    };
  }

  /**
   * Authorize action
   */
  async authorize(
    userId: string,
    resource: string,
    action: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.policy.requireAuthorization) {
      return { allowed: true };
    }

    // Get user role
    const userRole = await this.getUserRole(userId);
    if (!userRole) {
      return { allowed: false, reason: 'User role not found' };
    }

    // Check permissions
    const permission = `${resource}:${action}`;
    const hasPermission = userRole.permissions.includes('*') || userRole.permissions.includes(permission);

    if (!hasPermission) {
      return {
        allowed: false,
        reason: `User does not have permission: ${permission}`
      };
    }

    return { allowed: true };
  }

  /**
   * Encrypt sensitive data
   */
  async encryptData(data: string, keyId?: string): Promise<string> {
    if (!this.policy.requireEncryption) {
      return data;
    }

    const key = await this.getEncryptionKey(keyId);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return IV + auth tag + encrypted data
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(encryptedData: string, keyId?: string): Promise<string> {
    if (!this.policy.requireEncryption) {
      return encryptedData;
    }

    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = await this.getEncryptionKey(keyId);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Validate session
   */
  validateSession(sessionId: string): { valid: boolean; userId?: string; error?: string } {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return { valid: false, error: 'Session not found' };
    }

    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      return { valid: false, error: 'Session expired' };
    }

    return { valid: true, userId: session.userId };
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(
    userId: string,
    action: string,
    limit: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetAt: number } {
    if (!this.policy.enableRateLimiting) {
      return { allowed: true, remaining: limit, resetAt: Date.now() + windowMs };
    }

    const key = `${userId}:${action}`;
    // In production, would use Redis or similar for distributed rate limiting
    // For now, simplified in-memory tracking

    return { allowed: true, remaining: limit, resetAt: Date.now() + windowMs };
  }

  /**
   * Verify credentials
   */
  private async verifyCredentials(
    userId: string,
    credentials: { password?: string; token?: string }
  ): Promise<boolean> {
    // In production, would verify against database
    // For now, simplified check
    if (credentials.token) {
      // Verify JWT token
      return this.verifyToken(credentials.token);
    }

    if (credentials.password) {
      // Verify password hash
      return this.verifyPassword(userId, credentials.password);
    }

    return false;
  }

  /**
   * Verify token
   */
  private verifyToken(token: string): boolean {
    // Simplified token verification
    // In production, would use JWT library
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.exp > Date.now() / 1000;
    } catch {
      return false;
    }
  }

  /**
   * Verify password
   */
  private async verifyPassword(userId: string, password: string): Promise<boolean> {
    const keyStorage = getSecureKeyStorage();
    const storedHash = await keyStorage.getSecret(`user-password-hash:${userId}`);
    if (!storedHash) {
      return false;
    }
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
  }

  /**
   * Get user role
   */
  private async getUserRole(userId: string): Promise<UserRole | null> {
    // In production, would query database
    // For now, return default developer role
    return this.roles.get('developer') || null;
  }

  /**
   * Create session
   */
  private createSession(userId: string): string {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.policy.sessionTimeout;

    this.activeSessions.set(sessionId, { userId, expiresAt });

    return sessionId;
  }

  /**
   * Check lock status
   */
  private checkLockStatus(userId: string): { locked: boolean; lockedUntil?: number } {
    const attempt = this.failedAttempts.get(userId);

    if (!attempt) {
      return { locked: false };
    }

    if (Date.now() < attempt.lockedUntil) {
      return { locked: true, lockedUntil: attempt.lockedUntil };
    }

    // Lock expired, clear it
    this.failedAttempts.delete(userId);
    return { locked: false };
  }

  /**
   * Record failed attempt
   */
  private recordFailedAttempt(userId: string): void {
    const attempt = this.failedAttempts.get(userId) || { count: 0, lockedUntil: 0 };

    attempt.count++;

    if (attempt.count >= this.policy.maxFailedAttempts) {
      attempt.lockedUntil = Date.now() + this.policy.lockoutDuration;
    }

    this.failedAttempts.set(userId, attempt);
  }

  /**
   * Get encryption key
   */
  private async getEncryptionKey(keyId?: string): Promise<Buffer> {
    // In production, would retrieve from secure key storage (OS keychain)
    // For now, use a derived key
    const keyStorage = getSecureKeyStorage();
    const masterKey = await keyStorage.getSecret('encryption-master') || 'default-master-key-change-in-production';
    return crypto.createHash('sha256').update(masterKey).digest();
  }

  /**
   * Validate origin
   */
  validateOrigin(origin: string): boolean {
    if (!this.policy.allowedOrigins.length) {
      return true; // No restrictions
    }

    return this.policy.allowedOrigins.includes(origin);
  }

  /**
   * Get security statistics
   */
  getStats(): {
    activeSessions: number;
    lockedAccounts: number;
    totalRoles: number;
    policy: SecurityPolicy;
  } {
    const lockedAccounts = Array.from(this.failedAttempts.values())
      .filter(a => Date.now() < a.lockedUntil).length;

    return {
      activeSessions: this.activeSessions.size,
      lockedAccounts,
      totalRoles: this.roles.size,
      policy: this.policy
    };
  }
}

// Singleton instance
let enterpriseSecurityInstance: EnterpriseSecurityManager | null = null;

export function getEnterpriseSecurityManager(): EnterpriseSecurityManager {
  if (!enterpriseSecurityInstance) {
    enterpriseSecurityInstance = new EnterpriseSecurityManager();
  }
  return enterpriseSecurityInstance;
}

/**
 * Simple encryption helper using crypto module
 * For plugin data encryption
 */

// In production, require ENCRYPTION_SECRET to be set
if (!process.env.ENCRYPTION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_SECRET environment variable is required in production mode');
}

const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.ENCRYPTION_SECRET || 'agentprime-dev-key-not-for-production',
  'salt',
  32
);
const IV_LENGTH = 16;

export const enterpriseSecurity = {
  /**
   * Encrypt a buffer
   */
  encrypt(data: Buffer): Buffer<ArrayBuffer> {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, encrypted]) as Buffer<ArrayBuffer>;
  },

  /**
   * Decrypt a buffer
   */
  decrypt(data: Buffer): Buffer<ArrayBuffer> {
    const iv = data.subarray(0, IV_LENGTH);
    const encrypted = data.subarray(IV_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]) as Buffer<ArrayBuffer>;
  }
};

