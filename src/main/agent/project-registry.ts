/**
 * Project Registry - Remembers past projects so the agent can update them
 * 
 * Features:
 * 1. Stores metadata about completed projects
 * 2. Enables detection of "update" vs "new" projects
 * 3. Tracks build history for continuity
 * 4. Generates project documentation
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  type: 'web' | 'node' | 'python' | 'game' | 'api' | 'cli' | 'other';
  description: string;
  createdAt: string;
  updatedAt: string;
  files: string[];
  technologies: string[];
  buildHistory: BuildEntry[];
}

export interface BuildEntry {
  timestamp: string;
  action: 'create' | 'update' | 'fix' | 'enhance';
  description: string;
  filesChanged: string[];
  prompt: string;
}

interface ProjectRegistryData {
  version: string;
  projects: ProjectEntry[];
}

export class ProjectRegistry {
  private registryPath: string;
  private data: ProjectRegistryData;

  constructor(dataDir?: string) {
    const baseDir = dataDir || path.join(process.cwd(), 'data');
    this.registryPath = path.join(baseDir, 'project-registry.json');
    this.data = {
      version: '1.0',
      projects: []
    };
    this.load();
  }

  /**
   * Load registry from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(this.registryPath)) {
        const content = fs.readFileSync(this.registryPath, 'utf-8');
        this.data = JSON.parse(content);
      }
    } catch (error) {
      console.warn('[ProjectRegistry] Could not load registry:', error);
    }
  }

  /**
   * Save registry to disk
   */
  private save(): void {
    try {
      const dir = path.dirname(this.registryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.registryPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[ProjectRegistry] Could not save registry:', error);
    }
  }

  /**
   * Find a project by path
   */
  findByPath(projectPath: string): ProjectEntry | undefined {
    const normalized = path.normalize(projectPath).toLowerCase();
    return this.data.projects.find(p => 
      path.normalize(p.path).toLowerCase() === normalized
    );
  }

  /**
   * Find projects by name or description
   */
  search(query: string): ProjectEntry[] {
    const lower = query.toLowerCase();
    return this.data.projects.filter(p => 
      p.name.toLowerCase().includes(lower) ||
      p.description.toLowerCase().includes(lower) ||
      p.technologies.some(t => t.toLowerCase().includes(lower))
    );
  }

  /**
   * Register a new project or update existing
   */
  registerProject(
    projectPath: string,
    options: {
      name?: string;
      type?: ProjectEntry['type'];
      description?: string;
      files: string[];
      technologies?: string[];
      prompt: string;
      action: BuildEntry['action'];
    }
  ): ProjectEntry {
    const existing = this.findByPath(projectPath);
    const now = new Date().toISOString();

    const buildEntry: BuildEntry = {
      timestamp: now,
      action: options.action,
      description: options.description || 'Project update',
      filesChanged: options.files,
      prompt: options.prompt
    };

    if (existing) {
      // Update existing project
      existing.updatedAt = now;
      existing.files = [...new Set([...existing.files, ...options.files])];
      if (options.technologies) {
        existing.technologies = [...new Set([...existing.technologies, ...options.technologies])];
      }
      existing.buildHistory.push(buildEntry);
      this.save();
      return existing;
    }

    // Create new project
    const project: ProjectEntry = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: options.name || path.basename(projectPath),
      path: projectPath,
      type: options.type || 'other',
      description: options.description || 'No description',
      createdAt: now,
      updatedAt: now,
      files: options.files,
      technologies: options.technologies || [],
      buildHistory: [buildEntry]
    };

    this.data.projects.push(project);
    this.save();
    return project;
  }

  /**
   * Get all projects
   */
  getAllProjects(): ProjectEntry[] {
    return this.data.projects;
  }

  /**
   * Get recent projects
   */
  getRecentProjects(limit: number = 10): ProjectEntry[] {
    return [...this.data.projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Detect project type from files
   */
  static detectProjectType(files: string[]): ProjectEntry['type'] {
    const hasPackageJson = files.includes('package.json');
    const hasIndexHtml = files.some(f => f.includes('index.html'));
    const hasPython = files.some(f => f.endsWith('.py'));
    const hasGameJs = files.some(f => f.includes('game.js') || f.includes('phaser'));
    
    if (hasGameJs) return 'game';
    if (hasPython) return 'python';
    if (hasPackageJson && !hasIndexHtml) return 'node';
    if (hasIndexHtml) return 'web';
    if (files.some(f => f.includes('api') || f.includes('server'))) return 'api';
    return 'other';
  }

  /**
   * Detect technologies from files
   */
  static detectTechnologies(files: string[], workspacePath: string): string[] {
    const techs: string[] = [];
    
    // Check file extensions
    if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) techs.push('TypeScript');
    if (files.some(f => f.endsWith('.js') || f.endsWith('.jsx'))) techs.push('JavaScript');
    if (files.some(f => f.endsWith('.py'))) techs.push('Python');
    if (files.some(f => f.endsWith('.html'))) techs.push('HTML');
    if (files.some(f => f.endsWith('.css'))) techs.push('CSS');
    
    // Check for frameworks from package.json
    const pkgPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        if (deps.react) techs.push('React');
        if (deps.vue) techs.push('Vue');
        if (deps.svelte) techs.push('Svelte');
        if (deps.express) techs.push('Express');
        if (deps.phaser) techs.push('Phaser');
        if (deps.three) techs.push('Three.js');
        if (deps.fastify) techs.push('Fastify');
        if (deps.vite) techs.push('Vite');
      } catch {
        // Ignore parsing errors
      }
    }
    
    return [...new Set(techs)];
  }
}

// Singleton instance
let registryInstance: ProjectRegistry | null = null;

export function getProjectRegistry(): ProjectRegistry {
  if (!registryInstance) {
    registryInstance = new ProjectRegistry();
  }
  return registryInstance;
}

