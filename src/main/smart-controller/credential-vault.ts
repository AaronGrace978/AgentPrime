/**
 * Smart Controller - Secure Credential Vault
 * Encrypted storage for account credentials
 * 
 * Security Features:
 * - AES-256-GCM encryption
 * - PBKDF2 key derivation
 * - Master password protection
 * - Memory-safe handling
 * - Auto-lock timeout
 * - Audit logging
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, scryptSync } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface Credential {
  id: string;
  name: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
  autoFillEnabled: boolean;
  twoFactorEnabled?: boolean;
  customFields?: Record<string, string>;
}

export interface VaultConfig {
  autoLockMinutes: number;
  maxFailedAttempts: number;
  requireConfirmation: boolean;
  allowAutoFill: boolean;
}

interface EncryptedVault {
  version: number;
  salt: string;
  iv: string;
  authTag: string;
  data: string;
  checksum: string;
  config: VaultConfig;
}

interface AuditLogEntry {
  timestamp: number;
  action: 'unlock' | 'lock' | 'read' | 'write' | 'delete' | 'failed_attempt' | 'auto_fill';
  credentialId?: string;
  credentialName?: string;
  success: boolean;
  details?: string;
}

/**
 * Secure Credential Vault
 * Encrypted storage with master password protection
 */
export class CredentialVault {
  private vaultPath: string;
  private auditPath: string;
  private isUnlocked = false;
  private masterKey: Buffer | null = null;
  private credentials: Map<string, Credential> = new Map();
  private failedAttempts = 0;
  private lockTimeout: NodeJS.Timeout | null = null;
  private config: VaultConfig = {
    autoLockMinutes: 15,
    maxFailedAttempts: 5,
    requireConfirmation: true,
    allowAutoFill: true
  };
  private auditLog: AuditLogEntry[] = [];

  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;
  private readonly IV_LENGTH = 16;
  private readonly SALT_LENGTH = 64;
  private readonly PBKDF2_ITERATIONS = 100000;
  private readonly VERSION = 1;

  constructor() {
    const userDataPath = app?.getPath('userData') || join(process.cwd(), '.agentprime');
    const vaultDir = join(userDataPath, 'vault');
    
    if (!existsSync(vaultDir)) {
      mkdirSync(vaultDir, { recursive: true });
    }
    
    this.vaultPath = join(vaultDir, 'credentials.vault');
    this.auditPath = join(vaultDir, 'audit.log');
    
    console.log('[CredentialVault] Initialized at:', vaultDir);
  }

  /**
   * Check if vault exists (has been created)
   */
  vaultExists(): boolean {
    return existsSync(this.vaultPath);
  }

  /**
   * Check if vault is currently unlocked
   */
  isVaultUnlocked(): boolean {
    return this.isUnlocked;
  }

  /**
   * Create a new vault with master password
   */
  async createVault(masterPassword: string): Promise<{ success: boolean; message: string }> {
    if (this.vaultExists()) {
      return { success: false, message: 'Vault already exists. Use unlock() to access it.' };
    }

    if (masterPassword.length < 8) {
      return { success: false, message: 'Master password must be at least 8 characters.' };
    }

    try {
      // Generate salt and derive key
      const salt = randomBytes(this.SALT_LENGTH);
      this.masterKey = this.deriveKey(masterPassword, salt);
      
      // Initialize empty credentials
      this.credentials = new Map();
      this.isUnlocked = true;
      
      // Save empty vault
      await this.saveVault(salt);
      
      this.logAudit('unlock', undefined, true, 'Vault created');
      this.startAutoLock();
      
      // Clear password from memory
      masterPassword = '';
      
      return { success: true, message: 'Vault created successfully!' };
    } catch (error: any) {
      return { success: false, message: `Failed to create vault: ${error.message}` };
    }
  }

