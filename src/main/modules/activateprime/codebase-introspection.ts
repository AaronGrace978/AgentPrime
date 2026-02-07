/**
 * ActivatePrime Codebase Introspection - Ported to TypeScript
 * Examines codebase structure, architecture, and capabilities
 * Builds dependency graphs and module relationships
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  lines: number;
  language: string;
  imports: string[];
  exports: string[];
  classes: string[];
  functions: string[];
  dependencies: string[];
  complexity: number;
  lastModified: Date;
}

export interface ModuleInfo {
  name: string;
  path: string;
  files: FileInfo[];
  dependencies: string[];
  dependents: string[];
  language: string;
  complexity: number;
  testCoverage?: number;
  documentation?: boolean;
}

export interface ArchitectureOverview {
  modules: ModuleInfo[];
  subsystems: Array<{
    name: string;
    modules: string[];
    purpose: string;
    complexity: number;
  }>;
  dependencies: Map<string, string[]>;
  coreModules: string[];
  entryPoints: string[];
  circularDependencies: string[][];
}

export interface IntrospectionOptions {
  includeContent?: boolean;
  maxDepth?: number;
  excludePatterns?: string[];
  includePatterns?: string[];
  analyzeDependencies?: boolean;
  detectCircularDeps?: boolean;
}

export class CodebaseIntrospection {
  private workspacePath: string;
  private fileCache: Map<string, FileInfo> = new Map();
  private moduleCache: Map<string, ModuleInfo> = new Map();
  private dependencyGraph: Map<string, string[]> = new Map();
  private options: Required<IntrospectionOptions>;

  constructor(workspacePath: string, options: IntrospectionOptions = {}) {
    this.workspacePath = workspacePath;
    this.options = {
      includeContent: options.includeContent || false,
      maxDepth: options.maxDepth || 5,
      excludePatterns: options.excludePatterns || [
        'node_modules', '.git', 'dist', 'build', '__pycache__',
        '.next', '.nuxt', 'vendor', 'coverage', '.cache', 'tmp', 'temp'
      ],
      includePatterns: options.includePatterns || [
        '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs',
        '.cpp', '.c', '.h', '.hpp', '.cs', '.rb', '.php', '.vue', '.svelte'
      ],
      analyzeDependencies: options.analyzeDependencies !== false,
      detectCircularDeps: options.detectCircularDeps || false
    };
  }

  /**
   * Get comprehensive file information
   */
  async getFileInfo(filePath: string): Promise<FileInfo | null> {
    const fullPath = path.resolve(this.workspacePath, filePath);

    // Check cache first
    if (this.fileCache.has(fullPath)) {
      return this.fileCache.get(fullPath)!;
    }

    try {
      const stats = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const language = this.detectLanguage(filePath, content);

      const fileInfo: FileInfo = {
        path: filePath,
        name: path.basename(filePath),
        extension: path.extname(filePath),
        size: stats.size,
        lines: content.split('\n').length,
        language,
        imports: this.extractImports(content, language),
        exports: this.extractExports(content, language),
        classes: this.extractClasses(content, language),
        functions: this.extractFunctions(content, language),
        dependencies: this.extractDependencies(content, language),
        complexity: this.calculateComplexity(content, language),
        lastModified: stats.mtime
      };

      this.fileCache.set(fullPath, fileInfo);
      return fileInfo;
    } catch (error) {
      console.warn(`Failed to analyze file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get architecture overview
   */
  async getArchitectureOverview(): Promise<ArchitectureOverview> {
    const allFiles = await this.scanWorkspace();
    const modules = await this.buildModules(allFiles);

    // Build dependency graph
    if (this.options.analyzeDependencies) {
      await this.buildDependencyGraph(modules);
    }

    // Identify subsystems
    const subsystems = this.identifySubsystems(modules);

    // Find core modules
    const coreModules = this.identifyCoreModules(modules, this.dependencyGraph);

    // Find entry points
    const entryPoints = this.identifyEntryPoints(modules);

    // Detect circular dependencies
    const circularDependencies = this.options.detectCircularDeps ?
      this.detectCircularDependencies() : [];

    return {
      modules,
      subsystems,
      dependencies: this.dependencyGraph,
      coreModules,
      entryPoints,
      circularDependencies
    };
  }

  /**
   * Scan workspace for relevant files
   */
  private async scanWorkspace(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    const scanDirectory = async (dirPath: string, depth: number = 0): Promise<void> => {
      if (depth > this.options.maxDepth) return;

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(this.workspacePath, fullPath);

          // Skip excluded patterns
          if (this.options.excludePatterns.some(pattern =>
            entry.name.includes(pattern) || relativePath.includes(pattern)
          )) {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath, depth + 1);
          } else if (entry.isFile()) {
            // Check if file matches include patterns
            const ext = path.extname(entry.name);
            if (this.options.includePatterns.some(pattern =>
              entry.name.endsWith(pattern) || ext === pattern
            )) {
              const fileInfo = await this.getFileInfo(relativePath);
              if (fileInfo) {
                files.push(fileInfo);
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to scan directory ${dirPath}:`, error);
      }
    };

    await scanDirectory(this.workspacePath);
    return files;
  }

  /**
   * Build modules from files
   */
  private async buildModules(files: FileInfo[]): Promise<ModuleInfo[]> {
    const moduleMap = new Map<string, FileInfo[]>();

    // Group files by module (directory-based)
    for (const file of files) {
      const dirName = path.dirname(file.path);
      const moduleName = dirName === '.' ? 'root' : dirName.split('/')[0];

      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, []);
      }
      moduleMap.get(moduleName)!.push(file);
    }

    const modules: ModuleInfo[] = [];

    for (const [moduleName, moduleFiles] of moduleMap) {
      const primaryLanguage = this.getPrimaryLanguage(moduleFiles);
      const dependencies = this.extractModuleDependencies(moduleFiles);
      const complexity = moduleFiles.reduce((sum, f) => sum + f.complexity, 0) / moduleFiles.length;

      const moduleInfo: ModuleInfo = {
        name: moduleName,
        path: moduleName === 'root' ? '.' : moduleName,
        files: moduleFiles,
        dependencies,
        dependents: [], // Will be filled by dependency graph
        language: primaryLanguage,
        complexity: Math.round(complexity * 100) / 100
      };

      modules.push(moduleInfo);
      this.moduleCache.set(moduleName, moduleInfo);
    }

    return modules;
  }

  /**
   * Build dependency graph between modules
   */
  private async buildDependencyGraph(modules: ModuleInfo[]): Promise<void> {
    this.dependencyGraph.clear();

    for (const module of modules) {
      const deps: string[] = [];

      for (const file of module.files) {
        for (const importPath of file.imports) {
          // Resolve import to module
          const resolvedModule = this.resolveImportToModule(importPath, modules);
          if (resolvedModule && resolvedModule !== module.name && !deps.includes(resolvedModule)) {
            deps.push(resolvedModule);
          }
        }
      }

      this.dependencyGraph.set(module.name, deps);
    }

    // Build reverse dependencies (dependents)
    for (const module of modules) {
      module.dependents = [];
    }

    for (const [moduleName, deps] of this.dependencyGraph) {
      for (const dep of deps) {
        const depModule = this.moduleCache.get(dep);
        if (depModule && !depModule.dependents.includes(moduleName)) {
          depModule.dependents.push(moduleName);
        }
      }
    }
  }

  /**
   * Identify subsystems in the codebase
   */
  private identifySubsystems(modules: ModuleInfo[]): ArchitectureOverview['subsystems'] {
    const subsystems: ArchitectureOverview['subsystems'] = [];

    // Group modules by common patterns
    const patterns = [
      {
        name: 'UI/Frontend',
        patterns: ['ui', 'components', 'views', 'pages', 'frontend', 'client'],
        purpose: 'User interface and frontend components'
      },
      {
        name: 'Backend/API',
        patterns: ['api', 'server', 'backend', 'routes', 'controllers', 'services'],
        purpose: 'Backend services and API endpoints'
      },
      {
        name: 'Core/Business Logic',
        patterns: ['core', 'business', 'logic', 'domain', 'models', 'entities'],
        purpose: 'Core business logic and domain models'
      },
      {
        name: 'Data/Database',
        patterns: ['data', 'database', 'db', 'models', 'schemas', 'migrations'],
        purpose: 'Data layer and database interactions'
      },
      {
        name: 'Utilities/Helpers',
        patterns: ['utils', 'helpers', 'tools', 'lib', 'common', 'shared'],
        purpose: 'Utility functions and shared code'
      },
      {
        name: 'Configuration',
        patterns: ['config', 'settings', 'env', 'constants'],
        purpose: 'Configuration and environment settings'
      },
      {
        name: 'Testing',
        patterns: ['test', 'spec', 'tests', '__tests__'],
        purpose: 'Test files and testing utilities'
      }
    ];

    for (const pattern of patterns) {
      const matchingModules = modules.filter(module =>
        pattern.patterns.some(p => module.name.toLowerCase().includes(p))
      );

      if (matchingModules.length > 0) {
        const avgComplexity = matchingModules.reduce((sum, m) => sum + m.complexity, 0) / matchingModules.length;

        subsystems.push({
          name: pattern.name,
          modules: matchingModules.map(m => m.name),
          purpose: pattern.purpose,
          complexity: Math.round(avgComplexity * 100) / 100
        });
      }
    }

    return subsystems;
  }

  /**
   * Identify core modules (most depended upon)
   */
  private identifyCoreModules(modules: ModuleInfo[], dependencies: Map<string, string[]>): string[] {
    const dependencyCounts = new Map<string, number>();

    // Count how many times each module is depended upon
    for (const deps of dependencies.values()) {
      for (const dep of deps) {
        dependencyCounts.set(dep, (dependencyCounts.get(dep) || 0) + 1);
      }
    }

    // Sort by dependency count
    const sorted = Array.from(dependencyCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, Math.min(5, dependencyCounts.size));

    return sorted.map(([moduleName]) => moduleName);
  }

  /**
   * Identify entry points (files that aren't imported by others)
   */
  private identifyEntryPoints(modules: ModuleInfo[]): string[] {
    const entryPoints: string[] = [];

    for (const module of modules) {
      // Check if any file in this module is imported by files in other modules
      let isImported = false;

      for (const otherModule of modules) {
        if (otherModule.name === module.name) continue;

        for (const file of otherModule.files) {
          for (const importPath of file.imports) {
            if (this.resolvesToModule(importPath, module)) {
              isImported = true;
              break;
            }
          }
          if (isImported) break;
        }
        if (isImported) break;
      }

      if (!isImported) {
        entryPoints.push(module.name);
      }
    }

    return entryPoints;
  }

  /**
   * Detect circular dependencies
   */
  private detectCircularDependencies(): string[][] {
    const circularDeps: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (moduleName: string, path: string[] = []): void => {
      if (recursionStack.has(moduleName)) {
        // Found circular dependency
        const cycleStart = path.indexOf(moduleName);
        const cycle = [...path.slice(cycleStart), moduleName];
        circularDeps.push(cycle);
        return;
      }

      if (visited.has(moduleName)) return;

      visited.add(moduleName);
      recursionStack.add(moduleName);

      const deps = this.dependencyGraph.get(moduleName) || [];
      for (const dep of deps) {
        dfs(dep, [...path, moduleName]);
      }

      recursionStack.delete(moduleName);
    };

    for (const moduleName of this.dependencyGraph.keys()) {
      if (!visited.has(moduleName)) {
        dfs(moduleName);
      }
    }

    return circularDeps;
  }

  /**
   * Detect programming language from file
   */
  private detectLanguage(filePath: string, content: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.html': 'html',
      '.css': 'css'
    };

    return languageMap[ext] || 'unknown';
  }

  /**
   * Extract imports from file content
   */
  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];

    if (language === 'javascript' || language === 'typescript') {
      // ES6 imports
      const es6ImportRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = es6ImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // CommonJS requires
      const cjsRequireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = cjsRequireRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    } else if (language === 'python') {
      const pythonImportRegex = /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm;
      let match;
      while ((match = pythonImportRegex.exec(content)) !== null) {
        const importPath = match[1] || match[2];
        imports.push(importPath);
      }
    }

    return imports;
  }

  /**
   * Extract exports from file content
   */
  private extractExports(content: string, language: string): string[] {
    const exports: string[] = [];

    if (language === 'javascript' || language === 'typescript') {
      // ES6 exports
      const exportRegex = /export\s+(?:const|let|var|function|class|default)?\s*(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
    } else if (language === 'python') {
      // Look for __all__ or class/function definitions at module level
      const allMatch = content.match(/__all__\s*=\s*\[([^\]]+)\]/);
      if (allMatch) {
        const allItems = allMatch[1].match(/['"]([^'"]+)['"]/g);
        if (allItems) {
          exports.push(...allItems.map(item => item.replace(/['"]/g, '')));
        }
      }
    }

    return exports;
  }

  /**
   * Extract classes from file content
   */
  private extractClasses(content: string, language: string): string[] {
    const classes: string[] = [];

    if (language === 'javascript' || language === 'typescript') {
      const classRegex = /class\s+(\w+)/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        classes.push(match[1]);
      }
    } else if (language === 'python') {
      const classRegex = /^class\s+(\w+)/gm;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        classes.push(match[1]);
      }
    }

    return classes;
  }

  /**
   * Extract functions from file content
   */
  private extractFunctions(content: string, language: string): string[] {
    const functions: string[] = [];

    if (language === 'javascript' || language === 'typescript') {
      const functionRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function))/g;
      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        const funcName = match[1] || match[2];
        if (funcName) functions.push(funcName);
      }
    } else if (language === 'python') {
      const functionRegex = /^def\s+(\w+)/gm;
      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        functions.push(match[1]);
      }
    }

    return functions;
  }

  /**
   * Extract dependencies (external packages)
   */
  private extractDependencies(content: string, language: string): string[] {
    const dependencies: string[] = [];

    if (language === 'javascript' || language === 'typescript') {
      const imports = this.extractImports(content, language);
      for (const importPath of imports) {
        // Check if it's an external dependency (starts with package name, not relative)
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          // Extract package name (before first slash)
          const packageName = importPath.split('/')[0];
          if (!dependencies.includes(packageName)) {
            dependencies.push(packageName);
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Calculate code complexity
   */
  private calculateComplexity(content: string, language: string): number {
    let complexity = 1; // Base complexity

    // Count control flow statements
    const controlFlowKeywords = [
      'if', 'else', 'for', 'while', 'do', 'switch', 'case',
      'try', 'catch', 'finally', '&&', '\\|\\|'
    ];

    for (const keyword of controlFlowKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = content.match(regex);
      if (matches) complexity += matches.length;
    }

    // Count functions/classes (each adds complexity)
    const functions = this.extractFunctions(content, language);
    const classes = this.extractClasses(content, language);
    complexity += functions.length * 2;
    complexity += classes.length * 3;

    // Normalize by lines of code
    const lines = content.split('\n').length;
    return complexity / Math.max(lines, 1);
  }

  /**
   * Get primary language for a module
   */
  private getPrimaryLanguage(files: FileInfo[]): string {
    const languageCounts = new Map<string, number>();

    for (const file of files) {
      languageCounts.set(file.language, (languageCounts.get(file.language) || 0) + 1);
    }

    let maxCount = 0;
    let primaryLanguage = 'unknown';

    for (const [language, count] of languageCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryLanguage = language;
      }
    }

    return primaryLanguage;
  }

  /**
   * Extract module-level dependencies
   */
  private extractModuleDependencies(files: FileInfo[]): string[] {
    const allDeps = new Set<string>();

    for (const file of files) {
      for (const dep of file.dependencies) {
        allDeps.add(dep);
      }
    }

    return Array.from(allDeps);
  }

  /**
   * Resolve import path to module name
   */
  private resolveImportToModule(importPath: string, modules: ModuleInfo[]): string | null {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      // This would need more sophisticated path resolution
      // For now, return null for relative imports
      return null;
    }

    // Check if import matches a module name
    for (const module of modules) {
      if (importPath.startsWith(module.name + '/') || importPath === module.name) {
        return module.name;
      }
    }

    return null;
  }

  /**
   * Check if import path resolves to a specific module
   */
  private resolvesToModule(importPath: string, module: ModuleInfo): boolean {
    // Simple check - can be made more sophisticated
    return importPath.includes(module.name) ||
           module.files.some(file => importPath.includes(file.name));
  }

  /**
   * Get introspection statistics
   */
  getStats(): {
    filesAnalyzed: number;
    modulesFound: number;
    totalLines: number;
    languages: Record<string, number>;
    avgComplexity: number;
  } {
    const files = Array.from(this.fileCache.values());
    const modules = Array.from(this.moduleCache.values());

    const languages: Record<string, number> = {};
    let totalLines = 0;
    let totalComplexity = 0;

    for (const file of files) {
      languages[file.language] = (languages[file.language] || 0) + 1;
      totalLines += file.lines;
      totalComplexity += file.complexity;
    }

    return {
      filesAnalyzed: files.length,
      modulesFound: modules.length,
      totalLines,
      languages,
      avgComplexity: files.length > 0 ? totalComplexity / files.length : 0
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.fileCache.clear();
    this.moduleCache.clear();
    this.dependencyGraph.clear();
  }
}

export default CodebaseIntrospection;
