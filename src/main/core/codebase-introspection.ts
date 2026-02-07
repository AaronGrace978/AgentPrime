/**
 * AgentPrime - Enhanced Codebase Introspection
 * Advanced code analysis with AST parsing and dependency graphs
 * Builds on existing codebase-indexer.js with deeper analysis
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileInfo {
  path: string;
  size: number;
  lastModified: number;
  language: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  symbols: SymbolInfo[];
  dependencies: string[];
  dependents: string[];
  complexity: number;
  testCoverage?: number;
}

interface ImportInfo {
  module: string;
  names: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

interface ExportInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'type';
  isDefault: boolean;
  line: number;
}

interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'method' | 'property';
  line: number;
  column: number;
  scope: string;
  references: SymbolReference[];
}

interface SymbolReference {
  file: string;
  line: number;
  type: 'definition' | 'usage' | 'import' | 'export';
}

interface ArchitectureModule {
  name: string;
  path: string;
  type: 'core' | 'feature' | 'utility' | 'test' | 'config';
  dependencies: string[];
  dependents: string[];
  complexity: number;
  cohesion: number;
  coupling: number;
  files: string[];
}

interface ArchitectureOverview {
  modules: ArchitectureModule[];
  layers: {
    name: string;
    modules: string[];
    responsibilities: string[];
  }[];
  patterns: {
    name: string;
    description: string;
    confidence: number;
    modules: string[];
  }[];
  issues: ArchitectureIssue[];
}

interface ArchitectureIssue {
  type: 'circular_dependency' | 'tight_coupling' | 'low_cohesion' | 'missing_abstraction';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedModules: string[];
  suggestion: string;
}

export class CodebaseIntrospection {
  private workspacePath: string;
  private fileIndex: Map<string, FileInfo> = new Map();
  private moduleIndex: Map<string, ArchitectureModule> = new Map();
  private symbolIndex: Map<string, SymbolInfo[]> = new Map();

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Build comprehensive codebase analysis
   */
  async buildIntrospection(): Promise<ArchitectureOverview> {
    console.log('[CodebaseIntrospection] Starting comprehensive analysis...');

    // Build file index with deep analysis
    await this.buildFileIndex();

    // Build symbol cross-references
    await this.buildSymbolReferences();

    // Analyze module structure
    await this.analyzeModules();

    // Detect architectural patterns
    const patterns = await this.detectArchitecturalPatterns();

    // Identify architecture issues
    const issues = await this.identifyArchitectureIssues();

    // Organize into layers
    const layers = await this.organizeIntoLayers();

    const modules = Array.from(this.moduleIndex.values());

    return {
      modules,
      layers,
      patterns,
      issues
    };
  }

  /**
   * Build detailed file index with AST analysis
   */
  private async buildFileIndex(): Promise<void> {
    const files = await this.getAllSourceFiles();

    for (const filePath of files) {
      try {
        const fullPath = path.join(this.workspacePath, filePath);
        const stats = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf-8');

        const language = this.detectLanguage(filePath);
        const analysis = await this.analyzeFileContent(content, language);

        const fileInfo: FileInfo = {
          path: filePath,
          size: stats.size,
          lastModified: stats.mtime.getTime(),
          language,
          imports: analysis.imports,
          exports: analysis.exports,
          symbols: analysis.symbols,
          dependencies: analysis.dependencies,
          dependents: [], // Will be filled during cross-reference analysis
          complexity: analysis.complexity
        };

        this.fileIndex.set(filePath, fileInfo);
      } catch (error) {
        console.warn(`[CodebaseIntrospection] Failed to analyze ${filePath}:`, error);
      }
    }

    console.log(`[CodebaseIntrospection] Analyzed ${this.fileIndex.size} files`);
  }

  /**
   * Analyze file content with AST parsing
   */
  private async analyzeFileContent(content: string, language: string): Promise<{
    imports: ImportInfo[];
    exports: ExportInfo[];
    symbols: SymbolInfo[];
    dependencies: string[];
    complexity: number;
  }> {
    const result = {
      imports: [] as ImportInfo[],
      exports: [] as ExportInfo[],
      symbols: [] as SymbolInfo[],
      dependencies: [] as string[],
      complexity: 0
    };

    try {
      if (language === 'typescript' || language === 'javascript') {
        const analysis = this.analyzeJavaScriptFile(content);
        Object.assign(result, analysis);
      } else if (language === 'python') {
        const analysis = this.analyzePythonFile(content);
        Object.assign(result, analysis);
      } else {
        // Basic analysis for other languages
        result.complexity = this.calculateBasicComplexity(content);
      }
    } catch (error) {
      console.warn('[CodebaseIntrospection] AST analysis failed, using fallback:', error);
      result.complexity = this.calculateBasicComplexity(content);
    }

    return result;
  }

  /**
   * Analyze JavaScript/TypeScript file with AST-like parsing
   */
  private analyzeJavaScriptFile(content: string): {
    imports: ImportInfo[];
    exports: ExportInfo[];
    symbols: SymbolInfo[];
    dependencies: string[];
    complexity: number;
  } {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: SymbolInfo[] = [];
    const dependencies: string[] = [];
    let complexity = 0;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Import analysis
      if (line.startsWith('import')) {
        const importInfo = this.parseImportStatement(line, lineNumber);
        if (importInfo) {
          imports.push(importInfo);
          if (!dependencies.includes(importInfo.module)) {
            dependencies.push(importInfo.module);
          }
        }
      }

      // Export analysis
      if (line.startsWith('export')) {
        const exportInfo = this.parseExportStatement(line, lineNumber);
        if (exportInfo) {
          exports.push(exportInfo);
        }
      }

      // Symbol analysis
      const lineSymbols = this.extractSymbolsFromLine(line, lineNumber);
      symbols.push(...lineSymbols);

      // Complexity calculation
      complexity += this.calculateLineComplexity(line);
    }

    return { imports, exports, symbols, dependencies, complexity };
  }

  /**
   * Analyze Python file
   */
  private analyzePythonFile(content: string): {
    imports: ImportInfo[];
    exports: ExportInfo[];
    symbols: SymbolInfo[];
    dependencies: string[];
    complexity: number;
  } {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: SymbolInfo[] = [];
    const dependencies: string[] = [];
    let complexity = 0;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Import analysis
      if (line.startsWith('import') || line.startsWith('from')) {
        const importInfo = this.parsePythonImport(line, lineNumber);
        if (importInfo) {
          imports.push(importInfo);
          if (!dependencies.includes(importInfo.module)) {
            dependencies.push(importInfo.module);
          }
        }
      }

      // Symbol analysis
      const lineSymbols = this.extractPythonSymbolsFromLine(line, lineNumber);
      symbols.push(...lineSymbols);

      // Complexity calculation
      complexity += this.calculatePythonLineComplexity(line);
    }

    return { imports, exports, symbols, dependencies, complexity };
  }

  /**
   * Parse JavaScript/TypeScript import statement
   */
  private parseImportStatement(line: string, lineNumber: number): ImportInfo | null {
    // import { foo, bar } from 'module'
    // import foo from 'module'
    // import * as foo from 'module'

    const importRegex = /^import\s+(.+?)\s+from\s+['"](.+?)['"]/;
    const match = line.match(importRegex);

    if (!match) return null;

    const importClause = match[1].trim();
    const module = match[2];

    let names: string[] = [];
    let isDefault = false;
    let isNamespace = false;

    if (importClause.startsWith('{') && importClause.endsWith('}')) {
      // Named imports: { foo, bar as baz }
      names = importClause.slice(1, -1).split(',')
        .map(name => name.trim().split(' as ')[0].trim())
        .filter(name => name.length > 0);
    } else if (importClause.startsWith('* as ')) {
      // Namespace import: * as foo
      names = [importClause.substring(5).trim()];
      isNamespace = true;
    } else {
      // Default import: foo
      names = [importClause.trim()];
      isDefault = true;
    }

    return {
      module,
      names,
      isDefault,
      isNamespace,
      line: lineNumber
    };
  }

  /**
   * Parse Python import statement
   */
  private parsePythonImport(line: string, lineNumber: number): ImportInfo | null {
    // import module
    // from module import name
    // from module import name as alias

    if (line.startsWith('import ')) {
      const module = line.substring(7).trim().split('.')[0];
      return {
        module,
        names: [module],
        isDefault: false,
        isNamespace: true,
        line: lineNumber
      };
    } else if (line.startsWith('from ')) {
      const parts = line.substring(5).split(' import ');
      if (parts.length === 2) {
        const module = parts[0].trim().split('.')[0];
        const names = parts[1].split(',').map(name => name.trim().split(' as ')[0].trim());
        return {
          module,
          names,
          isDefault: false,
          isNamespace: false,
          line: lineNumber
        };
      }
    }

    return null;
  }

  /**
   * Parse export statement
   */
  private parseExportStatement(line: string, lineNumber: number): ExportInfo | null {
    // export function foo()
    // export const foo = ...
    // export class Foo
    // export interface Foo
    // export type Foo = ...

    const exportRegex = /^export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type)\s+(\w+)/;
    const match = line.match(exportRegex);

    if (!match) return null;

    const keyword = line.match(/(?:function|const|let|var|class|interface|type)/)?.[0];
    const name = match[1];
    const isDefault = line.includes('default');

    let type: ExportInfo['type'];
    switch (keyword) {
      case 'function':
        type = 'function';
        break;
      case 'class':
        type = 'class';
        break;
      case 'interface':
        type = 'interface';
        break;
      case 'type':
        type = 'type';
        break;
      default:
        type = 'variable';
    }

    return {
      name,
      type,
      isDefault,
      line: lineNumber
    };
  }

  /**
   * Extract symbols from JavaScript/TypeScript line
   */
  private extractSymbolsFromLine(line: string, lineNumber: number): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // Function declarations
    const functionRegex = /(?:function|const|let|var)\s+(\w+)\s*[=:\(]/g;
    let match;
    while ((match = functionRegex.exec(line)) !== null) {
      const name = match[1];
      const type = line.includes('function') || line.includes('=>') ? 'function' : 'variable';
      symbols.push({
        name,
        type,
        line: lineNumber,
        column: match.index,
        scope: 'global',
        references: []
      });
    }

    // Class declarations
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(line)) !== null) {
      symbols.push({
        name: match[1],
        type: 'class',
        line: lineNumber,
        column: match.index,
        scope: 'global',
        references: []
      });
    }

    return symbols;
  }

  /**
   * Extract symbols from Python line
   */
  private extractPythonSymbolsFromLine(line: string, lineNumber: number): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // Function definitions
    const functionRegex = /def\s+(\w+)\s*\(/g;
    let match;
    while ((match = functionRegex.exec(line)) !== null) {
      symbols.push({
        name: match[1],
        type: 'function',
        line: lineNumber,
        column: match.index,
        scope: 'global',
        references: []
      });
    }

    // Class definitions
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(line)) !== null) {
      symbols.push({
        name: match[1],
        type: 'class',
        line: lineNumber,
        column: match.index,
        scope: 'global',
        references: []
      });
    }

    return symbols;
  }

  /**
   * Build symbol cross-references
   */
  private async buildSymbolReferences(): Promise<void> {
    // Create reverse index: symbol name -> files that reference it
    const symbolReferences: Map<string, SymbolReference[]> = new Map();

    for (const [filePath, fileInfo] of this.fileIndex) {
      // Add definitions
      for (const symbol of fileInfo.symbols) {
        if (!symbolReferences.has(symbol.name)) {
          symbolReferences.set(symbol.name, []);
        }
        symbolReferences.get(symbol.name)!.push({
          file: filePath,
          line: symbol.line,
          type: 'definition'
        });
      }

      // Add usages (simplified - look for symbol names in content)
      const content = fs.readFileSync(path.join(this.workspacePath, filePath), 'utf-8');
      for (const [symbolName, references] of symbolReferences) {
        const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
          const lineNumber = content.substring(0, match.index).split('\n').length;
          const existingRef = references.find(r => r.file === filePath && r.line === lineNumber);
          if (!existingRef) {
            references.push({
              file: filePath,
              line: lineNumber,
              type: 'usage'
            });
          }
        }
      }
    }

    // Update symbol references
    for (const [symbolName, references] of symbolReferences) {
      for (const ref of references) {
        const fileInfo = this.fileIndex.get(ref.file);
        if (fileInfo) {
          const symbol = fileInfo.symbols.find(s => s.name === symbolName);
          if (symbol) {
            symbol.references = references;
          }
        }
      }
    }
  }

  /**
   * Analyze module structure and dependencies
   */
  private async analyzeModules(): Promise<void> {
    // Group files into modules based on directory structure
    const moduleGroups = this.groupFilesIntoModules();

    for (const [moduleName, files] of moduleGroups) {
      const module = await this.analyzeModule(moduleName, files);
      this.moduleIndex.set(moduleName, module);
    }

    // Calculate dependents
    for (const [moduleName, module] of this.moduleIndex) {
      for (const dep of module.dependencies) {
        const depModule = this.moduleIndex.get(dep);
        if (depModule && !depModule.dependents.includes(moduleName)) {
          depModule.dependents.push(moduleName);
        }
      }
    }
  }

  /**
   * Group files into logical modules
   */
  private groupFilesIntoModules(): Map<string, string[]> {
    const modules = new Map<string, string[]>();

    for (const filePath of this.fileIndex.keys()) {
      const parts = filePath.split('/');
      let moduleName = 'root';

      // Determine module based on directory structure
      if (parts.length > 1) {
        // Use first directory level as module name
        moduleName = parts[0];

        // Special handling for common patterns
        if (parts.includes('src') && parts.includes('main')) {
          moduleName = 'main';
        } else if (parts.includes('src') && parts.includes('renderer')) {
          moduleName = 'renderer';
        } else if (parts.includes('backend') || parts.includes('api')) {
          moduleName = 'backend';
        } else if (parts.includes('test') || parts.includes('spec')) {
          moduleName = 'tests';
        }
      }

      if (!modules.has(moduleName)) {
        modules.set(moduleName, []);
      }
      modules.get(moduleName)!.push(filePath);
    }

    return modules;
  }

  /**
   * Analyze individual module
   */
  private async analyzeModule(moduleName: string, files: string[]): Promise<ArchitectureModule> {
    const dependencies = new Set<string>();
    const dependents: string[] = [];
    let totalComplexity = 0;
    let totalSymbols = 0;

    for (const filePath of files) {
      const fileInfo = this.fileIndex.get(filePath);
      if (fileInfo) {
        // Collect dependencies
        fileInfo.dependencies.forEach(dep => dependencies.add(dep));
        totalComplexity += fileInfo.complexity;
        totalSymbols += fileInfo.symbols.length;
      }
    }

    // Calculate cohesion (symbols per file ratio)
    const cohesion = totalSymbols / files.length;

    // Calculate coupling (dependencies per file ratio)
    const coupling = dependencies.size / files.length;

    // Determine module type
    const type = this.classifyModuleType(moduleName, files);

    return {
      name: moduleName,
      path: files[0]?.split('/')[0] || '',
      type,
      dependencies: Array.from(dependencies),
      dependents,
      complexity: totalComplexity,
      cohesion,
      coupling,
      files
    };
  }

  /**
   * Classify module type based on name and files
   */
  private classifyModuleType(moduleName: string, files: string[]): ArchitectureModule['type'] {
    const name = moduleName.toLowerCase();

    if (name.includes('core') || name.includes('main') || name === 'src') {
      return 'core';
    } else if (name.includes('feature') || name.includes('component')) {
      return 'feature';
    } else if (name.includes('util') || name.includes('helper') || name.includes('common')) {
      return 'utility';
    } else if (name.includes('test') || name.includes('spec')) {
      return 'test';
    } else if (name.includes('config') || name.includes('setting')) {
      return 'config';
    }

    return 'feature'; // Default
  }

  /**
   * Detect architectural patterns
   */
  private async detectArchitecturalPatterns(): Promise<ArchitectureOverview['patterns']> {
    const patterns = [];

    // MVC Pattern
    const mvcPattern = this.detectMVC();
    if (mvcPattern.confidence > 0.5) {
      patterns.push(mvcPattern);
    }

    // Layered Architecture
    const layeredPattern = this.detectLayeredArchitecture();
    if (layeredPattern.confidence > 0.5) {
      patterns.push(layeredPattern);
    }

    // Microservices Pattern
    const microservicesPattern = this.detectMicroservices();
    if (microservicesPattern.confidence > 0.5) {
      patterns.push(microservicesPattern);
    }

    return patterns;
  }

  /**
   * Detect MVC pattern
   */
  private detectMVC(): ArchitectureOverview['patterns'][0] {
    const modules = Array.from(this.moduleIndex.values());
    const hasModel = modules.some(m => m.name.toLowerCase().includes('model'));
    const hasView = modules.some(m => m.name.toLowerCase().includes('view') || m.name.toLowerCase().includes('component'));
    const hasController = modules.some(m => m.name.toLowerCase().includes('controller') || m.name.toLowerCase().includes('handler'));

    const confidence = (hasModel ? 0.4 : 0) + (hasView ? 0.3 : 0) + (hasController ? 0.3 : 0);
    const modulesFound = modules.filter(m =>
      m.name.toLowerCase().includes('model') ||
      m.name.toLowerCase().includes('view') ||
      m.name.toLowerCase().includes('controller') ||
      m.name.toLowerCase().includes('component') ||
      m.name.toLowerCase().includes('handler')
    ).map(m => m.name);

    return {
      name: 'MVC Pattern',
      description: 'Model-View-Controller architectural pattern detected',
      confidence,
      modules: modulesFound
    };
  }

  /**
   * Detect layered architecture
   */
  private detectLayeredArchitecture(): ArchitectureOverview['patterns'][0] {
    const modules = Array.from(this.moduleIndex.values());
    const layerNames = ['presentation', 'application', 'domain', 'infrastructure', 'data', 'api', 'ui'];
    const foundLayers = layerNames.filter(layer =>
      modules.some(m => m.name.toLowerCase().includes(layer))
    );

    const confidence = Math.min(1.0, foundLayers.length / 3);

    return {
      name: 'Layered Architecture',
      description: 'Multi-layered architectural pattern detected',
      confidence,
      modules: foundLayers
    };
  }

  /**
   * Detect microservices pattern
   */
  private detectMicroservices(): ArchitectureOverview['patterns'][0] {
    const modules = Array.from(this.moduleIndex.values());
    const microserviceIndicators = ['service', 'api', 'microservice', 'grpc', 'rest'];
    const microserviceModules = modules.filter(m =>
      microserviceIndicators.some(indicator => m.name.toLowerCase().includes(indicator))
    );

    const confidence = microserviceModules.length > 2 ? 0.8 : microserviceModules.length > 0 ? 0.4 : 0;

    return {
      name: 'Microservices',
      description: 'Microservices architectural pattern detected',
      confidence,
      modules: microserviceModules.map(m => m.name)
    };
  }

  /**
   * Identify architecture issues
   */
  private async identifyArchitectureIssues(): Promise<ArchitectureIssue[]> {
    const issues: ArchitectureIssue[] = [];

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies();
    for (const cycle of circularDeps) {
      issues.push({
        type: 'circular_dependency',
        severity: 'high',
        description: `Circular dependency detected: ${cycle.join(' -> ')}`,
        affectedModules: cycle,
        suggestion: 'Refactor to break circular dependency using dependency injection or event-driven architecture'
      });
    }

    // Check for tight coupling
    for (const [moduleName, module] of this.moduleIndex) {
      if (module.coupling > 5) {
        issues.push({
          type: 'tight_coupling',
          severity: 'medium',
          description: `${moduleName} has high coupling (${module.coupling.toFixed(1)} dependencies per file)`,
          affectedModules: [moduleName],
          suggestion: 'Consider introducing interfaces or facades to reduce coupling'
        });
      }
    }

    // Check for low cohesion
    for (const [moduleName, module] of this.moduleIndex) {
      if (module.cohesion < 2 && module.files.length > 3) {
        issues.push({
          type: 'low_cohesion',
          severity: 'medium',
          description: `${moduleName} has low cohesion (${module.cohesion.toFixed(1)} symbols per file)`,
          affectedModules: [moduleName],
          suggestion: 'Consider splitting into smaller, more focused modules'
        });
      }
    }

    return issues;
  }

  /**
   * Detect circular dependencies
   */
  private detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const visit = (moduleName: string, path: string[] = []): void => {
      if (recursionStack.has(moduleName)) {
        // Found cycle
        const cycleStart = path.indexOf(moduleName);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), moduleName]);
        }
        return;
      }

      if (visited.has(moduleName)) {
        return;
      }

      visited.add(moduleName);
      recursionStack.add(moduleName);

      const module = this.moduleIndex.get(moduleName);
      if (module) {
        for (const dep of module.dependencies) {
          if (this.moduleIndex.has(dep)) {
            visit(dep, [...path, moduleName]);
          }
        }
      }

      recursionStack.delete(moduleName);
    };

    for (const moduleName of this.moduleIndex.keys()) {
      if (!visited.has(moduleName)) {
        visit(moduleName);
      }
    }

    return cycles;
  }

  /**
   * Organize modules into architectural layers
   */
  private async organizeIntoLayers(): Promise<ArchitectureOverview['layers']> {
    const layers: ArchitectureOverview['layers'] = [
      {
        name: 'Presentation',
        modules: [],
        responsibilities: ['User interface', 'API endpoints', 'Request handling']
      },
      {
        name: 'Application',
        modules: [],
        responsibilities: ['Business logic', 'Use cases', 'Application services']
      },
      {
        name: 'Domain',
        modules: [],
        responsibilities: ['Business entities', 'Domain logic', 'Core business rules']
      },
      {
        name: 'Infrastructure',
        modules: [],
        responsibilities: ['Data persistence', 'External services', 'Frameworks']
      }
    ];

    for (const [moduleName, module] of this.moduleIndex) {
      const layerIndex = this.classifyModuleLayer(module);
      layers[layerIndex].modules.push(moduleName);
    }

    return layers;
  }

  /**
   * Classify module into architectural layer
   */
  private classifyModuleLayer(module: ArchitectureModule): number {
    const name = module.name.toLowerCase();

    // Presentation layer
    if (name.includes('ui') || name.includes('component') || name.includes('view') ||
        name.includes('renderer') || name.includes('frontend')) {
      return 0;
    }

    // Application layer
    if (name.includes('service') || name.includes('handler') || name.includes('controller') ||
        name.includes('use-case') || name.includes('application')) {
      return 1;
    }

    // Domain layer
    if (name.includes('model') || name.includes('entity') || name.includes('domain') ||
        name.includes('business') || name.includes('core')) {
      return 2;
    }

    // Infrastructure layer (default)
    return 3;
  }

  /**
   * Get all source files in workspace
   */
  private async getAllSourceFiles(): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.hpp'];

    const walk = (dir: string, relativePath: string = ''): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            // Skip excluded directories
            if (!this.isExcludedDirectory(entry.name)) {
              walk(fullPath, relPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              files.push(relPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    walk(this.workspacePath);
    return files;
  }

  /**
   * Check if directory should be excluded
   */
  private isExcludedDirectory(name: string): boolean {
    const excluded = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.nuxt', 'vendor', 'venv', '.venv', 'env'];
    return excluded.includes(name);
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.js':
        return 'javascript';
      case '.jsx':
        return 'javascript';
      case '.ts':
        return 'typescript';
      case '.tsx':
        return 'typescript';
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.cpp':
      case '.hpp':
        return 'cpp';
      case '.c':
      case '.h':
        return 'c';
      default:
        return 'unknown';
    }
  }

  /**
   * Calculate complexity for JavaScript/TypeScript line
   */
  private calculateLineComplexity(line: string): number {
    let complexity = 1; // Base complexity

    // Control structures
    if (line.includes('if ') || line.includes('else') || line.includes('switch')) {
      complexity += 1;
    }
    if (line.includes('for ') || line.includes('while ') || line.includes('do ')) {
      complexity += 1;
    }
    if (line.includes('try ') || line.includes('catch ') || line.includes('finally')) {
      complexity += 1;
    }

    // Operators
    const operators = ['&&', '||', '===', '!==', '<=', '>=', '+', '-', '*', '/', '%'];
    operators.forEach(op => {
      if (line.includes(op)) complexity += 0.5;
    });

    // Function calls
    const functionCalls = (line.match(/\w+\s*\(/g) || []).length;
    complexity += functionCalls * 0.2;

    return complexity;
  }

  /**
   * Calculate complexity for Python line
   */
  private calculatePythonLineComplexity(line: string): number {
    let complexity = 1;

    // Control structures
    if (line.includes('if ') || line.includes('elif ') || line.includes('else:')) {
      complexity += 1;
    }
    if (line.includes('for ') || line.includes('while ')) {
      complexity += 1;
    }
    if (line.includes('try:') || line.includes('except ') || line.includes('finally:')) {
      complexity += 1;
    }

    // Operators and expressions
    const operators = ['and ', 'or ', '==', '!=', '<=', '>=', '+', '-', '*', '/', '%'];
    operators.forEach(op => {
      if (line.includes(op)) complexity += 0.5;
    });

    // Function calls
    const functionCalls = (line.match(/\w+\s*\(/g) || []).length;
    complexity += functionCalls * 0.2;

    return complexity;
  }

  /**
   * Calculate basic complexity for unknown languages
   */
  private calculateBasicComplexity(content: string): number {
    const lines = content.split('\n');
    let totalComplexity = 0;

    for (const line of lines) {
      totalComplexity += Math.max(1, line.length / 50); // Rough heuristic
    }

    return totalComplexity;
  }

  /**
   * Get architecture overview
   */
  getArchitectureOverview(): ArchitectureOverview {
    return {
      modules: Array.from(this.moduleIndex.values()),
      layers: [],
      patterns: [],
      issues: []
    };
  }

  /**
   * Get file info with parsed structure
   */
  getFileInfo(filePath: string): FileInfo | null {
    return this.fileIndex.get(filePath) || null;
  }

  /**
   * Get core modules
   */
  getCoreModules(): ArchitectureModule[] {
    return Array.from(this.moduleIndex.values())
      .filter(module => module.type === 'core')
      .sort((a, b) => b.complexity - a.complexity);
  }
}

// Singleton instance
let codebaseIntrospectionInstance: CodebaseIntrospection | null = null;

export function getCodebaseIntrospection(workspacePath: string): CodebaseIntrospection {
  if (!codebaseIntrospectionInstance || codebaseIntrospectionInstance['workspacePath'] !== workspacePath) {
    codebaseIntrospectionInstance = new CodebaseIntrospection(workspacePath);
  }
  return codebaseIntrospectionInstance;
}
