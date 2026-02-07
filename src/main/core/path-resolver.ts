/**
 * System Path Resolver
 * Resolves system folder names (Desktop, Documents, etc.) to actual paths across platforms
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface SystemFolders {
  desktop: string;
  documents: string;
  pictures: string;
  music: string;
  videos: string;
  downloads: string;
  recycleBin: string;
  trash: string;
}

export interface ResolvedPath {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  isSystemFolder: boolean;
  systemFolderName?: string;
}

export class PathResolver {
  private systemFolders: SystemFolders;
  private platform: NodeJS.Platform;
  private homeDir: string;

  constructor() {
    this.platform = process.platform;
    this.homeDir = os.homedir();
    this.systemFolders = this.initializeSystemFolders();
  }

  /**
   * Initialize system folder paths based on platform
   */
  private initializeSystemFolders(): SystemFolders {
    const folders: Partial<SystemFolders> = {};

    if (this.platform === 'win32') {
      folders.desktop = path.join(this.homeDir, 'Desktop');
      folders.documents = path.join(this.homeDir, 'Documents');
      folders.pictures = path.join(this.homeDir, 'Pictures');
      folders.music = path.join(this.homeDir, 'Music');
      folders.videos = path.join(this.homeDir, 'Videos');
      folders.downloads = path.join(this.homeDir, 'Downloads');
      // Windows Recycle Bin - try common locations
      const drives = ['C:', 'D:', 'E:'];
      folders.recycleBin = drives
        .map(d => path.join(d, '$Recycle.Bin'))
        .find(p => fs.existsSync(p)) || path.join('C:', '$Recycle.Bin');
      folders.trash = folders.recycleBin;
    } else if (this.platform === 'darwin') {
      // macOS
      folders.desktop = path.join(this.homeDir, 'Desktop');
      folders.documents = path.join(this.homeDir, 'Documents');
      folders.pictures = path.join(this.homeDir, 'Pictures');
      folders.music = path.join(this.homeDir, 'Music');
      folders.videos = path.join(this.homeDir, 'Movies');
      folders.downloads = path.join(this.homeDir, 'Downloads');
      folders.trash = path.join(this.homeDir, '.Trash');
      folders.recycleBin = folders.trash;
    } else {
      // Linux
      folders.desktop = path.join(this.homeDir, 'Desktop');
      folders.documents = path.join(this.homeDir, 'Documents');
      folders.pictures = path.join(this.homeDir, 'Pictures');
      folders.music = path.join(this.homeDir, 'Music');
      folders.videos = path.join(this.homeDir, 'Videos');
      folders.downloads = path.join(this.homeDir, 'Downloads');
      folders.trash = path.join(this.homeDir, '.local', 'share', 'Trash');
      folders.recycleBin = folders.trash;
    }

    return folders as SystemFolders;
  }

  /**
   * Resolve a path string to an actual file system path
   */
  resolve(
    pathString: string,
    workspacePath?: string
  ): ResolvedPath {
    if (!pathString) {
      return {
        path: '',
        exists: false,
        isDirectory: false,
        isSystemFolder: false
      };
    }

    // Normalize the path string
    const normalized = pathString.trim().toLowerCase();

    // Check if it's a system folder name
    const systemFolder = this.resolveSystemFolder(normalized);
    if (systemFolder) {
      return systemFolder;
    }

    // Handle home directory shortcut
    if (pathString.startsWith('~')) {
      const resolved = pathString.replace('~', this.homeDir);
      return this.checkPath(resolved, false);
    }

    // Handle absolute paths
    if (path.isAbsolute(pathString)) {
      return this.checkPath(pathString, false);
    }

    // Handle workspace-relative paths
    if (workspacePath) {
      const workspaceRelative = path.join(workspacePath, pathString);
      const result = this.checkPath(workspaceRelative, false);
      if (result.exists) {
        return result;
      }
    }

    // Try fuzzy matching for system folders
    const fuzzyMatch = this.fuzzyMatchSystemFolder(normalized);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    // Return as-is (might be a relative path that doesn't exist yet)
    return this.checkPath(pathString, false);
  }

  /**
   * Resolve system folder name to path
   */
  private resolveSystemFolder(folderName: string): ResolvedPath | null {
    const mappings: Record<string, keyof SystemFolders> = {
      'desktop': 'desktop',
      'documents': 'documents',
      'pictures': 'pictures',
      'pics': 'pictures',
      'photo': 'pictures',
      'photos': 'pictures',
      'music': 'music',
      'songs': 'music',
      'videos': 'videos',
      'video': 'videos',
      'movies': 'videos',
      'downloads': 'downloads',
      'download': 'downloads',
      'recycle bin': 'recycleBin',
      'recyclebin': 'recycleBin',
      'trash': 'trash',
      'bin': 'recycleBin'
    };

    const key = mappings[folderName];
    if (key && this.systemFolders[key]) {
      const folderPath = this.systemFolders[key];
      return this.checkPath(folderPath, true, key);
    }

    return null;
  }

  /**
   * Fuzzy match system folder names
   */
  private fuzzyMatchSystemFolder(folderName: string): ResolvedPath | null {
    const systemFolderNames = [
      'desktop', 'documents', 'pictures', 'music', 'videos', 'downloads'
    ];

    for (const name of systemFolderNames) {
      if (folderName.includes(name) || name.includes(folderName)) {
        const key = name as keyof SystemFolders;
        if (this.systemFolders[key]) {
          return this.checkPath(this.systemFolders[key], true, key);
        }
      }
    }

    return null;
  }

  /**
   * Check if path exists and get its properties
   */
  private checkPath(
    filePath: string,
    isSystemFolder: boolean,
    systemFolderName?: string
  ): ResolvedPath {
    try {
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        exists: true,
        isDirectory: stats.isDirectory(),
        isSystemFolder,
        systemFolderName
      };
    } catch {
      return {
        path: filePath,
        exists: false,
        isDirectory: false,
        isSystemFolder,
        systemFolderName
      };
    }
  }

  /**
   * Get all system folder paths
   */
  getSystemFolders(): SystemFolders {
    return { ...this.systemFolders };
  }

  /**
   * Get recycle bin path for current platform
   */
  getRecycleBinPath(): string {
    return this.systemFolders.recycleBin;
  }

  /**
   * Validate that a path exists
   */
  validatePath(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Normalize path separators for current platform
   */
  normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Join multiple path segments
   */
  join(...segments: string[]): string {
    return path.join(...segments);
  }

  /**
   * Get directory name from path
   */
  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  /**
   * Get base name from path
   */
  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  /**
   * Check if path is absolute
   */
  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  /**
   * Resolve relative path against workspace or current directory
   */
  resolveRelative(relativePath: string, basePath?: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }

    const base = basePath || process.cwd();
    return path.resolve(base, relativePath);
  }
}

