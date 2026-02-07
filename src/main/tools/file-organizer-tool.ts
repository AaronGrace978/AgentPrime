/**
 * File Organizer Tool - AI-powered file organization and categorization
 * Analyzes files and organizes them into logical folders
 */

import { BaseTool, ToolParameter } from './base-tool';
import * as fs from 'fs';
import * as path from 'path';

// File type categories
const FILE_CATEGORIES: Record<string, { extensions: string[]; folder: string }> = {
  images: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.heic'],
    folder: 'Images'
  },
  documents: {
    extensions: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv'],
    folder: 'Documents'
  },
  videos: {
    extensions: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
    folder: 'Videos'
  },
  audio: {
    extensions: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'],
    folder: 'Audio'
  },
  archives: {
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
    folder: 'Archives'
  },
  code: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.html', '.css', '.scss', '.sass', '.json', '.xml', '.yaml', '.yml', '.md', '.sql'],
    folder: 'Code'
  },
  executables: {
    extensions: ['.exe', '.msi', '.dmg', '.app', '.deb', '.rpm', '.sh', '.bat', '.cmd'],
    folder: 'Programs'
  },
  fonts: {
    extensions: ['.ttf', '.otf', '.woff', '.woff2', '.eot'],
    folder: 'Fonts'
  },
  ebooks: {
    extensions: ['.epub', '.mobi', '.azw', '.azw3', '.fb2'],
    folder: 'eBooks'
  },
  design: {
    extensions: ['.psd', '.ai', '.xd', '.sketch', '.fig', '.indd'],
    folder: 'Design'
  },
  data: {
    extensions: ['.db', '.sqlite', '.mdb', '.accdb'],
    folder: 'Databases'
  }
};

interface OrganizeResult {
  success: boolean;
  movedFiles: { from: string; to: string }[];
  skippedFiles: string[];
  createdFolders: string[];
  errors: string[];
}

interface AnalyzeResult {
  totalFiles: number;
  categories: Record<string, { count: number; files: string[]; totalSize: number }>;
  uncategorized: { count: number; files: string[] };
  duplicates: { hash: string; files: string[] }[];
  largestFiles: { name: string; size: number }[];
}

/**
 * File Organizer Tool - Organize files by type
 */
export class FileOrganizerTool extends BaseTool {
  constructor() {
    super(
      'organize_folder',
      'Organize files in a folder by moving them into categorized subfolders (Images, Documents, Videos, etc.)',
      {
        folderPath: {
          type: 'string',
          required: true,
          description: 'Path to the folder to organize'
        },
        dryRun: {
          type: 'boolean',
          required: false,
          description: 'Preview changes without moving files (default: true for safety)'
        },
        includeSubfolders: {
          type: 'boolean',
          required: false,
          description: 'Include files from subfolders (default: false)'
        },
        customRules: {
          type: 'object',
          required: false,
          description: 'Custom categorization rules: { "CategoryName": [".ext1", ".ext2"] }'
        }
      }
    );
  }

  async execute(args: { 
    folderPath: string; 
    dryRun?: boolean; 
    includeSubfolders?: boolean;
    customRules?: Record<string, string[]>;
  }): Promise<OrganizeResult> {
    const { folderPath, dryRun = true, includeSubfolders = false, customRules } = args;
    
    const result: OrganizeResult = {
      success: true,
      movedFiles: [],
      skippedFiles: [],
      createdFolders: [],
      errors: []
    };

    console.log(`[Organizer] ${dryRun ? 'Analyzing' : 'Organizing'}: ${folderPath}`);

    try {
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder does not exist: ${folderPath}`);
      }

      const stats = fs.statSync(folderPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${folderPath}`);
      }

      // Build category map including custom rules
      const categories = { ...FILE_CATEGORIES };
      if (customRules) {
        for (const [name, extensions] of Object.entries(customRules)) {
          categories[name.toLowerCase()] = {
            extensions: extensions.map(e => e.startsWith('.') ? e : `.${e}`),
            folder: name
          };
        }
      }

      // Get files to organize
      const files = this.getFiles(folderPath, includeSubfolders);
      console.log(`[Organizer] Found ${files.length} files`);

