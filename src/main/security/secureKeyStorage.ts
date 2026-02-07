/**
 * Secure Key Storage
 * 
 * Provides secure storage for API keys using OS keychain when available,
 * with fallback to encrypted file storage.
 * 
 * Security Features:
 * - Uses OS keychain (Windows Credential Manager, macOS Keychain, Linux Secret Service)
 * - Falls back to AES-256-GCM encrypted file storage
 * - Keys are never stored in plain text
 * - Encryption key derived from machine-specific data
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Service name for keychain storage
const SERVICE_NAME = 'AgentPrime';

/**
 * Interface for the secure storage backend
 */
interface SecureStorageBackend {
  setPassword(account: string, password: string): Promise<void>;
  getPassword(account: string): Promise<string | null>;
  deletePassword(account: string): Promise<boolean>;
}

/**
 * Encrypted File Storage Backend
 * Used as fallback when OS keychain is not available
 */
class EncryptedFileStorage implements SecureStorageBackend {
  private storagePath: string;
  private encryptionKey: Buffer;
  
  constructor() {
    // Create storage directory
    const userDataPath = process.env.APPDATA || process.env.HOME || os.homedir();
    const agentPrimeDir = path.join(userDataPath, 'AgentPrime', '.secure');
    
    try {
      if (!fs.existsSync(agentPrimeDir)) {
        fs.mkdirSync(agentPrimeDir, { recursive: true });
      }
    } catch (e) {
      console.warn('[SecureStorage] Could not create secure storage directory');
    }
    
    this.storagePath = path.join(agentPrimeDir, 'keys.enc');
    
    // Derive encryption key from machine-specific data
    this.encryptionKey = this.deriveEncryptionKey();
  }
  
  /**
   * Derive an encryption key from machine-specific identifiers
   * This makes the encrypted file tied to this specific machine
   */
  private deriveEncryptionKey(): Buffer {
    const machineId = this.getMachineIdentifier();
    const salt = 'AgentPrime-SecureStorage-v1';
    
    // Use PBKDF2 to derive a secure key
    return crypto.pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
  }
  
  /**
   * Get a machine-specific identifier
   */
  private getMachineIdentifier(): string {
    const parts: string[] = [];
    
    // Add hostname
    parts.push(os.hostname());
    
    // Add user info
    parts.push(os.userInfo().username);
    
    // Add platform info
    parts.push(os.platform());
    parts.push(os.arch());
    
    // Add CPU info (first CPU model)
    const cpus = os.cpus();
    if (cpus.length > 0) {
      parts.push(cpus[0].model);
    }
    
    // Add home directory
    parts.push(os.homedir());
    
    return parts.join('|');
  }
  
  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Load the encrypted storage file
   */
  private loadStorage(): Record<string, string> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return {};
      }
      
      const encryptedContent = fs.readFileSync(this.storagePath, 'utf8');
      if (!encryptedContent.trim()) {
        return {};
      }
      
      const decrypted = this.decrypt(encryptedContent);
      return JSON.parse(decrypted);
    } catch (e) {
      console.warn('[SecureStorage] Could not load storage, starting fresh');
      return {};
    }
  }
  
  /**
   * Save the encrypted storage file
   */
  private saveStorage(data: Record<string, string>): void {
    try {
      const json = JSON.stringify(data);
      const encrypted = this.encrypt(json);
      fs.writeFileSync(this.storagePath, encrypted, 'utf8');
    } catch (e) {
      console.error('[SecureStorage] Could not save storage:', e);
      throw e;
    }
  }
  
  async setPassword(account: string, password: string): Promise<void> {
    const storage = this.loadStorage();
    storage[account] = password;
    this.saveStorage(storage);
  }
  
  async getPassword(account: string): Promise<string | null> {
    const storage = this.loadStorage();
    return storage[account] || null;
  }
  
  async deletePassword(account: string): Promise<boolean> {
    const storage = this.loadStorage();
    if (account in storage) {
      delete storage[account];
      this.saveStorage(storage);
      return true;
    }
    return false;
  }
}

/**
 * Keytar (OS Keychain) Storage Backend
 * Wraps the keytar package for native keychain access
 */
class KeytarStorage implements SecureStorageBackend {
  private keytar: any = null;
  private available: boolean = false;
  
