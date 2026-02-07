/**
 * AgentPrime - Plugin Marketplace
 * Plugin discovery, installation, and management system
 */

import type {
  MarketplacePlugin,
  PluginInstallation,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
  PluginUpdate,
  MarketplaceConfig,
  PluginStats,
  MarketplaceEvent
} from '../../types/plugin-marketplace';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import { enterpriseSecurity } from '../security/enterprise-security';

// Try to import adm-zip, fall back to basic extraction if not available
let AdmZip: any = null;
try {
  AdmZip = require('adm-zip');
} catch {
  console.warn('[Marketplace] adm-zip not available, using fallback extraction');
}

export class PluginMarketplace extends EventEmitter {
  private config: MarketplaceConfig;
  private installations: Map<string, PluginInstallation> = new Map();
  private pluginCache: Map<string, MarketplacePlugin> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private updateCheckTimer?: NodeJS.Timeout;

  constructor(config?: Partial<MarketplaceConfig>) {
    super();

    this.config = {
      registryUrl: 'https://registry.agentprime.dev',
      cacheExpiry: 60, // 1 hour
      autoUpdate: true,
      updateCheckInterval: 1440, // 24 hours
      allowPreRelease: false,
      allowUnverified: true,
      trustedPublishers: [],
      ...config
    };

    this.loadInstallations();
    this.startUpdateChecks();
  }

  /**
   * Search for plugins in the marketplace
   */
  async searchPlugins(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
    try {
      const searchUrl = this.buildSearchUrl(query);
      const response = await this.fetchJson(searchUrl);

      // Cache results
      response.plugins.forEach((plugin: MarketplacePlugin) => {
        this.pluginCache.set(plugin.id, plugin);
        this.cacheExpiry.set(plugin.id, Date.now() + this.config.cacheExpiry * 60 * 1000);
      });

      return response;
    } catch (error) {
      console.error('Plugin search failed:', error);
      throw new Error('Failed to search plugins');
    }
  }

  /**
   * Get plugin details by ID
   */
  async getPlugin(pluginId: string): Promise<MarketplacePlugin | null> {
    // Check cache first
    const cached = this.pluginCache.get(pluginId);
    const expiry = this.cacheExpiry.get(pluginId);

    if (cached && expiry && expiry > Date.now()) {
      return cached;
    }

    try {
      const pluginUrl = `${this.config.registryUrl}/plugins/${pluginId}`;
      const plugin = await this.fetchJson(pluginUrl);

      this.pluginCache.set(pluginId, plugin);
      this.cacheExpiry.set(pluginId, Date.now() + this.config.cacheExpiry * 60 * 1000);

      return plugin;
    } catch (error) {
      console.error('Failed to fetch plugin:', error);
      return null;
    }
  }

  /**
   * Install a plugin
   */
  async installPlugin(pluginId: string, version?: string): Promise<PluginInstallation> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    // Check if already installed
    const existing = this.installations.get(pluginId);
    if (existing && existing.status === 'installed') {
      throw new Error('Plugin already installed');
    }

    // Validate plugin
    if (!this.config.allowUnverified && !plugin.verified) {
      throw new Error('Plugin is not verified');
    }

    if (!this.config.trustedPublishers.includes(plugin.publisher)) {
      throw new Error('Plugin publisher is not trusted');
    }

    // Create installation record
    const installVersion = version || plugin.version;
    const installPath = path.join(this.getPluginsDir(), pluginId, installVersion);

    const installation: PluginInstallation = {
      id: crypto.randomUUID(),
      pluginId,
      version: installVersion,
      installPath,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'installing',
      autoUpdate: this.config.autoUpdate
    };

    this.installations.set(pluginId, installation);
    this.saveInstallations();

    try {
      // Download and install
      await this.downloadAndInstall(plugin, installVersion, installPath);

      installation.status = 'installed';
      installation.updatedAt = Date.now();
      this.saveInstallations();

      this.emitEvent('plugin_installed', pluginId, { installation, plugin });

      return installation;
    } catch (error: any) {
      installation.status = 'failed';
      installation.error = error.message;
      this.saveInstallations();

      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    const installation = this.installations.get(pluginId);
    if (!installation) {
      throw new Error('Plugin not installed');
    }

    try {
      // Remove files
      if (fs.existsSync(installation.installPath)) {
        await fs.promises.rm(installation.installPath, { recursive: true, force: true });
      }

      this.installations.delete(pluginId);
      this.saveInstallations();

      this.emitEvent('plugin_uninstalled', pluginId, { installation });

    } catch (error: any) {
      console.error('Failed to uninstall plugin:', error);
      throw new Error('Failed to uninstall plugin');
    }
  }

  /**
   * Update a plugin to the latest version
   */
  async updatePlugin(pluginId: string): Promise<void> {
    const installation = this.installations.get(pluginId);
    if (!installation) {
      throw new Error('Plugin not installed');
    }

    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found in marketplace');
    }