      for (const filePath of files) {
        try {
          const fileName = path.basename(filePath);
          const ext = path.extname(filePath).toLowerCase();
          
          // Skip if file is already in a category folder
          const parentFolder = path.basename(path.dirname(filePath));
          const isAlreadyOrganized = Object.values(categories).some(c => c.folder === parentFolder);
          if (isAlreadyOrganized && path.dirname(filePath) !== folderPath) {
            result.skippedFiles.push(filePath);
            continue;
          }

          // Find matching category
          let targetFolder = 'Other';
          for (const [, categoryInfo] of Object.entries(categories)) {
            if (categoryInfo.extensions.includes(ext)) {
              targetFolder = categoryInfo.folder;
              break;
            }
          }

          const targetDir = path.join(folderPath, targetFolder);
          const targetPath = path.join(targetDir, fileName);

          // Skip if source and target are the same
          if (filePath === targetPath) {
            result.skippedFiles.push(filePath);
            continue;
          }

          if (dryRun) {
            result.movedFiles.push({ from: filePath, to: targetPath });
            if (!result.createdFolders.includes(targetDir)) {
              result.createdFolders.push(targetDir);
            }
          } else {
            // Create directory if needed
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
              if (!result.createdFolders.includes(targetDir)) {
                result.createdFolders.push(targetDir);
              }
            }

            // Handle duplicate filenames
            let finalPath = targetPath;
            let counter = 1;
            while (fs.existsSync(finalPath)) {
              const baseName = path.basename(fileName, ext);
              finalPath = path.join(targetDir, `${baseName} (${counter})${ext}`);
              counter++;
            }

            // Move file
            fs.renameSync(filePath, finalPath);
            result.movedFiles.push({ from: filePath, to: finalPath });
          }
        } catch (fileError: any) {
          result.errors.push(`${filePath}: ${fileError.message}`);
        }
      }

      console.log(`[Organizer] ${dryRun ? 'Would move' : 'Moved'} ${result.movedFiles.length} files`);
      if (dryRun) {
        console.log('[Organizer] This was a dry run. Set dryRun: false to actually move files.');
      }

    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
      console.error('[Organizer] Error:', error.message);
    }

    return result;
  }

  private getFiles(dir: string, includeSubfolders: boolean): string[] {
    const files: string[] = [];
    
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isFile()) {
        files.push(fullPath);
      } else if (item.isDirectory() && includeSubfolders) {
        // Skip category folders we might have created
        const isCategoryFolder = Object.values(FILE_CATEGORIES).some(c => c.folder === item.name);
        if (!isCategoryFolder && item.name !== 'Other') {
          files.push(...this.getFiles(fullPath, true));
        }
      }
    }
    
    return files;
  }
}

/**
 * File Analyzer Tool - Analyze folder contents
 */
export class FileAnalyzerTool extends BaseTool {
  constructor() {
    super(
      'analyze_folder',
      'Analyze a folder to see file types, sizes, potential duplicates, and organization suggestions.',
      {
        folderPath: {
          type: 'string',
          required: true,
          description: 'Path to the folder to analyze'
        },
        includeSubfolders: {
          type: 'boolean',
          required: false,
          description: 'Include subfolders in analysis (default: true)'
        },
        checkDuplicates: {
          type: 'boolean',
          required: false,
          description: 'Check for duplicate files by name (default: true)'
        }
      }
    );
  }

  async execute(args: { 
    folderPath: string; 
    includeSubfolders?: boolean;
    checkDuplicates?: boolean;
  }): Promise<AnalyzeResult> {
    const { folderPath, includeSubfolders = true, checkDuplicates = true } = args;
    
    console.log(`[Analyzer] Analyzing: ${folderPath}`);

    const result: AnalyzeResult = {
      totalFiles: 0,
      categories: {},
      uncategorized: { count: 0, files: [] },
      duplicates: [],
      largestFiles: []
    };

    try {
      const files = this.getAllFiles(folderPath, includeSubfolders);
      result.totalFiles = files.length;

      const filesByName: Map<string, string[]> = new Map();
      const allFilesWithSize: { name: string; size: number }[] = [];

      for (const filePath of files) {
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const stats = fs.statSync(filePath);

        allFilesWithSize.push({ name: filePath, size: stats.size });

        // Track potential duplicates by name
        if (checkDuplicates) {
          const existing = filesByName.get(fileName) || [];
          existing.push(filePath);
          filesByName.set(fileName, existing);
        }

        // Categorize
        let foundCategory = false;
        for (const [categoryName, categoryInfo] of Object.entries(FILE_CATEGORIES)) {
          if (categoryInfo.extensions.includes(ext)) {
            if (!result.categories[categoryName]) {
              result.categories[categoryName] = { count: 0, files: [], totalSize: 0 };
            }
            result.categories[categoryName].count++;
            result.categories[categoryName].files.push(fileName);
            result.categories[categoryName].totalSize += stats.size;
            foundCategory = true;
            break;
          }
        }

        if (!foundCategory) {
          result.uncategorized.count++;
          result.uncategorized.files.push(fileName);
        }
      }

      // Find duplicates
      if (checkDuplicates) {
        for (const [name, paths] of filesByName) {
          if (paths.length > 1) {
            result.duplicates.push({ hash: name, files: paths });
          }
        }
      }

      // Find largest files
      result.largestFiles = allFilesWithSize
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);

      // Limit file lists for readability
      for (const category of Object.values(result.categories)) {
        if (category.files.length > 20) {
          category.files = [...category.files.slice(0, 20), `... and ${category.files.length - 20} more`];
        }
      }
      if (result.uncategorized.files.length > 20) {
        result.uncategorized.files = [
          ...result.uncategorized.files.slice(0, 20),
          `... and ${result.uncategorized.files.length - 20} more`
        ];
      }

      console.log(`[Analyzer] Found ${result.totalFiles} files in ${Object.keys(result.categories).length} categories`);

    } catch (error: any) {
      console.error('[Analyzer] Error:', error.message);
    }