  constructor() {
    try {
      // Dynamically require keytar - it's an optional dependency
      this.keytar = require('keytar');
      this.available = true;
      console.log('[SecureStorage] ✅ OS Keychain available');
    } catch (e) {
      console.warn('[SecureStorage] OS Keychain (keytar) not available, using encrypted file fallback');
      this.available = false;
    }
  }
  
  isAvailable(): boolean {
    return this.available;
  }
  
  async setPassword(account: string, password: string): Promise<void> {
    if (!this.available) throw new Error('Keytar not available');
    await this.keytar.setPassword(SERVICE_NAME, account, password);
  }
  
  async getPassword(account: string): Promise<string | null> {
    if (!this.available) throw new Error('Keytar not available');
    return await this.keytar.getPassword(SERVICE_NAME, account);
  }
  
  async deletePassword(account: string): Promise<boolean> {
    if (!this.available) throw new Error('Keytar not available');
    return await this.keytar.deletePassword(SERVICE_NAME, account);
  }
}

/**
 * Main Secure Key Storage class
 * Automatically uses the best available backend
 */
export class SecureKeyStorage {
  private backend: SecureStorageBackend;
  private backendType: 'keychain' | 'encrypted-file';
  
  constructor() {
    const keytarStorage = new KeytarStorage();
    
    if ((keytarStorage as any).isAvailable()) {
      this.backend = keytarStorage;
      this.backendType = 'keychain';
    } else {
      this.backend = new EncryptedFileStorage();
      this.backendType = 'encrypted-file';
    }
    
    console.log(`[SecureStorage] Using ${this.backendType} backend`);
  }
  
  /**
   * Get the storage backend type
   */
  getBackendType(): 'keychain' | 'encrypted-file' {
    return this.backendType;
  }
  
  /**
   * Store an API key securely
   */
  async setApiKey(provider: string, apiKey: string): Promise<void> {
    const account = `apikey-${provider}`;
    await this.backend.setPassword(account, apiKey);
    console.log(`[SecureStorage] ✅ Stored API key for ${provider}`);
  }
  
  /**
   * Retrieve an API key
   */
  async getApiKey(provider: string): Promise<string | null> {
    const account = `apikey-${provider}`;
    return await this.backend.getPassword(account);
  }
  
  /**
   * Delete an API key
   */
  async deleteApiKey(provider: string): Promise<boolean> {
    const account = `apikey-${provider}`;
    return await this.backend.deletePassword(account);
  }
  
  /**
   * Store any secret securely
   */
  async setSecret(key: string, value: string): Promise<void> {
    await this.backend.setPassword(key, value);
  }
  
  /**
   * Retrieve any secret
   */
  async getSecret(key: string): Promise<string | null> {
    return await this.backend.getPassword(key);
  }
  
  /**
   * Delete any secret
   */
  async deleteSecret(key: string): Promise<boolean> {
    return await this.backend.deletePassword(key);
  }
  
  /**
   * Migrate API keys from plain text settings to secure storage
   */
  async migrateFromSettings(settings: {
    providers: Record<string, { apiKey?: string }>;
  }): Promise<{ migrated: string[]; errors: string[] }> {
    const migrated: string[] = [];
    const errors: string[] = [];
    
    for (const [provider, config] of Object.entries(settings.providers)) {
      if (config.apiKey && config.apiKey.length > 0) {
        try {
          await this.setApiKey(provider, config.apiKey);
          migrated.push(provider);
        } catch (e: any) {
          errors.push(`${provider}: ${e.message}`);
        }
      }
    }
    
    return { migrated, errors };
  }
  
  /**
   * Load API keys into settings object (for in-memory use only)
   */
  async loadIntoSettings(settings: {
    providers: Record<string, { apiKey?: string }>;
  }): Promise<void> {
    for (const provider of Object.keys(settings.providers)) {
      try {
        const apiKey = await this.getApiKey(provider);
        if (apiKey) {
          settings.providers[provider].apiKey = apiKey;
        }
      } catch (e) {
        // Key not found, that's okay
      }
    }
  }
}

// Singleton instance
let secureKeyStorageInstance: SecureKeyStorage | null = null;

/**
 * Get the singleton SecureKeyStorage instance
 */
export function getSecureKeyStorage(): SecureKeyStorage {
  if (!secureKeyStorageInstance) {
    secureKeyStorageInstance = new SecureKeyStorage();
  }
  return secureKeyStorageInstance;
}

export default SecureKeyStorage;