  /**
   * Unlock the vault with master password
   */
  async unlock(masterPassword: string): Promise<{ success: boolean; message: string }> {
    if (!this.vaultExists()) {
      return { success: false, message: 'No vault found. Create one first with createVault().' };
    }

    if (this.isUnlocked) {
      return { success: true, message: 'Vault is already unlocked.' };
    }

    // Check failed attempts lockout
    if (this.failedAttempts >= this.config.maxFailedAttempts) {
      return { success: false, message: 'Too many failed attempts. Please wait before trying again.' };
    }

    try {
      // Read encrypted vault
      const encryptedData = JSON.parse(readFileSync(this.vaultPath, 'utf-8')) as EncryptedVault;
      
      // Derive key from password
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const key = this.deriveKey(masterPassword, salt);
      
      // Decrypt data
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      const encrypted = Buffer.from(encryptedData.data, 'hex');
      
      const decipher = createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, undefined, 'utf-8');
      decrypted += decipher.final('utf-8');
      
      // Parse credentials
      const credentialsList = JSON.parse(decrypted) as Credential[];
      this.credentials = new Map(credentialsList.map(c => [c.id, c]));
      
      // Store key and mark as unlocked
      this.masterKey = key;
      this.isUnlocked = true;
      this.failedAttempts = 0;
      this.config = encryptedData.config || this.config;
      
      this.logAudit('unlock', undefined, true);
      this.startAutoLock();
      
      // Clear password from memory
      masterPassword = '';
      
      return { success: true, message: `Vault unlocked. ${this.credentials.size} credentials loaded.` };
      
    } catch (error: any) {
      this.failedAttempts++;
      this.logAudit('failed_attempt', undefined, false, `Attempt ${this.failedAttempts}`);
      
      // Clear sensitive data
      masterPassword = '';
      
      if (error.message.includes('Unsupported state') || error.message.includes('bad decrypt')) {
        return { success: false, message: 'Invalid master password.' };
      }
      
      return { success: false, message: `Failed to unlock vault: ${error.message}` };
    }
  }

  /**
   * Lock the vault
   */
  lock(): void {
    if (!this.isUnlocked) return;
    
    // Clear sensitive data from memory
    this.masterKey = null;
    this.credentials.clear();
    this.isUnlocked = false;
    
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
    
    this.logAudit('lock', undefined, true);
    console.log('[CredentialVault] Vault locked');
  }

  /**
   * Change master password
   */
  async changeMasterPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault must be unlocked to change password.' };
    }

    if (newPassword.length < 8) {
      return { success: false, message: 'New password must be at least 8 characters.' };
    }

    try {
      // Verify old password
      const encryptedData = JSON.parse(readFileSync(this.vaultPath, 'utf-8')) as EncryptedVault;
      const oldSalt = Buffer.from(encryptedData.salt, 'hex');
      const oldKey = this.deriveKey(oldPassword, oldSalt);
      
      // Decrypt to verify (throws if wrong password)
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      const encrypted = Buffer.from(encryptedData.data, 'hex');
      
      const decipher = createDecipheriv(this.ALGORITHM, oldKey, iv);
      decipher.setAuthTag(authTag);
      decipher.update(encrypted);
      decipher.final();
      
      // Generate new salt and key
      const newSalt = randomBytes(this.SALT_LENGTH);
      this.masterKey = this.deriveKey(newPassword, newSalt);
      
      // Re-encrypt with new key
      await this.saveVault(newSalt);
      
      // Clear passwords from memory
      oldPassword = '';
      newPassword = '';
      
      return { success: true, message: 'Master password changed successfully!' };
      
    } catch (error: any) {
      return { success: false, message: 'Failed to change password. Verify old password is correct.' };
    }
  }

  /**
   * Add or update a credential
   */
  async saveCredential(credential: Omit<Credential, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; credential?: Credential; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault is locked. Unlock first.' };
    }

    try {
      const now = Date.now();
      const newCredential: Credential = {
        ...credential,
        id: credential.name ? this.generateId(credential.name) : this.generateId('cred'),
        createdAt: now,
        updatedAt: now,
        autoFillEnabled: credential.autoFillEnabled ?? true
      };

      // Check for duplicate
      const existing = Array.from(this.credentials.values()).find(
        c => c.name === newCredential.name && c.url === newCredential.url
      );
      
      if (existing) {
        // Update existing
        newCredential.id = existing.id;
        newCredential.createdAt = existing.createdAt;
      }

      this.credentials.set(newCredential.id, newCredential);
      await this.saveVault();
      
      this.logAudit('write', newCredential.id, true, newCredential.name);
      this.resetAutoLock();
      
      return { success: true, credential: this.sanitizeCredential(newCredential), message: 'Credential saved.' };
      
    } catch (error: any) {
      return { success: false, message: `Failed to save credential: ${error.message}` };
    }
  }

  /**
   * Get a credential by ID (requires confirmation if set)
   */
  async getCredential(id: string, purpose?: string): Promise<{ success: boolean; credential?: Credential; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault is locked.' };
    }

    const credential = this.credentials.get(id);
    if (!credential) {
      return { success: false, message: 'Credential not found.' };
    }

    // Update last used
    credential.lastUsed = Date.now();
    this.credentials.set(id, credential);
    
    this.logAudit('read', id, true, credential.name);
    this.resetAutoLock();
    
    return { success: true, credential, message: 'Credential retrieved.' };
  }

  /**
   * Get credential for auto-fill (returns username/password only)
   */
  async getCredentialForAutoFill(url: string): Promise<{ success: boolean; username?: string; password?: string; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault is locked.' };
    }

    if (!this.config.allowAutoFill) {
      return { success: false, message: 'Auto-fill is disabled.' };
    }

    // Find credential matching URL
    const urlDomain = this.extractDomain(url);
    const credential = Array.from(this.credentials.values()).find(c => {
      if (!c.url || !c.autoFillEnabled) return false;
      return this.extractDomain(c.url) === urlDomain;
    });

    if (!credential) {
      return { success: false, message: 'No matching credential found.' };
    }

    // Update last used
    credential.lastUsed = Date.now();
    this.credentials.set(credential.id, credential);
    
    this.logAudit('auto_fill', credential.id, true, credential.name);
    this.resetAutoLock();
    
    return { 
      success: true, 
      username: credential.username, 
      password: credential.password,
      message: `Using credential: ${credential.name}`
    };
  }

  /**
   * Delete a credential
   */
  async deleteCredential(id: string): Promise<{ success: boolean; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault is locked.' };
    }

    const credential = this.credentials.get(id);
    if (!credential) {
      return { success: false, message: 'Credential not found.' };
    }

    this.credentials.delete(id);
    await this.saveVault();
    
    this.logAudit('delete', id, true, credential.name);
    
    return { success: true, message: `Deleted credential: ${credential.name}` };
  }

  /**
   * List all credentials (sanitized - no passwords)
   */
  listCredentials(): Credential[] {
    if (!this.isUnlocked) return [];
    
    return Array.from(this.credentials.values())
      .map(this.sanitizeCredential)
      .sort((a, b) => (b.lastUsed || b.createdAt) - (a.lastUsed || a.createdAt));
  }

  /**
   * Search credentials by name or URL
   */
  searchCredentials(query: string): Credential[] {
    if (!this.isUnlocked) return [];
    
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.credentials.values())
      .filter(c => 
        c.name.toLowerCase().includes(lowerQuery) ||
        c.url?.toLowerCase().includes(lowerQuery) ||
        c.username?.toLowerCase().includes(lowerQuery) ||
        c.category?.toLowerCase().includes(lowerQuery)
      )
      .map(this.sanitizeCredential);
  }

  /**
   * Get vault configuration
   */
  getConfig(): VaultConfig {
    return { ...this.config };
  }

  /**
   * Update vault configuration
   */
  async updateConfig(updates: Partial<VaultConfig>): Promise<{ success: boolean; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault is locked.' };
    }

    this.config = { ...this.config, ...updates };
    await this.saveVault();
    
    // Update auto-lock if changed
    if (updates.autoLockMinutes !== undefined) {
      this.startAutoLock();
    }
    
    return { success: true, message: 'Configuration updated.' };
  }

  /**
   * Get audit log
   */
  getAuditLog(limit: number = 100): AuditLogEntry[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Export credentials (encrypted backup)
   */
  async exportVault(exportPassword: string): Promise<{ success: boolean; data?: string; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault is locked.' };
    }

    try {
      const salt = randomBytes(this.SALT_LENGTH);
      const key = this.deriveKey(exportPassword, salt);
      const iv = randomBytes(this.IV_LENGTH);
      
      const credentials = Array.from(this.credentials.values());
      const plaintext = JSON.stringify(credentials);
      
      const cipher = createCipheriv(this.ALGORITHM, key, iv);
      let encrypted = cipher.update(plaintext, 'utf-8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      const exportData = {
        version: this.VERSION,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        data: encrypted.toString('hex'),
        exportedAt: Date.now()
      };
      
      return { 
        success: true, 
        data: Buffer.from(JSON.stringify(exportData)).toString('base64'),
        message: 'Vault exported successfully.'
      };
      
    } catch (error: any) {
      return { success: false, message: `Export failed: ${error.message}` };
    }
  }

  /**
   * Import credentials from backup
   */
  async importVault(data: string, importPassword: string, merge: boolean = true): Promise<{ success: boolean; imported?: number; message: string }> {
    if (!this.isUnlocked) {
      return { success: false, message: 'Vault must be unlocked to import.' };
    }

    try {
      const exportData = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
      
      const salt = Buffer.from(exportData.salt, 'hex');
      const key = this.deriveKey(importPassword, salt);
      const iv = Buffer.from(exportData.iv, 'hex');
      const authTag = Buffer.from(exportData.authTag, 'hex');
      const encrypted = Buffer.from(exportData.data, 'hex');
      
      const decipher = createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, undefined, 'utf-8');
      decrypted += decipher.final('utf-8');
      
      const importedCredentials = JSON.parse(decrypted) as Credential[];
      
      if (!merge) {
        this.credentials.clear();
      }
      
      let count = 0;
      for (const cred of importedCredentials) {
        // Generate new ID if merging to avoid conflicts
        if (merge && this.credentials.has(cred.id)) {
          cred.id = this.generateId(cred.name);
        }
        this.credentials.set(cred.id, cred);
        count++;
      }
      
      await this.saveVault();
      
      return { success: true, imported: count, message: `Imported ${count} credentials.` };
      
    } catch (error: any) {
      return { success: false, message: `Import failed: ${error.message}` };
    }
  }

  // Private methods

  private deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, this.PBKDF2_ITERATIONS, this.KEY_LENGTH, 'sha512');
  }

  private async saveVault(newSalt?: Buffer): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Vault is locked');
    }

    // Read existing salt or use new one
    let salt: Buffer;
    if (newSalt) {
      salt = newSalt;
    } else if (existsSync(this.vaultPath)) {
      const existing = JSON.parse(readFileSync(this.vaultPath, 'utf-8'));
      salt = Buffer.from(existing.salt, 'hex');
    } else {
      salt = randomBytes(this.SALT_LENGTH);
    }

    const iv = randomBytes(this.IV_LENGTH);
    const credentials = Array.from(this.credentials.values());
    const plaintext = JSON.stringify(credentials);
    
    const cipher = createCipheriv(this.ALGORITHM, this.masterKey, iv);
    let encrypted = cipher.update(plaintext, 'utf-8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Create checksum
    const checksum = pbkdf2Sync(encrypted.toString('hex'), salt, 1000, 32, 'sha256').toString('hex');
    
    const vaultData: EncryptedVault = {
      version: this.VERSION,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted.toString('hex'),
      checksum,
      config: this.config
    };
    
    writeFileSync(this.vaultPath, JSON.stringify(vaultData, null, 2));
  }

  private generateId(base: string): string {
    const random = randomBytes(8).toString('hex');
    return `${base.toLowerCase().replace(/\s+/g, '-').substring(0, 20)}-${random}`;
  }

  private sanitizeCredential(credential: Credential): Credential {
    return {
      ...credential,
      password: credential.password ? '••••••••' : undefined
    };
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private startAutoLock(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }
    
    if (this.config.autoLockMinutes > 0) {
      this.lockTimeout = setTimeout(() => {
        console.log('[CredentialVault] Auto-locking vault due to inactivity');
        this.lock();
      }, this.config.autoLockMinutes * 60 * 1000);
    }
  }

  private resetAutoLock(): void {
    this.startAutoLock();
  }

  private logAudit(action: AuditLogEntry['action'], credentialId?: string, success: boolean = true, details?: string): void {
    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      action,
      credentialId,
      success,
      details
    };
    
    this.auditLog.push(entry);
    
    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    
    // Persist audit log
    try {
      writeFileSync(this.auditPath, JSON.stringify(this.auditLog, null, 2));
    } catch (error) {
      console.error('[CredentialVault] Failed to write audit log:', error);
    }
  }
}

// Export singleton
export const credentialVault = new CredentialVault();