    return result;
  }

  private getAllFiles(dir: string, includeSubfolders: boolean): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isFile()) {
          files.push(fullPath);
        } else if (item.isDirectory() && includeSubfolders) {
          files.push(...this.getAllFiles(fullPath, true));
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
    
    return files;
  }
}

/**
 * File Rename Tool - Batch rename files
 */
export class FileRenameTool extends BaseTool {
  constructor() {
    super(
      'batch_rename',
      'Batch rename files in a folder using patterns.',
      {
        folderPath: {
          type: 'string',
          required: true,
          description: 'Path to the folder containing files to rename'
        },
        pattern: {
          type: 'string',
          required: true,
          description: 'Rename pattern. Use {name} for original name, {n} for number, {date} for date, {ext} for extension. Example: "Photo_{n}_{date}{ext}"'
        },
        filter: {
          type: 'string',
          required: false,
          description: 'File extension filter (e.g., ".jpg" or ".png,.jpg")'
        },
        dryRun: {
          type: 'boolean',
          required: false,
          description: 'Preview changes without renaming (default: true)'
        }
      }
    );
  }

  async execute(args: { 
    folderPath: string; 
    pattern: string;
    filter?: string;
    dryRun?: boolean;
  }): Promise<{ success: boolean; renamed: { from: string; to: string }[]; errors: string[] }> {
    const { folderPath, pattern, filter, dryRun = true } = args;
    
    console.log(`[Rename] ${dryRun ? 'Preview' : 'Renaming'} files in: ${folderPath}`);
    
    const result = {
      success: true,
      renamed: [] as { from: string; to: string }[],
      errors: [] as string[]
    };

    try {
      const filterExts = filter ? filter.split(',').map(e => e.trim().toLowerCase()) : null;
      const files = fs.readdirSync(folderPath, { withFileTypes: true })
        .filter(item => {
          if (!item.isFile()) return false;
          if (filterExts) {
            const ext = path.extname(item.name).toLowerCase();
            return filterExts.some(f => f === ext || f === ext.slice(1));
          }
          return true;
        })
        .map(item => item.name)
        .sort();

      const today = new Date().toISOString().split('T')[0];
      
      for (let i = 0; i < files.length; i++) {
        const oldName = files[i];
        const ext = path.extname(oldName);
        const baseName = path.basename(oldName, ext);
        
        let newName = pattern
          .replace(/\{name\}/g, baseName)
          .replace(/\{n\}/g, String(i + 1).padStart(3, '0'))
          .replace(/\{date\}/g, today)
          .replace(/\{ext\}/g, ext);
        
        // Ensure extension is present
        if (!newName.includes('.')) {
          newName += ext;
        }

        const oldPath = path.join(folderPath, oldName);
        const newPath = path.join(folderPath, newName);

        if (oldName !== newName) {
          if (dryRun) {
            result.renamed.push({ from: oldName, to: newName });
          } else {
            try {
              fs.renameSync(oldPath, newPath);
              result.renamed.push({ from: oldName, to: newName });
            } catch (error: any) {
              result.errors.push(`${oldName}: ${error.message}`);
            }
          }
        }
      }

      console.log(`[Rename] ${dryRun ? 'Would rename' : 'Renamed'} ${result.renamed.length} files`);

    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
    }

    return result;
  }
}

/**
 * Helper: Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