    if (installation.version === plugin.version) {
      return; // Already up to date
    }

    // Backup current installation
    const backupPath = `${installation.installPath}.backup`;
    if (fs.existsSync(installation.installPath)) {
      await fs.promises.rename(installation.installPath, backupPath);
    }

    try {
      // Install new version
      await this.downloadAndInstall(plugin, plugin.version, installation.installPath);

      installation.version = plugin.version;
      installation.updatedAt = Date.now();
      this.saveInstallations();

      // Remove backup
      if (fs.existsSync(backupPath)) {
        await fs.promises.rm(backupPath, { recursive: true, force: true });
      }

      this.emitEvent('plugin_updated', pluginId, {
        installation,
        oldVersion: installation.version,
        newVersion: plugin.version
      });

    } catch (error) {
      // Restore backup
      if (fs.existsSync(backupPath)) {
        if (fs.existsSync(installation.installPath)) {
          await fs.promises.rm(installation.installPath, { recursive: true, force: true });
        }
        await fs.promises.rename(backupPath, installation.installPath);
      }

      throw error;
    }
  }

  /**
   * Check for plugin updates
   */
  async checkForUpdates(): Promise<PluginUpdate[]> {
    const updates: PluginUpdate[] = [];

    for (const [pluginId, installation] of this.installations) {
      if (installation.status !== 'installed') continue;

      try {
        const plugin = await this.getPlugin(pluginId);
        if (!plugin) continue;

        if (this.isVersionNewer(plugin.version, installation.version)) {
          updates.push({
            pluginId,
            currentVersion: installation.version,
            latestVersion: plugin.version,
            breaking: this.isBreakingChange(installation.version, plugin.version),
            releaseDate: plugin.lastUpdated
          });
        }
      } catch (error) {
        console.warn(`Failed to check updates for ${pluginId}:`, error);
      }
    }

    return updates;
  }

  /**
   * Get marketplace statistics
   */
  async getStats(): Promise<PluginStats> {
    try {
      const statsUrl = `${this.config.registryUrl}/stats`;
      return await this.fetchJson(statsUrl);
    } catch (error) {
      console.error('Failed to fetch marketplace stats:', error);
      return {
        totalPlugins: 0,
        totalInstalls: 0,
        activeUsers: 0,
        categories: {},
        trending: [],
        topRated: [],
        mostDownloaded: [],
        recentlyUpdated: []
      };
    }
  }

  /**
   * Get installed plugins
   */
  getInstalledPlugins(): PluginInstallation[] {
    return Array.from(this.installations.values());
  }

  /**
   * Enable/disable auto-updates for a plugin
   */
  setAutoUpdate(pluginId: string, enabled: boolean): void {
    const installation = this.installations.get(pluginId);
    if (installation) {
      installation.autoUpdate = enabled;
      this.saveInstallations();
    }
  }

  // Private methods

  private buildSearchUrl(query: MarketplaceSearchQuery): string {
    const params = new URLSearchParams();

    if (query.query) params.append('q', query.query);
    if (query.category) params.append('category', query.category);
    if (query.author) params.append('author', query.author);
    if (query.tags) params.append('tags', query.tags.join(','));
    if (query.sortBy) params.append('sort', query.sortBy);
    if (query.sortOrder) params.append('order', query.sortOrder);
    if (query.page) params.append('page', query.page.toString());
    if (query.pageSize) params.append('size', query.pageSize.toString());
    if (query.minRating) params.append('minRating', query.minRating.toString());
    if (query.verified !== undefined) params.append('verified', query.verified.toString());
    if (query.preview !== undefined) params.append('preview', query.preview.toString());

    return `${this.config.registryUrl}/search?${params.toString()}`;
  }

  private async fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  private async downloadAndInstall(
    plugin: MarketplacePlugin,
    version: string,
    installPath: string
  ): Promise<void> {
    // Find archive asset
    const archiveAsset = plugin.assets.find(asset => asset.type === 'archive');
    if (!archiveAsset) {
      throw new Error('Plugin archive not found');
    }

    // Download archive
    const archiveData = await this.downloadFile(archiveAsset.url);

    // Verify checksum
    const calculatedHash = crypto.createHash('sha256').update(archiveData).digest('hex');
    if (calculatedHash !== archiveAsset.sha256) {
      throw new Error('Plugin archive checksum mismatch');
    }

    // Create install directory
    await fs.promises.mkdir(installPath, { recursive: true });

    // Extract archive (simplified - would use proper archive library)
    await this.extractArchive(archiveData, installPath);

    // Validate installation
    await this.validateInstallation(plugin, installPath);
  }

  private async downloadFile(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  private async extractArchive(data: Buffer, targetPath: string): Promise<void> {
    // Create target directory if it doesn't exist
    await fs.promises.mkdir(targetPath, { recursive: true });
    
    // Try to detect archive type from magic bytes
    const isZip = data[0] === 0x50 && data[1] === 0x4b; // PK magic bytes
    const isGzip = data[0] === 0x1f && data[1] === 0x8b; // Gzip magic bytes
    
    if (isZip && AdmZip) {
      // Extract zip using adm-zip
      const zip = new AdmZip(data);
      const zipEntries = zip.getEntries();
      
      for (const entry of zipEntries) {
        const entryPath = path.join(targetPath, entry.entryName);
        
        if (entry.isDirectory) {
          await fs.promises.mkdir(entryPath, { recursive: true });
        } else {
          // Ensure parent directory exists
          await fs.promises.mkdir(path.dirname(entryPath), { recursive: true });
          await fs.promises.writeFile(entryPath, entry.getData());
        }
      }
      
      console.log(`[Marketplace] Extracted ${zipEntries.length} files to ${targetPath}`);
    } else if (isGzip) {
      // Handle gzipped content (likely tar.gz)
      const gunzipped = await new Promise<Buffer>((resolve, reject) => {
        zlib.gunzip(data, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      // For tar files, we'd need a tar library
      // For now, write the gunzipped content if it's a single file
      const mainFile = path.join(targetPath, 'plugin.tar');
      await fs.promises.writeFile(mainFile, gunzipped);
      console.log(`[Marketplace] Extracted gzip to ${mainFile} - tar extraction requires tar library`);
    } else if (isZip && !AdmZip) {
      // Fallback: try to use system unzip command
      const tempZip = path.join(targetPath, 'temp-plugin.zip');
      await fs.promises.writeFile(tempZip, data);
      
      try {
        const { exec } = require('child_process');
        await new Promise<void>((resolve, reject) => {
          exec(`unzip -o "${tempZip}" -d "${targetPath}"`, (error: any) => {
            if (error) reject(error);
            else resolve();
          });
        });
        
        // Clean up temp file
        await fs.promises.unlink(tempZip);
        console.log(`[Marketplace] Extracted using system unzip to ${targetPath}`);
      } catch (error) {
        console.error('[Marketplace] System unzip failed:', error);
        throw new Error('Archive extraction failed - install adm-zip package');
      }
    } else {
      // Unknown format or fallback
      const archiveFile = path.join(targetPath, 'plugin-archive.bin');
      await fs.promises.writeFile(archiveFile, data);
      console.warn(`[Marketplace] Unknown archive format, saved raw data to ${archiveFile}`);
      throw new Error('Unknown archive format');
    }
  }

  private async validateInstallation(plugin: MarketplacePlugin, installPath: string): Promise<void> {
    // Check for required files
    const manifestPath = path.join(installPath, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Plugin manifest not found');
    }

    const mainPath = path.join(installPath, plugin.main || 'index.js');
    if (!fs.existsSync(mainPath)) {
      throw new Error('Plugin main file not found');
    }

    // Validate manifest matches
    const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
    const installedManifest = JSON.parse(manifestContent);

    if (installedManifest.id !== plugin.id) {
      throw new Error('Plugin ID mismatch');
    }
  }

  private getPluginsDir(): string {
    // Return plugins directory path
    return path.join(process.cwd(), 'plugins');
  }

  private loadInstallations(): void {
    try {
      const installFile = path.join(this.getPluginsDir(), 'installations.json');
      if (fs.existsSync(installFile)) {
        const data = fs.readFileSync(installFile, 'utf-8');
        const installations = JSON.parse(data);
        for (const [pluginId, installation] of Object.entries(installations)) {
          this.installations.set(pluginId, installation as PluginInstallation);
        }
      }
    } catch (error) {
      console.warn('Failed to load plugin installations:', error);
    }
  }

  private saveInstallations(): void {
    try {
      const installFile = path.join(this.getPluginsDir(), 'installations.json');
      const data = Object.fromEntries(this.installations);
      fs.writeFileSync(installFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save plugin installations:', error);
    }
  }

  private isVersionNewer(latest: string, current: string): boolean {
    // Simple version comparison - would use proper semver library
    return latest !== current;
  }

  private isBreakingChange(fromVersion: string, toVersion: string): boolean {
    // Check if major version changed
    const fromParts = fromVersion.split('.').map(Number);
    const toParts = toVersion.split('.').map(Number);
    return fromParts[0] !== toParts[0];
  }

  private startUpdateChecks(): void {
    if (this.config.autoUpdate) {
      this.updateCheckTimer = setInterval(async () => {
        try {
          const updates = await this.checkForUpdates();
          if (updates.length > 0) {
            this.emit('updates_available', updates);
          }
        } catch (error) {
          console.error('Update check failed:', error);
        }
      }, this.config.updateCheckInterval * 60 * 1000);
    }
  }

  private emitEvent(type: MarketplaceEvent['type'], pluginId: string, data: any): void {
    const event: MarketplaceEvent = {
      type,
      pluginId,
      data,
      timestamp: Date.now()
    };

    this.emit('marketplace_event', event);
  }
}
