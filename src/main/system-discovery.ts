/**
 * System Discovery - Smart Agent Initialization
 * Scans the system to discover installed apps, games, and capabilities
 * So the agent KNOWS what's available before being asked to do anything
 */

import * as fs from 'fs';
import * as path from 'path';
import { platform, homedir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface InstalledGame {
  name: string;
  appId: number;
  installPath: string;
  platform: 'steam' | 'epic' | 'gog' | 'other';
  executablePath?: string;
}

export interface InstalledApp {
  name: string;
  path: string;
  type: 'browser' | 'dev' | 'media' | 'communication' | 'productivity' | 'utility' | 'game' | 'other';
}

export interface SystemCapabilities {
  initialized: boolean;
  lastScan: number;
  steamInstalled: boolean;
  steamPath: string | null;
  installedGames: InstalledGame[];
  installedApps: InstalledApp[];
  // Quick lookup maps
  gamesByName: Map<string, InstalledGame>;
  appsByName: Map<string, InstalledApp>;
}

class SystemDiscovery {
  private capabilities: SystemCapabilities = {
    initialized: false,
    lastScan: 0,
    steamInstalled: false,
    steamPath: null,
    installedGames: [],
    installedApps: [],
    gamesByName: new Map(),
    appsByName: new Map()
  };

  private isWindows = platform() === 'win32';
  private isMac = platform() === 'darwin';
  private isLinux = platform() === 'linux';
  
  // User-configured additional Steam library paths
  private additionalSteamPaths: string[] = [];

  /**
   * Add additional Steam library paths (can be called before or after initialize)
   */
  addSteamLibraryPath(libraryPath: string): void {
    if (!this.additionalSteamPaths.includes(libraryPath)) {
      this.additionalSteamPaths.push(libraryPath);
      console.log(`[SystemDiscovery] Added Steam library path: ${libraryPath}`);
    }
  }

  /**
   * Set multiple Steam library paths at once
   */
  setSteamLibraryPaths(paths: string[]): void {
    this.additionalSteamPaths = paths.filter(p => p && p.trim());
    console.log(`[SystemDiscovery] Set ${this.additionalSteamPaths.length} custom Steam library paths`);
  }

  /**
   * Get current Steam paths being used
   */
  getSteamPaths(): { main: string | null; libraries: string[] } {
    return {
      main: this.capabilities.steamPath,
      libraries: this.additionalSteamPaths
    };
  }

  /**
   * Initialize system discovery - call this on app startup
   */
  async initialize(): Promise<SystemCapabilities> {
    console.log('[SystemDiscovery] Initializing system scan...');
    const startTime = Date.now();

    try {
      // Discover Steam installation and games
      await this.discoverSteam();
      
      // Discover installed applications
      await this.discoverInstalledApps();

      this.capabilities.initialized = true;
      this.capabilities.lastScan = Date.now();

      const elapsed = Date.now() - startTime;
      console.log(`[SystemDiscovery] Scan complete in ${elapsed}ms`);
      console.log(`[SystemDiscovery] Found ${this.capabilities.installedGames.length} games, ${this.capabilities.installedApps.length} apps`);
      
      // List found games for debugging
      if (this.capabilities.installedGames.length > 0) {
        console.log('[SystemDiscovery] Games found:');
        for (const game of this.capabilities.installedGames.slice(0, 20)) {
          console.log(`  - ${game.name} (AppID: ${game.appId})`);
        }
        if (this.capabilities.installedGames.length > 20) {
          console.log(`  ... and ${this.capabilities.installedGames.length - 20} more`);
        }
      }
      
      return this.capabilities;
    } catch (error: any) {
      console.error('[SystemDiscovery] Initialization failed:', error.message);
      this.capabilities.initialized = true; // Mark as initialized even on failure
      this.capabilities.lastScan = Date.now();
      return this.capabilities;
    }
  }

  /**
   * Get current system capabilities
   */
  getCapabilities(): SystemCapabilities {
    return this.capabilities;
  }

  /**
   * Check if a game is installed by name (fuzzy match)
   */
  findGame(gameName: string): InstalledGame | null {
    const normalized = gameName.toLowerCase().trim();
    
    // Exact match first
    if (this.capabilities.gamesByName.has(normalized)) {
      return this.capabilities.gamesByName.get(normalized)!;
    }
    
    // Fuzzy match - check if name contains or is contained
    for (const [name, game] of this.capabilities.gamesByName) {
      if (name.includes(normalized) || normalized.includes(name)) {
        return game;
      }
    }
    
    return null;
  }

  /**
   * Check if an app is installed by name
   */
  findApp(appName: string): InstalledApp | null {
    const normalized = appName.toLowerCase().trim();
    
    if (this.capabilities.appsByName.has(normalized)) {
      return this.capabilities.appsByName.get(normalized)!;
    }
    
    // Fuzzy match
    for (const [name, app] of this.capabilities.appsByName) {
      if (name.includes(normalized) || normalized.includes(name)) {
        return app;
      }
    }
    
    return null;
  }

  /**
   * Get a summary of what's installed (for AI context)
   */
  getSystemSummary(): string {
    const games = this.capabilities.installedGames.slice(0, 20).map(g => g.name).join(', ');
    const apps = this.capabilities.installedApps.slice(0, 15).map(a => a.name).join(', ');
    
    return `INSTALLED GAMES (${this.capabilities.installedGames.length} total): ${games}${this.capabilities.installedGames.length > 20 ? '...' : ''}
INSTALLED APPS: ${apps}${this.capabilities.installedApps.length > 15 ? '...' : ''}
Steam: ${this.capabilities.steamInstalled ? 'Yes' : 'No'}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // STEAM DISCOVERY
  // ═══════════════════════════════════════════════════════════════

  private async discoverSteam(): Promise<void> {
    try {
      // Find ALL possible Steam-related paths
      const allSteamPaths = await this.findAllSteamPaths();
      
      if (allSteamPaths.length === 0) {
        console.log('[SystemDiscovery] Steam not found');
        return;
      }

      this.capabilities.steamInstalled = true;
      this.capabilities.steamPath = allSteamPaths[0]; // Primary Steam path
      console.log(`[SystemDiscovery] Steam paths found: ${allSteamPaths.join(', ')}`);

      // Collect all library folders from all Steam installations
      const allLibraries = new Set<string>();
      
      for (const steamPath of allSteamPaths) {
        // Add the path itself as a potential library
        allLibraries.add(steamPath);
        
        // Find libraries defined in this Steam installation
        const libraries = await this.findSteamLibraryFolders(steamPath);
        for (const lib of libraries) {
          allLibraries.add(lib);
        }
      }
      
      // Also add user-configured paths
      for (const customPath of this.additionalSteamPaths) {
        if (fs.existsSync(customPath)) {
          allLibraries.add(customPath);
        }
      }

      console.log(`[SystemDiscovery] Total Steam library folders: ${allLibraries.size}`);

      // Scan each library for installed games
      for (const libraryPath of allLibraries) {
        console.log(`[SystemDiscovery] Scanning library: ${libraryPath}`);
        await this.scanSteamLibrary(libraryPath);
      }
      
      console.log(`[SystemDiscovery] Total games found: ${this.capabilities.installedGames.length}`);
    } catch (error: any) {
      console.warn('[SystemDiscovery] Steam discovery failed:', error.message);
    }
  }
  
  /**
   * Find ALL Steam-related paths (main install + libraries)
   */
  private async findAllSteamPaths(): Promise<string[]> {
    const foundPaths: string[] = [];
    const checkedPaths = new Set<string>();
    
    // Helper to add path if it exists and has steamapps
    const addIfValid = (p: string) => {
      const normalized = p.toLowerCase();
      if (checkedPaths.has(normalized)) return;
      checkedPaths.add(normalized);
      
      if (fs.existsSync(p)) {
        // Check if it has steamapps folder (sign of a valid Steam location)
        const steamappsPath = path.join(p, 'steamapps');
        if (fs.existsSync(steamappsPath)) {
          foundPaths.push(p);
          console.log(`[SystemDiscovery] Valid Steam location: ${p}`);
        }
      }
    };

    if (this.isWindows) {
      // 1. Try Windows Registry first (most reliable)
      try {
        const { stdout } = await execAsync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath 2>nul');
        const match = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/);
        if (match && match[1]) {
          addIfValid(match[1].trim());
        }
      } catch {}

      // 2. Check all drive letters aggressively
      const driveLetters = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
      
      for (const drive of driveLetters) {
        // Check if drive exists
        try {
          if (!fs.existsSync(`${drive}:\\`)) continue;
        } catch { continue; }
        
        // Common Steam locations
        addIfValid(`${drive}:\\Program Files (x86)\\Steam`);
        addIfValid(`${drive}:\\Program Files\\Steam`);
        addIfValid(`${drive}:\\Steam`);
        addIfValid(`${drive}:\\SteamLibrary`);
        addIfValid(`${drive}:\\Games\\Steam`);
        addIfValid(`${drive}:\\Games\\SteamLibrary`);
        addIfValid(`${drive}:\\Games`);
      }
      
      // User home
      addIfValid(path.join(homedir(), 'Steam'));
    } else if (this.isMac) {
      addIfValid(path.join(homedir(), 'Library/Application Support/Steam'));
    } else if (this.isLinux) {
      addIfValid(path.join(homedir(), '.steam/steam'));
      addIfValid(path.join(homedir(), '.local/share/Steam'));
    }

    // Add user-configured paths
    for (const customPath of this.additionalSteamPaths) {
      addIfValid(customPath);
    }

    return foundPaths;
  }

  // NOTE: findSteamPath replaced by findAllSteamPaths for more aggressive scanning

  private async findSteamLibraryFolders(steamPath: string): Promise<string[]> {
    const libraries: string[] = [steamPath];
    const addedPaths = new Set<string>([steamPath.toLowerCase()]);
    
    // Parse libraryfolders.vdf to find additional library locations
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    
    if (fs.existsSync(vdfPath)) {
      try {
        const content = fs.readFileSync(vdfPath, 'utf-8');
        console.log('[SystemDiscovery] Parsing libraryfolders.vdf...');
        
        // Parse the VDF format - look for "path" entries
        const pathMatches = content.match(/"path"\s+"([^"]+)"/g);
        
        if (pathMatches) {
          for (const match of pathMatches) {
            const pathValue = match.match(/"path"\s+"([^"]+)"/)?.[1];
            if (pathValue) {
              const normalizedPath = pathValue.replace(/\\\\/g, '\\');
              if (!addedPaths.has(normalizedPath.toLowerCase()) && fs.existsSync(normalizedPath)) {
                libraries.push(normalizedPath);
                addedPaths.add(normalizedPath.toLowerCase());
                console.log(`[SystemDiscovery] Found Steam library: ${normalizedPath}`);
              }
            }
          }
        }
      } catch (error) {
        console.warn('[SystemDiscovery] Failed to parse libraryfolders.vdf');
      }
    }

    // Also add any user-configured additional library paths
    for (const customPath of this.additionalSteamPaths) {
      if (!addedPaths.has(customPath.toLowerCase()) && fs.existsSync(customPath)) {
        libraries.push(customPath);
        addedPaths.add(customPath.toLowerCase());
        console.log(`[SystemDiscovery] Added custom Steam library: ${customPath}`);
      }
    }

    return libraries;
  }

  private async scanSteamLibrary(libraryPath: string): Promise<void> {
    const steamappsPath = path.join(libraryPath, 'steamapps');
    
    if (!fs.existsSync(steamappsPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(steamappsPath);
      const manifestFiles = files.filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));

      for (const manifestFile of manifestFiles) {
        try {
          const manifestPath = path.join(steamappsPath, manifestFile);
          const content = fs.readFileSync(manifestPath, 'utf-8');
          
          // Parse the ACF format
          const appIdMatch = content.match(/"appid"\s+"(\d+)"/);
          const nameMatch = content.match(/"name"\s+"([^"]+)"/);
          const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/);
          
          if (appIdMatch && nameMatch) {
            const appId = parseInt(appIdMatch[1], 10);
            const name = nameMatch[1];
            const installDir = installDirMatch?.[1] || '';
            
            const game: InstalledGame = {
              name,
              appId,
              installPath: path.join(steamappsPath, 'common', installDir),
              platform: 'steam'
            };
            
            this.capabilities.installedGames.push(game);
            
            // Add to lookup map with various name formats
            const normalizedName = name.toLowerCase();
            this.capabilities.gamesByName.set(normalizedName, game);
            
            // Also add common abbreviations/aliases
            this.addGameAliases(game);
          }
        } catch (error) {
          // Skip invalid manifest files
        }
      }
    } catch (error: any) {
      console.warn(`[SystemDiscovery] Failed to scan library ${libraryPath}:`, error.message);
    }
  }

  private addGameAliases(game: InstalledGame): void {
    const name = game.name.toLowerCase();
    const map = this.capabilities.gamesByName;
    
    // Common abbreviation patterns
    const abbreviations: Record<string, string[]> = {
      'left 4 dead 2': ['l4d2', 'left4dead2'],
      'left 4 dead': ['l4d', 'left4dead'],
      'counter-strike 2': ['cs2', 'counterstrike2', 'counter strike 2'],
      'counter-strike: global offensive': ['csgo', 'cs go', 'counter strike'],
      'dota 2': ['dota'],
      'team fortress 2': ['tf2'],
      'grand theft auto v': ['gta5', 'gta v', 'gtav'],
      'the elder scrolls v: skyrim': ['skyrim'],
      'the witcher 3: wild hunt': ['witcher 3', 'witcher3'],
      "playerunknown's battlegrounds": ['pubg'],
      'baldur\'s gate 3': ['bg3', 'baldurs gate 3'],
    };
    
    // Check if this game has known abbreviations
    for (const [fullName, aliases] of Object.entries(abbreviations)) {
      if (name.includes(fullName) || fullName.includes(name)) {
        for (const alias of aliases) {
          map.set(alias, game);
        }
      }
    }
    
    // Generic: remove special characters and add
    const simplified = name.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (simplified !== name) {
      map.set(simplified, game);
    }
    
    // Remove "the " prefix
    if (name.startsWith('the ')) {
      map.set(name.substring(4), game);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // APP DISCOVERY
  // ═══════════════════════════════════════════════════════════════

  private async discoverInstalledApps(): Promise<void> {
    if (this.isWindows) {
      await this.discoverWindowsApps();
    } else if (this.isMac) {
      await this.discoverMacApps();
    } else if (this.isLinux) {
      await this.discoverLinuxApps();
    }
  }

  private async discoverWindowsApps(): Promise<void> {
    // Check common app locations
    const commonApps: { name: string; paths: string[]; type: InstalledApp['type'] }[] = [
      // Browsers
      { name: 'Chrome', paths: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'], type: 'browser' },
      { name: 'Firefox', paths: ['C:\\Program Files\\Mozilla Firefox\\firefox.exe', 'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'], type: 'browser' },
      { name: 'Edge', paths: ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'], type: 'browser' },
      { name: 'Brave', paths: ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'], type: 'browser' },
      
      // Dev tools
      { name: 'VS Code', paths: [path.join(homedir(), 'AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe')], type: 'dev' },
      { name: 'Cursor', paths: [path.join(homedir(), 'AppData\\Local\\Programs\\cursor\\Cursor.exe')], type: 'dev' },
      
      // Communication
      { name: 'Discord', paths: [path.join(homedir(), 'AppData\\Local\\Discord\\Update.exe')], type: 'communication' },
      { name: 'Slack', paths: [path.join(homedir(), 'AppData\\Local\\slack\\slack.exe')], type: 'communication' },
      { name: 'Teams', paths: [path.join(homedir(), 'AppData\\Local\\Microsoft\\Teams\\Update.exe')], type: 'communication' },
      { name: 'Zoom', paths: [path.join(homedir(), 'AppData\\Roaming\\Zoom\\bin\\Zoom.exe')], type: 'communication' },
      
      // Media
      { name: 'Spotify', paths: [path.join(homedir(), 'AppData\\Roaming\\Spotify\\Spotify.exe')], type: 'media' },
      { name: 'VLC', paths: ['C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'], type: 'media' },
      { name: 'OBS Studio', paths: ['C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'], type: 'media' },
      
      // Productivity  
      { name: 'Notion', paths: [path.join(homedir(), 'AppData\\Local\\Programs\\Notion\\Notion.exe')], type: 'productivity' },
      { name: 'Obsidian', paths: [path.join(homedir(), 'AppData\\Local\\Obsidian\\Obsidian.exe')], type: 'productivity' },
    ];

    for (const app of commonApps) {
      for (const appPath of app.paths) {
        if (fs.existsSync(appPath)) {
          const installedApp: InstalledApp = {
            name: app.name,
            path: appPath,
            type: app.type
          };
          this.capabilities.installedApps.push(installedApp);
          this.capabilities.appsByName.set(app.name.toLowerCase(), installedApp);
          break;
        }
      }
    }

    // Steam as an app
    if (this.capabilities.steamPath) {
      const steamExe = path.join(this.capabilities.steamPath, 'steam.exe');
      if (fs.existsSync(steamExe)) {
        const steamApp: InstalledApp = { name: 'Steam', path: steamExe, type: 'game' };
        this.capabilities.installedApps.push(steamApp);
        this.capabilities.appsByName.set('steam', steamApp);
      }
    }
  }

  private async discoverMacApps(): Promise<void> {
    const applicationsPath = '/Applications';
    
    try {
      const apps = fs.readdirSync(applicationsPath);
      
      for (const app of apps) {
        if (app.endsWith('.app')) {
          const appName = app.replace('.app', '');
          const appPath = path.join(applicationsPath, app);
          
          let type: InstalledApp['type'] = 'other';
          const nameLower = appName.toLowerCase();
          
          if (['chrome', 'firefox', 'safari', 'edge', 'brave'].some(b => nameLower.includes(b))) {
            type = 'browser';
          } else if (['code', 'xcode', 'sublime', 'atom'].some(d => nameLower.includes(d))) {
            type = 'dev';
          } else if (['discord', 'slack', 'teams', 'zoom'].some(c => nameLower.includes(c))) {
            type = 'communication';
          } else if (['spotify', 'vlc', 'music'].some(m => nameLower.includes(m))) {
            type = 'media';
          }
          
          const installedApp: InstalledApp = { name: appName, path: appPath, type };
          this.capabilities.installedApps.push(installedApp);
          this.capabilities.appsByName.set(appName.toLowerCase(), installedApp);
        }
      }
    } catch (error) {
      console.warn('[SystemDiscovery] Failed to scan Mac applications');
    }
  }

  private async discoverLinuxApps(): Promise<void> {
    // Check common Linux app locations
    const desktopFileDirs = [
      '/usr/share/applications',
      path.join(homedir(), '.local/share/applications')
    ];

    for (const dir of desktopFileDirs) {
      if (!fs.existsSync(dir)) continue;
      
      try {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          if (!file.endsWith('.desktop')) continue;
          
          try {
            const content = fs.readFileSync(path.join(dir, file), 'utf-8');
            const nameMatch = content.match(/^Name=(.+)$/m);
            const execMatch = content.match(/^Exec=(.+)$/m);
            
            if (nameMatch && execMatch) {
              const appName = nameMatch[1];
              const appPath = execMatch[1].split(' ')[0];
              
              const installedApp: InstalledApp = { name: appName, path: appPath, type: 'other' };
              this.capabilities.installedApps.push(installedApp);
              this.capabilities.appsByName.set(appName.toLowerCase(), installedApp);
            }
          } catch {
            // Skip invalid desktop files
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  }
}

// Singleton instance
export const systemDiscovery = new SystemDiscovery();
