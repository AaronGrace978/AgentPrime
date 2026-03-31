/**
 * AgentPrime Template Engine
 * Creates projects from templates with variable substitution
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { spawn, spawnSync } from 'child_process';
import { z } from 'zod';
import { sanitizeFolderName } from '../security/ipcValidation';

interface TemplateRegistry {
  version?: string;
  templates: Template[];
  categories: Category[];
}

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  icon?: string;
  variables?: Array<{ name: string; label: string; default?: string }>;
  postCreate?: string[];
  requirements?: string[];
}

interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

interface TemplateDefinition {
  id?: string;
  name?: string;
  version?: string;
  files?: TemplateFile[];
  directories?: string[];
  postCreate?: string[];
  requirements?: string[];
}

interface TemplateFile {
  template: string;
  path: string;
}

export interface CreateProjectResult {
  success: boolean;
  projectPath: string;
  template: string;
  filesCreated: string[];
  postCreate: string[];
  dependenciesInstalled?: boolean;
  installOutput?: string;
  stepResults?: PostCreateStepResult[];
}

export interface Variables {
  projectName: string;
  author?: string;
  description?: string;
  [key: string]: any;
}

interface TemplateContext extends Variables {
  originalProjectName: string;
  projectDirName: string;
  packageName: string;
  currentYear: string;
}

interface PostCreateStepResult {
  step: string;
  cwd: string;
  success: boolean;
  output: string;
}

interface MaterializeTemplateOptions {
  allowExistingNonEmpty?: boolean;
  runPostCreate?: boolean;
}

export type TemplateMaterializationMode = 'create-project' | 'in-place';

export interface TemplateMaterializationRequest {
  templateId: string;
  targetDir: string;
  variables: Variables;
  mode?: TemplateMaterializationMode;
  runPostCreate?: boolean;
}

interface FileSnapshot {
  existed: boolean;
  content?: Buffer;
}

const TemplateVariableSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  default: z.string().optional()
}).strict();

const TemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().optional(),
  variables: z.array(TemplateVariableSchema).optional(),
  postCreate: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional()
}).strict();

const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional()
}).strict();

const TemplateRegistrySchema = z.object({
  version: z.string().optional(),
  templates: z.array(TemplateSchema),
  categories: z.array(CategorySchema)
}).strict();

const TemplateFileSchema = z.object({
  template: z.string().min(1),
  path: z.string().min(1)
}).strict();

const TemplateDefinitionSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  version: z.string().optional(),
  files: z.array(TemplateFileSchema).default([]),
  directories: z.array(z.string()).optional(),
  postCreate: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional()
}).strict();

class TemplateEngine {
  private templatesDir: string;
  private registry: TemplateRegistry | null = null;

  constructor(templatesDir: string) {
    this.templatesDir = templatesDir;
    console.log(`[TemplateEngine] Initialized with templates directory: ${templatesDir}`);
  }

  private formatSchemaError(error: z.ZodError): string {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
  }

  private validateRegistry(parsed: unknown): TemplateRegistry {
    const registry = TemplateRegistrySchema.parse(parsed) as TemplateRegistry;
    const templateIds = new Set<string>();
    const categoryIds = new Set(registry.categories.map((category) => category.id));

    for (const template of registry.templates) {
      if (templateIds.has(template.id)) {
        throw new Error(`Duplicate template id in registry: ${template.id}`);
      }
      templateIds.add(template.id);

      if (template.category && !categoryIds.has(template.category)) {
        throw new Error(`Template '${template.id}' references unknown category '${template.category}'`);
      }
    }

    return registry;
  }

  private validateTemplateDefinition(templateId: string, template: Template, parsed: unknown): TemplateDefinition {
    const definition = TemplateDefinitionSchema.parse(parsed) as TemplateDefinition;

    if (definition.id && definition.id !== templateId) {
      throw new Error(`Template '${templateId}' has mismatched template.json id '${definition.id}'`);
    }

    if (definition.name && definition.name !== template.name) {
      throw new Error(`Template '${templateId}' has mismatched template.json name '${definition.name}'`);
    }

    if (definition.postCreate && template.postCreate && JSON.stringify(definition.postCreate) !== JSON.stringify(template.postCreate)) {
      throw new Error(`Template '${templateId}' has mismatched postCreate steps between registry and template.json`);
    }

    if (definition.requirements && template.requirements && JSON.stringify(definition.requirements) !== JSON.stringify(template.requirements)) {
      throw new Error(`Template '${templateId}' has mismatched requirements between registry and template.json`);
    }

    return definition;
  }

  /**
   * Load the template registry
   */
  loadRegistry(): TemplateRegistry {
    const registryPath = path.join(this.templatesDir, 'registry.json');
    console.log(`[TemplateEngine] Loading registry from: ${registryPath}`);

    if (!fs.existsSync(registryPath)) {
      const error = `Template registry not found at ${registryPath}`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      const validated = this.validateRegistry(parsed);
      this.registry = validated;
      const templateCount = validated.templates ? validated.templates.length : 0;
      const categoryCount = validated.categories ? validated.categories.length : 0;
      console.log(`[TemplateEngine] Registry loaded: ${templateCount} templates, ${categoryCount} categories`);
      return validated;
    } catch (e: any) {
      const details = e instanceof z.ZodError ? this.formatSchemaError(e) : e.message;
      const error = `Failed to parse registry JSON: ${details}`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }
  }

  /**
   * Get all available templates
   */
  getTemplates(): Template[] {
    console.log('[TemplateEngine] getTemplates() called');
    if (!this.registry) this.loadRegistry();
    const templates = this.registry!.templates || [];
    console.log(`[TemplateEngine] Returning ${templates.length} templates`);
    return templates;
  }

  /**
   * Get template categories
   */
  getCategories(): Category[] {
    console.log('[TemplateEngine] getCategories() called');
    if (!this.registry) this.loadRegistry();
    const categories = this.registry!.categories || [];
    console.log(`[TemplateEngine] Returning ${categories.length} categories`);
    return categories;
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(templateId: string): Template | undefined {
    console.log(`[TemplateEngine] getTemplate(${templateId}) called`);
    if (!this.registry) this.loadRegistry();
    const template = this.registry!.templates.find(t => t.id === templateId);
    if (template) {
      console.log(`[TemplateEngine] Template '${templateId}' found: ${template.name}`);
    } else {
      console.warn(`[TemplateEngine] Template '${templateId}' not found`);
    }
    return template;
  }

  private loadTemplateDefinition(templateId: string, template: Template): TemplateDefinition {
    const templateDir = path.join(this.templatesDir, templateId);
    const templateJsonPath = path.join(templateDir, 'template.json');

    if (!fs.existsSync(templateJsonPath)) {
      throw new Error(`Template definition not found for '${templateId}' at ${templateJsonPath}`);
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'));
      return this.validateTemplateDefinition(templateId, template, parsed);
    } catch (e: any) {
      const details = e instanceof z.ZodError ? this.formatSchemaError(e) : e.message;
      throw new Error(`Failed to parse template.json: ${details}`);
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private sanitizePackageName(name: string): string {
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');

    return normalized || 'app';
  }

  private buildTemplateContext(variables: Variables): TemplateContext {
    const originalProjectName = String(variables.projectName || '').trim();
    const projectDirName = sanitizeFolderName(originalProjectName);
    const projectName = projectDirName || 'untitled';
    const packageName = this.sanitizePackageName(projectName);
    const author = typeof variables.author === 'string' && variables.author.trim()
      ? variables.author.trim()
      : 'Developer';
    const description = typeof variables.description === 'string'
      ? variables.description.trim()
      : '';

    return {
      ...variables,
      originalProjectName,
      projectName,
      projectDirName: projectName,
      packageName,
      author,
      description,
      currentYear: new Date().getFullYear().toString()
    };
  }

  private getUniqueDirectories(filePaths: string[], fileName: string): string[] {
    const dirs = new Set<string>();

    for (const filePath of filePaths) {
      if (path.basename(filePath) !== fileName) continue;
      const dir = path.dirname(filePath);
      dirs.add(dir === '.' ? '' : dir);
    }

    return [...dirs];
  }

  private isLikelyBinary(buffer: Buffer): boolean {
    const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
    for (const byte of sample) {
      if (byte === 0) {
        return true;
      }
    }
    return false;
  }

  private ensureProjectDirectory(projectPath: string): void {
    if (fs.existsSync(projectPath)) {
      const existingEntries = fs.readdirSync(projectPath);
      if (existingEntries.length > 0) {
        throw new Error(`Target directory already exists and is not empty: ${projectPath}`);
      }
      return;
    }

    fs.mkdirSync(projectPath, { recursive: true });
  }

  private resolvePythonCommand(): { command: string; prefixArgs: string[] } | null {
    const candidates: Array<{ command: string; prefixArgs: string[] }> = process.platform === 'win32'
      ? [
          { command: 'py', prefixArgs: ['-3'] },
          { command: 'python', prefixArgs: [] },
          { command: 'python3', prefixArgs: [] }
        ]
      : [
          { command: 'python3', prefixArgs: [] },
          { command: 'python', prefixArgs: [] }
        ];

    for (const candidate of candidates) {
      const result = spawnSync(candidate.command, [...candidate.prefixArgs, '--version'], {
        shell: true,
        stdio: 'ignore'
      });
      if (result.status === 0) {
        return candidate;
      }
    }

    return null;
  }

  private resolveScopedPath(projectPath: string, scope?: string): string {
    const normalizedScope = (scope || '').trim().toLowerCase();
    if (!normalizedScope || normalizedScope === '.' || normalizedScope === 'root') {
      return projectPath;
    }

    const scopedPath = path.resolve(projectPath, scope || '');
    const relative = path.relative(projectPath, scopedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Post-create scope escapes project directory: ${scope}`);
    }

    return scopedPath;
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    label: string,
    timeoutMs = 10 * 60 * 1000
  ): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      let settled = false;

      let env = { ...process.env };
      try {
        const { getNodeEnv } = require('../core/tool-path-finder');
        env = getNodeEnv();
      } catch { /* fallback to process.env */ }
      
      const child = spawn(command, args, {
        cwd,
        shell: true,
        env
      });

      const finish = (result: { success: boolean; output: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          finish({ success: true, output: output || errorOutput || `${label} completed successfully` });
        } else {
          finish({ success: false, output: errorOutput || output || `${label} failed with code ${code}` });
        }
      });

      child.on('error', (err: Error) => {
        finish({ success: false, output: `Failed to run ${label}: ${err.message}` });
      });

      const timeout = setTimeout(() => {
        child.kill();
        finish({ success: false, output: `${label} timed out after ${Math.round(timeoutMs / 60000)} minutes` });
      }, timeoutMs);
    });
  }

  private resolveDeclaredPostCreate(template: Template, templateDef: TemplateDefinition): string[] {
    return templateDef.postCreate || template.postCreate || [];
  }
  private createPngChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii');
    const chunk = Buffer.concat([typeBuffer, data]);
    let crc = 0xffffffff;

    for (const byte of chunk) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        if ((crc & 1) !== 0) {
          crc = (crc >>> 1) ^ 0xedb88320;
        } else {
          crc >>>= 1;
        }
      }
    }

    crc = (crc ^ 0xffffffff) >>> 0;
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  private createMinimalPngBuffer(): Buffer {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(6, 9);
    ihdr.writeUInt8(0, 10);
    ihdr.writeUInt8(0, 11);
    ihdr.writeUInt8(0, 12);

    const pixelData = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);
    const compressed = zlib.deflateSync(pixelData);

    return Buffer.concat([
      signature,
      this.createPngChunk('IHDR', ihdr),
      this.createPngChunk('IDAT', compressed),
      this.createPngChunk('IEND', Buffer.alloc(0))
    ]);
  }

  private createMinimalIcoBuffer(): Buffer {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);

    const bitmapHeader = Buffer.alloc(40);
    bitmapHeader.writeUInt32LE(40, 0);
    bitmapHeader.writeInt32LE(1, 4);
    bitmapHeader.writeInt32LE(2, 8);
    bitmapHeader.writeUInt16LE(1, 12);
    bitmapHeader.writeUInt16LE(32, 14);
    bitmapHeader.writeUInt32LE(0, 16);
    bitmapHeader.writeUInt32LE(4, 20);
    bitmapHeader.writeInt32LE(0, 24);
    bitmapHeader.writeInt32LE(0, 28);
    bitmapHeader.writeUInt32LE(0, 32);
    bitmapHeader.writeUInt32LE(0, 36);

    const pixel = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const mask = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const dib = Buffer.concat([bitmapHeader, pixel, mask]);

    const directoryEntry = Buffer.alloc(16);
    directoryEntry.writeUInt8(1, 0);
    directoryEntry.writeUInt8(1, 1);
    directoryEntry.writeUInt8(0, 2);
    directoryEntry.writeUInt8(0, 3);
    directoryEntry.writeUInt16LE(1, 4);
    directoryEntry.writeUInt16LE(32, 6);
    directoryEntry.writeUInt32LE(dib.length, 8);
    directoryEntry.writeUInt32LE(22, 12);

    return Buffer.concat([header, directoryEntry, dib]);
  }
  private ensureTauriIcons(projectPath: string, snapshots?: Map<string, FileSnapshot>): string[] {
    const iconsDir = path.join(projectPath, 'src-tauri', 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });

    const png = this.createMinimalPngBuffer();
    const ico = this.createMinimalIcoBuffer();
    const created: string[] = [];
    const assets: Array<{ relativePath: string; buffer: Buffer }> = [
      { relativePath: path.join('src-tauri', 'icons', '32x32.png'), buffer: png },
      { relativePath: path.join('src-tauri', 'icons', '128x128.png'), buffer: png },
      { relativePath: path.join('src-tauri', 'icons', '128x128@2x.png'), buffer: png },
      { relativePath: path.join('src-tauri', 'icons', 'icon.ico'), buffer: ico }
    ];

    for (const asset of assets) {
      const targetPath = path.join(projectPath, asset.relativePath);
      if (!fs.existsSync(targetPath)) {
        if (snapshots) {
          this.writeTrackedFile(targetPath, asset.buffer, snapshots);
        } else {
          fs.writeFileSync(targetPath, asset.buffer);
        }
        created.push(asset.relativePath.replace(/\\/g, '/'));
      }
    }

    return created;
  }

  private ensureGeneratedAssets(templateId: string, projectPath: string, snapshots?: Map<string, FileSnapshot>): string[] {
    if (templateId === 'tauri-react') {
      return this.ensureTauriIcons(projectPath, snapshots);
    }

    return [];
  }

  private async executePostCreateStep(step: string, projectPath: string): Promise<PostCreateStepResult> {
    const match = step.match(/^(.*?)(?:\s+\(([^)]+)\))?$/);
    const baseStep = match?.[1]?.trim().toLowerCase() || step.trim().toLowerCase();
    const scope = match?.[2];
    const cwd = this.resolveScopedPath(projectPath, scope);

    let result: { success: boolean; output: string };
    if (baseStep === 'npm install') {
      result = await this.installNodeDependencies(cwd);
    } else if (baseStep === 'python environment setup') {
      result = await this.installPythonDependencies(cwd);
    } else if (baseStep === 'go mod tidy') {
      result = await this.runCommand('go', ['mod', 'tidy'], cwd, 'go mod tidy');
    } else if (baseStep === 'cargo build') {
      result = await this.runCommand('cargo', ['build'], cwd, 'cargo build');
    } else {
      result = await this.runCommand(step, [], cwd, step);
    }

    return {
      step,
      cwd,
      success: result.success,
      output: result.output
    };
  }

  private async executePostCreateSteps(
    template: Template,
    templateDef: TemplateDefinition,
    projectPath: string,
    files: TemplateFile[]
  ): Promise<{ success: boolean; output: string; stepResults: PostCreateStepResult[] }> {
    const steps = this.resolveDeclaredPostCreate(template, templateDef);
    const stepResults: PostCreateStepResult[] = [];

    if (steps.length === 0) {
      const inferred = await this.installTemplateDependencies(projectPath, files);
      return {
        success: inferred.success,
        output: inferred.output,
        stepResults
      };
    }

    for (const step of steps) {
      const stepResult = await this.executePostCreateStep(step, projectPath);
      stepResults.push(stepResult);
      if (!stepResult.success) {
        throw new Error(`Post-create step failed: ${step}\n${stepResult.output}`);
      }
    }

    return {
      success: true,
      output: stepResults.map((result) => `[${result.step}] ${result.cwd}\n${result.output}`).join('\n\n'),
      stepResults
    };
  }

  /**
   * Substitute variables in content
   */
  substituteVariables(content: string, variables: Variables): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${this.escapeRegExp(key)}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  private ensureTargetDirectory(projectPath: string, allowExistingNonEmpty: boolean): void {
    if (!allowExistingNonEmpty) {
      this.ensureProjectDirectory(projectPath);
      return;
    }

    fs.mkdirSync(projectPath, { recursive: true });
  }

  private snapshotFile(targetPath: string, snapshots: Map<string, FileSnapshot>): void {
    if (snapshots.has(targetPath)) {
      return;
    }

    if (!fs.existsSync(targetPath)) {
      snapshots.set(targetPath, { existed: false });
      return;
    }

    snapshots.set(targetPath, {
      existed: true,
      content: fs.readFileSync(targetPath)
    });
  }

  private writeTrackedFile(
    targetPath: string,
    content: Buffer | string,
    snapshots: Map<string, FileSnapshot>,
    encoding: BufferEncoding = 'utf-8'
  ): void {
    this.snapshotFile(targetPath, snapshots);

    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(targetPath, content);
      return;
    }

    fs.writeFileSync(targetPath, content, encoding);
  }

  private createTrackedDirectory(targetPath: string, createdDirectories: Set<string>): void {
    const normalizedTargetPath = path.resolve(targetPath);
    const missingDirectories: string[] = [];
    let currentPath = normalizedTargetPath;

    while (!fs.existsSync(currentPath)) {
      missingDirectories.push(currentPath);
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
    }

    fs.mkdirSync(normalizedTargetPath, { recursive: true });
    for (const dirPath of missingDirectories.reverse()) {
      createdDirectories.add(dirPath);
    }
  }

  private cleanupEmptyParentDirectories(targetPath: string, stopAt: string): void {
    let currentPath = path.dirname(targetPath);
    const normalizedStopAt = path.resolve(stopAt);

    while (currentPath.startsWith(normalizedStopAt) && currentPath !== normalizedStopAt) {
      if (!fs.existsSync(currentPath)) {
        currentPath = path.dirname(currentPath);
        continue;
      }

      if (fs.readdirSync(currentPath).length > 0) {
        break;
      }

      fs.rmdirSync(currentPath);
      currentPath = path.dirname(currentPath);
    }
  }

  private rollbackMaterialization(
    projectPath: string,
    snapshots: Map<string, FileSnapshot>,
    projectPathExisted: boolean,
    createdDirectories: Set<string>
  ): void {
    if (!projectPathExisted && fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
      return;
    }

    const trackedPaths = [...snapshots.entries()].sort(([left], [right]) => right.length - left.length);
    for (const [targetPath, snapshot] of trackedPaths) {
      if (!snapshot.existed) {
        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { force: true });
        }
        this.cleanupEmptyParentDirectories(targetPath, projectPath);
        continue;
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, snapshot.content ?? Buffer.alloc(0));
    }

    const trackedDirectories = [...createdDirectories].sort((left, right) => right.length - left.length);
    for (const dirPath of trackedDirectories) {
      if (!fs.existsSync(dirPath)) {
        continue;
      }

      if (fs.readdirSync(dirPath).length === 0) {
        fs.rmdirSync(dirPath);
      }
    }
  }

  private resolveMaterializationRequest(request: TemplateMaterializationRequest): {
    templateId: string;
    projectPath: string;
    variables: Variables;
    allowExistingNonEmpty: boolean;
    runPostCreate: boolean;
  } {
    const mode = request.mode || 'create-project';
    const normalizedTargetDir = path.resolve(request.targetDir);
    const templateContext = this.buildTemplateContext(request.variables);
    const projectPath = mode === 'in-place'
      ? normalizedTargetDir
      : path.join(normalizedTargetDir, templateContext.projectDirName);

    return {
      templateId: request.templateId,
      projectPath,
      variables: request.variables,
      allowExistingNonEmpty: mode === 'in-place',
      runPostCreate: request.runPostCreate ?? mode !== 'in-place'
    };
  }

  private async materializeTemplate(
    templateId: string,
    projectPath: string,
    variables: Variables,
    options: MaterializeTemplateOptions = {}
  ): Promise<CreateProjectResult> {
    const template = this.getTemplate(templateId);
    if (!template) {
      const error = `Template '${templateId}' not found`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }

    const templateDir = path.join(this.templatesDir, templateId);
    const templateDef = this.loadTemplateDefinition(templateId, template);
    const templateContext = this.buildTemplateContext(variables);

    console.log(`[TemplateEngine] Materializing template '${templateId}' into: ${projectPath}`);
    console.log(`[TemplateEngine] Template definition loaded: ${templateDef.files?.length || 0} files, ${templateDef.directories?.length || 0} directories`);

    const projectPathExisted = fs.existsSync(projectPath);
    const fileSnapshots = new Map<string, FileSnapshot>();
    const createdDirectories = new Set<string>();
    this.ensureTargetDirectory(projectPath, options.allowExistingNonEmpty === true);

    try {
      if (templateDef.directories) {
        for (const dir of templateDef.directories) {
          const dirPath = path.join(projectPath, dir);
          try {
            this.createTrackedDirectory(dirPath, createdDirectories);
          } catch (e: any) {
            console.warn(`[TemplateEngine] Warning: Failed to create directory ${dir}: ${e.message}`);
          }
        }
      }

      const createdFiles: string[] = [];
      if (templateDef.files) {
        for (const file of templateDef.files) {
          const sourcePath = path.join(templateDir, file.template);
          const targetPath = path.join(projectPath, file.path);

          try {
            this.createTrackedDirectory(path.dirname(targetPath), createdDirectories);
          } catch (e: any) {
            console.warn(`[TemplateEngine] Warning: Failed to create parent directory for ${file.path}: ${e.message}`);
          }

          if (!fs.existsSync(sourcePath)) {
            throw new Error(`Template file not found: ${sourcePath}`);
          }

          try {
            const buffer = fs.readFileSync(sourcePath);
            if (this.isLikelyBinary(buffer)) {
              this.writeTrackedFile(targetPath, buffer, fileSnapshots);
            } else {
              let content = buffer.toString('utf-8');
              content = this.substituteVariables(content, templateContext);
              this.writeTrackedFile(targetPath, content, fileSnapshots);
            }
            createdFiles.push(file.path.replace(/\\/g, '/'));
            console.log(`[TemplateEngine] Created file: ${file.path}`);
          } catch (e: any) {
            console.error(`[TemplateEngine] ERROR: Failed to process file ${file.path}: ${e.message}`);
            throw new Error(`Failed to create file ${file.path}: ${e.message}`);
          }
        }
      }

      const batFiles = this.generateBatFiles(projectPath, templateContext, fileSnapshots).map((file) => file.replace(/\\/g, '/'));
      const pythonBats = this.generatePythonBatFiles(projectPath, templateContext, fileSnapshots).map((file) => file.replace(/\\/g, '/'));
      const generatedAssets = this.ensureGeneratedAssets(templateId, projectPath, fileSnapshots).map((file) => file.replace(/\\/g, '/'));
      createdFiles.push(...batFiles, ...pythonBats, ...generatedAssets);

      let dependenciesInstalled = false;
      let installOutput = 'Post-create steps skipped';
      let stepResults: PostCreateStepResult[] = [];

      if (options.runPostCreate !== false) {
        const executed = await this.executePostCreateSteps(
          template,
          templateDef,
          projectPath,
          templateDef.files || []
        );
        dependenciesInstalled = executed.success;
        installOutput = executed.output;
        stepResults = executed.stepResults;
      }

      return {
        success: true,
        projectPath,
        template: templateId,
        filesCreated: createdFiles,
        postCreate: templateDef.postCreate || template.postCreate || [],
        dependenciesInstalled,
        installOutput,
        stepResults
      };
    } catch (error) {
      try {
        this.rollbackMaterialization(projectPath, fileSnapshots, projectPathExisted, createdDirectories);
      } catch (rollbackError: any) {
        console.error(`[TemplateEngine] ERROR: Failed to rollback materialization for '${templateId}': ${rollbackError.message}`);
      }
      throw error;
    }
  }

  async materializeProject(request: TemplateMaterializationRequest): Promise<CreateProjectResult> {
    const resolved = this.resolveMaterializationRequest(request);
    return this.materializeTemplate(
      resolved.templateId,
      resolved.projectPath,
      resolved.variables,
      {
        allowExistingNonEmpty: resolved.allowExistingNonEmpty,
        runPostCreate: resolved.runPostCreate
      }
    );
  }

  async applyTemplateInPlace(
    templateId: string,
    projectPath: string,
    variables: Variables,
    options: MaterializeTemplateOptions = {}
  ): Promise<CreateProjectResult> {
    return this.materializeProject({
      templateId,
      targetDir: projectPath,
      variables,
      mode: 'in-place',
      runPostCreate: options.runPostCreate
    });
  }

  /**
   * Create a project from a template
   */
  async createProject(templateId: string, targetDir: string, variables: Variables): Promise<CreateProjectResult> {
    console.log(`[TemplateEngine] createProject() called: templateId=${templateId}, targetDir=${targetDir}`);
    console.log(`[TemplateEngine] Variables:`, JSON.stringify(variables, null, 2));
    const templateContext = this.buildTemplateContext(variables);
    console.log(`[TemplateEngine] Original project name: "${templateContext.originalProjectName}" -> Sanitized: "${templateContext.projectDirName}"`);

    const projectPath = path.join(targetDir, templateContext.projectDirName);
    console.log(`[TemplateEngine] Project will be created at: ${projectPath}`);

    const result = await this.materializeProject({
      templateId,
      targetDir,
      variables,
      mode: 'create-project',
      runPostCreate: true
    });

    console.log(`[TemplateEngine] Project creation completed successfully!`);
    console.log(`[TemplateEngine] Total files created: ${result.filesCreated.length}`);
    console.log(`[TemplateEngine] Dependencies installed: ${result.dependenciesInstalled}`);
    console.log(`[TemplateEngine] Project path: ${result.projectPath}`);

    return result;
  }

  /**
   * Install dependencies for all manifests declared by a template.
   */
  async installTemplateDependencies(
    projectPath: string,
    files: TemplateFile[]
  ): Promise<{ success: boolean; output: string }> {
    const outputs: string[] = [];
    let allSucceeded = true;

    const filePaths = files.map((file) => file.path);
    const packageDirs = this.getUniqueDirectories(filePaths, 'package.json');
    const requirementsDirs = this.getUniqueDirectories(filePaths, 'requirements.txt');

    for (const dir of packageDirs) {
      const targetPath = dir ? path.join(projectPath, dir) : projectPath;
      console.log(`[TemplateEngine] Node.js project detected at ${targetPath}, installing dependencies...`);
      const nodeResult = await this.installNodeDependencies(targetPath);
      outputs.push(`[npm install] ${dir || '.'}\n${nodeResult.output}`);
      allSucceeded = allSucceeded && nodeResult.success;
    }

    for (const dir of requirementsDirs) {
      const targetPath = dir ? path.join(projectPath, dir) : projectPath;
      console.log(`[TemplateEngine] Python project detected at ${targetPath}, setting up environment...`);
      const pythonResult = await this.installPythonDependencies(targetPath);
      outputs.push(`[python setup] ${dir || '.'}\n${pythonResult.output}`);
      allSucceeded = allSucceeded && pythonResult.success;
    }

    if (outputs.length === 0) {
      return {
        success: true,
        output: 'No automatic dependency installation steps were detected for this template.'
      };
    }

    return {
      success: allSucceeded,
      output: outputs.join('\n\n')
    };
  }

  /**
   * Install dependencies for Node.js projects (runs npm install)
   * Returns a promise that resolves with install result
   */
  async installNodeDependencies(projectPath: string): Promise<{ success: boolean; output: string }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[TemplateEngine] No package.json found, skipping npm install`);
      return { success: true, output: 'No package.json found' };
    }

    console.log(`[TemplateEngine] Running npm install in ${projectPath}...`);
    
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const npmCmd = isWindows ? 'npm.cmd' : 'npm';
      
      let output = '';
      let errorOutput = '';
      
      let env = { ...process.env };
      try {
        const { getNodeEnv } = require('../core/tool-path-finder');
        env = getNodeEnv();
      } catch { /* fallback to process.env */ }
      
      const npmProcess = spawn(npmCmd, ['install'], {
        cwd: projectPath,
        shell: true,
        env
      });

      npmProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        console.log(`[TemplateEngine] npm: ${text.trim()}`);
      });

      npmProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        // npm often writes progress to stderr, so don't treat all as errors
        console.log(`[TemplateEngine] npm: ${text.trim()}`);
      });

      const timeout = setTimeout(() => {
        npmProcess.kill();
        resolve({ success: false, output: 'npm install timed out after 5 minutes' });
      }, 5 * 60 * 1000);

      npmProcess.on('close', (code: number | null) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(`[TemplateEngine] npm install completed successfully`);
          resolve({ success: true, output: output || 'Dependencies installed successfully' });
        } else {
          console.error(`[TemplateEngine] npm install failed with code ${code}`);
          resolve({ success: false, output: errorOutput || output || `npm install failed with code ${code}` });
        }
      });

      npmProcess.on('error', (err: Error) => {
        clearTimeout(timeout);
        console.error(`[TemplateEngine] npm install error: ${err.message}`);
        resolve({ success: false, output: `Failed to run npm install: ${err.message}` });
      });
    });
  }

  /**
   * Install dependencies for Python projects (creates venv and runs pip install)
   * Returns a promise that resolves with install result
   */
  async installPythonDependencies(projectPath: string): Promise<{ success: boolean; output: string }> {
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    
    if (!fs.existsSync(requirementsPath)) {
      console.log(`[TemplateEngine] No requirements.txt found, skipping Python setup`);
      return { success: true, output: 'No requirements.txt found' };
    }

    console.log(`[TemplateEngine] Setting up Python environment in ${projectPath}...`);
    
    return new Promise((resolve) => {
      let output = '';
      let settled = false;
      let activeProcess: ReturnType<typeof spawn> | null = null;
      
      // First create venv
      const pythonRuntime = this.resolvePythonCommand();
      if (!pythonRuntime) {
        resolve({ success: false, output: 'Python runtime not found on PATH' });
        return;
      }
      const venvPath = path.join(projectPath, 'venv');
      
      if (fs.existsSync(venvPath)) {
        console.log(`[TemplateEngine] Virtual environment already exists`);
      }
      
      const createVenv = spawn(pythonRuntime.command, [...pythonRuntime.prefixArgs, '-m', 'venv', 'venv'], {
        cwd: projectPath,
        shell: true
      });
      activeProcess = createVenv;

      const finish = (result: { success: boolean; output: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      createVenv.on('close', (code) => {
        if (code !== 0) {
          finish({ success: false, output: 'Failed to create virtual environment' });
          return;
        }
        
        console.log(`[TemplateEngine] Virtual environment created, installing dependencies...`);
        
        // Now install requirements
        const isWindows = process.platform === 'win32';
        const pipPath = isWindows 
          ? path.join(projectPath, 'venv', 'Scripts', 'pip.exe')
          : path.join(projectPath, 'venv', 'bin', 'pip');
        
        const pipInstall = spawn(pipPath, ['install', '-r', 'requirements.txt'], {
          cwd: projectPath,
          shell: true
        });
        activeProcess = pipInstall;

        pipInstall.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
        });

        pipInstall.stderr?.on('data', (data: Buffer) => {
          output += data.toString();
        });

        pipInstall.on('close', (pipCode) => {
          if (pipCode === 0) {
            console.log(`[TemplateEngine] Python dependencies installed successfully`);
            finish({ success: true, output: output || 'Python dependencies installed' });
          } else {
            console.error(`[TemplateEngine] pip install failed`);
            finish({ success: false, output: output || 'pip install failed' });
          }
        });

        pipInstall.on('error', (err) => {
          finish({ success: false, output: `pip install error: ${err.message}` });
        });
      });

      createVenv.on('error', (err) => {
        finish({ success: false, output: `Failed to create venv: ${err.message}` });
      });

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        activeProcess?.kill();
        finish({ success: false, output: 'Python setup timed out after 5 minutes' });
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Generate .bat launcher files from package.json scripts
   */
  generateBatFiles(projectPath: string, variables: Variables, snapshots?: Map<string, FileSnapshot>): string[] {
    const createdBats: string[] = [];
    const packageJsonPath = path.join(projectPath, 'package.json');

    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      return createdBats;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts = packageJson.scripts || {};

      // Common scripts to create .bat files for
      const scriptMap: { [key: string]: string } = {
        'dev': 'dev.bat',
        'start': 'start.bat',
        'build': 'build.bat',
        'test': 'test.bat',
        'lint': 'lint.bat',
        'preview': 'preview.bat'
      };

      for (const [scriptName, batFileName] of Object.entries(scriptMap)) {
        if (scripts[scriptName]) {
          const batContent = this.createBatFile(scriptName, scripts[scriptName], variables);
          const batPath = path.join(projectPath, batFileName);
          if (snapshots) {
            this.writeTrackedFile(batPath, batContent, snapshots);
          } else {
            fs.writeFileSync(batPath, batContent, 'utf-8');
          }
          createdBats.push(batFileName);
        }
      }

      // Create a master "run.bat" that shows available scripts
      if (Object.keys(scripts).length > 0) {
        const runBat = this.createRunBat(scripts, variables);
        const runBatPath = path.join(projectPath, 'run.bat');
        if (snapshots) {
          this.writeTrackedFile(runBatPath, runBat, snapshots);
        } else {
          fs.writeFileSync(runBatPath, runBat, 'utf-8');
        }
        createdBats.push('run.bat');
      }
    } catch (e: any) {
      console.error('Error generating .bat files:', e);
    }

    return createdBats;
  }

  /**
   * Generate Node.js/npm detection code for .bat files
   */
  generateNodeDetectionCode(): string {
    return `REM ============================================================
REM Node.js/npm Detection - Finds Node.js if not in PATH
REM ============================================================
set NODE_EXE=
set NPM_EXE=

REM Check if npm is already in PATH
where npm >nul 2>&1
if not errorlevel 1 (
    set "NPM_EXE=npm"
    set "NODE_EXE=node"
    goto :node_found
)

REM Check common Node.js installation locations
if exist "A:\\nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\nodejs\\node.exe"
    set "NPM_EXE=A:\\nodejs\\npm.cmd"
    set "PATH=A:\\nodejs;%PATH%"
    goto :node_found
)
if exist "A:\\Nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\Nodejs\\node.exe"
    set "NPM_EXE=A:\\Nodejs\\npm.cmd"
    set "PATH=A:\\Nodejs;%PATH%"
    goto :node_found
)
if exist "C:\\Program Files\\nodejs\\npm.cmd" (
    set "NODE_EXE=C:\\Program Files\\nodejs\\node.exe"
    set "NPM_EXE=C:\\Program Files\\nodejs\\npm.cmd"
    set "PATH=C:\\Program Files\\nodejs;%PATH%"
    goto :node_found
)
if exist "%ProgramFiles%\\nodejs\\npm.cmd" (
    set "NODE_EXE=%ProgramFiles%\\nodejs\\node.exe"
    set "NPM_EXE=%ProgramFiles%\\nodejs\\npm.cmd"
    set "PATH=%ProgramFiles%\\nodejs;%PATH%"
    goto :node_found
)
if exist "%LOCALAPPDATA%\\Programs\\nodejs\\npm.cmd" (
    set "NODE_EXE=%LOCALAPPDATA%\\Programs\\nodejs\\node.exe"
    set "NPM_EXE=%LOCALAPPDATA%\\Programs\\nodejs\\npm.cmd"
    set "PATH=%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"
    goto :node_found
)
if exist "%APPDATA%\\nvm\\current\\npm.cmd" (
    set "NODE_EXE=%APPDATA%\\nvm\\current\\node.exe"
    set "NPM_EXE=%APPDATA%\\nvm\\current\\npm.cmd"
    set "PATH=%APPDATA%\\nvm\\current;%PATH%"
    goto :node_found
)

REM Check other common drive letters
for %%d in (D E F G H) do (
    if exist "%%d:\\Program Files\\nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\Program Files\\nodejs\\node.exe"
        set "NPM_EXE=%%d:\\Program Files\\nodejs\\npm.cmd"
        set "PATH=%%d:\\Program Files\\nodejs;%PATH%"
        goto :node_found
    )
    if exist "%%d:\\nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\nodejs\\node.exe"
        set "NPM_EXE=%%d:\\nodejs\\npm.cmd"
        set "PATH=%%d:\\nodejs;%PATH%"
        goto :node_found
    )
)

REM If still not found, show error
echo [ERROR] Node.js/npm not found!
echo.
echo Please install Node.js from https://nodejs.org/
echo Or add Node.js to your system PATH.
pause
exit /b 1

:node_found
REM Node.js found, continue with script
`;
  }

  /**
   * Create a .bat file for a specific npm script
   */
  createBatFile(scriptName: string, scriptCommand: string, variables: Variables): string {
    const projectName = variables.projectName || 'project';
    const nodeDetection = this.generateNodeDetectionCode();
    return `@echo off
REM ${projectName} - ${scriptName} launcher
REM Generated by AgentPrime

echo.
echo ========================================
echo   ${projectName} - ${scriptName}
echo ========================================
echo.

cd /d "%~dp0"

${nodeDetection}

REM Check if node_modules exists, install if needed
if not exist "node_modules" (
    echo [*] Installing dependencies...
    if defined NPM_EXE (
        call "%NPM_EXE%" install
    ) else (
        call npm install
    )
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [*] Dependencies installed successfully!
    echo.
)

REM Use detected npm or fallback to npm in PATH
if defined NPM_EXE (
    call "%NPM_EXE%" run ${scriptName}
) else (
    call npm run ${scriptName}
)

if errorlevel 1 (
    echo.
    echo [ERROR] Command failed!
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Command completed!
pause
`;
  }

  /**
   * Create a master run.bat that shows all available scripts
   */
  createRunBat(scripts: { [key: string]: string }, variables: Variables): string {
    const projectName = variables.projectName || 'project';
    let menu = `@echo off
REM ${projectName} - Script Launcher
REM Generated by AgentPrime

:menu
cls
echo.
echo ========================================
echo   ${projectName} - Available Scripts
echo ========================================
echo.
`;

    let optionNum = 1;
    const scriptOptions: Array<{ name: string; command: string }> = [];
    for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
      menu += `echo   [${optionNum}] ${scriptName.padEnd(12)} - ${scriptCommand}\n`;
      scriptOptions.push({ name: scriptName, command: scriptCommand });
      optionNum++;
    }

    menu += `echo   [${optionNum}] Exit
echo.
set /p choice="Select option: "

if "%choice%"=="" goto menu
`;

    // Generate if statements for each option
    for (let i = 0; i < scriptOptions.length; i++) {
      const opt = scriptOptions[i];
      menu += `if "%choice%"=="${i + 1}" goto run_${opt.name}\n`;
    }

    menu += `if "%choice%"=="${optionNum}" exit
goto menu

`;

    // Generate run sections for each script
    for (const opt of scriptOptions) {
      menu += `:run_${opt.name}
cls
echo.
echo ========================================
echo   Running: ${opt.name}
echo ========================================
echo.
cd /d "%~dp0"
call npm run ${opt.name}
echo.
pause
goto menu

`;
    }

    return menu;
  }

  /**
   * Generate Python detection code for .bat files
   * Tries multiple methods to find Python on any Windows machine
   */
  generatePythonDetectionCode(): string {
    return `REM Auto-detect Python installation
set PYTHON_CMD=
set PYTHON_FOUND=0

REM Method 1: Try 'python' command (most common)
where python >nul 2>&1
if %errorlevel%==0 (
    python --version >nul 2>&1
    if %errorlevel%==0 (
        set PYTHON_CMD=python
        set PYTHON_FOUND=1
    )
)

REM Method 2: Try 'python3' command
if %PYTHON_FOUND%==0 (
    where python3 >nul 2>&1
    if %errorlevel%==0 (
        python3 --version >nul 2>&1
        if %errorlevel%==0 (
            set PYTHON_CMD=python3
            set PYTHON_FOUND=1
        )
    )
)

REM Method 3: Try Windows Python launcher 'py'
if %PYTHON_FOUND%==0 (
    where py >nul 2>&1
    if %errorlevel%==0 (
        py --version >nul 2>&1
        if %errorlevel%==0 (
            set PYTHON_CMD=py
            set PYTHON_FOUND=1
        )
    )
)

REM Method 4: Check common installation paths
if %PYTHON_FOUND%==0 (
    REM Check LocalAppData (user installs)
    if exist "%LOCALAPPDATA%\\Programs\\Python" (
        for /d %%P in ("%LOCALAPPDATA%\\Programs\\Python\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check Program Files
    if exist "%PROGRAMFILES%\\Python*" (
        for /d %%P in ("%PROGRAMFILES%\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check Program Files (x86)
    if exist "%PROGRAMFILES(X86)%\\Python*" (
        for /d %%P in ("%PROGRAMFILES(X86)%\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check C:\\Python* (common custom install location)
    if exist "C:\\Python*" (
        for /d %%P in ("C:\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check AppData\\Python
    if exist "%APPDATA%\\Python\\Python*" (
        for /d %%P in ("%APPDATA%\\Python\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

:check_done
if %PYTHON_FOUND%==0 (
    echo.
    echo [ERROR] Python not found!
    echo.
    echo Please install Python from https://www.python.org/downloads/
    echo Or ensure Python is in your system PATH.
    echo.
    pause
    exit /b 1
)

REM Verify Python works
%PYTHON_CMD% --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Python found but not working: %PYTHON_CMD%
    echo.
    pause
    exit /b 1
)`;
  }

  /**
   * Generate .bat files for Python projects
   */
  generatePythonBatFiles(projectPath: string, variables: Variables, snapshots?: Map<string, FileSnapshot>): string[] {
    const createdBats: string[] = [];
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    const pyProjectPath = path.join(projectPath, 'pyproject.toml');
    const hasPython = fs.existsSync(requirementsPath) || fs.existsSync(pyProjectPath);

    if (!hasPython) {
      return createdBats;
    }

    const projectName = variables.projectName || 'project';

    // Create setup.bat for installing dependencies
    if (fs.existsSync(requirementsPath)) {
      const pythonDetection = this.generatePythonDetectionCode();
      const setupBat = `@echo off
REM ${projectName} - Setup Python Environment
REM Generated by AgentPrime

echo.
echo ========================================
echo   ${projectName} - Python Setup
echo ========================================
echo.

cd /d "%~dp0"

${pythonDetection}

echo [INFO] Using Python: %PYTHON_CMD%
%PYTHON_CMD% --version
echo.

echo [1/2] Creating virtual environment...
if not exist "venv" (
    %PYTHON_CMD% -m venv venv
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
    echo Virtual environment created!
) else (
    echo Virtual environment already exists.
)

echo.
echo [2/2] Installing dependencies...
call venv\\Scripts\\activate.bat
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to activate virtual environment!
    pause
    exit /b 1
)

REM Use python -m pip to ensure we use the venv's pip
%PYTHON_CMD% -m pip install --upgrade pip >nul 2>&1
%PYTHON_CMD% -m pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo [ERROR] Installation failed!
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Setup complete!
echo.
echo To activate the virtual environment, run:
echo   venv\\Scripts\\activate.bat
echo.
pause
`;
      const setupBatPath = path.join(projectPath, 'setup.bat');
      if (snapshots) {
        this.writeTrackedFile(setupBatPath, setupBat, snapshots);
      } else {
        fs.writeFileSync(setupBatPath, setupBat, 'utf-8');
      }
      createdBats.push('setup.bat');
    }

    // Create run.bat for Python projects
    const mainPyPath = path.join(projectPath, 'src', 'main.py');
    const cliPyPath = path.join(projectPath, 'src', 'cli.py');
    let runScript = 'main.py';

    if (fs.existsSync(cliPyPath)) {
      runScript = 'src/cli.py';
    } else if (fs.existsSync(mainPyPath)) {
      runScript = 'src/main.py';
    } else {
      // Look for any .py file in src/
      const srcPath = path.join(projectPath, 'src');
      if (fs.existsSync(srcPath)) {
        const files = fs.readdirSync(srcPath);
        const pyFile = files.find(f => f.endsWith('.py') && !f.startsWith('__'));
        if (pyFile) {
          runScript = `src/${pyFile}`;
        }
      }
    }

    if (runScript && fs.existsSync(path.join(projectPath, runScript))) {
      const pythonDetection = this.generatePythonDetectionCode();
      const runBat = `@echo off
REM ${projectName} - Run Python Application
REM Generated by AgentPrime

echo.
echo ========================================
echo   ${projectName} - Running...
echo ========================================
echo.

cd /d "%~dp0"

if not exist "venv" (
    echo [ERROR] Virtual environment not found!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Try to use venv's Python directly first (most reliable)
if exist "venv\\Scripts\\python.exe" (
    set VENV_PYTHON=venv\\Scripts\\python.exe
    %VENV_PYTHON% ${runScript} %*
    if errorlevel 1 (
        echo.
        echo [ERROR] Application failed!
        pause
        exit /b 1
    )
    pause
    exit /b 0
)

REM Fallback: Try to activate venv and use python command
${pythonDetection}

call venv\\Scripts\\activate.bat
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to activate virtual environment!
    echo Trying to use system Python instead...
    echo.
    %PYTHON_CMD% ${runScript} %*
) else (
    REM Use venv's python (should be in PATH after activation)
    python ${runScript} %*
)

if errorlevel 1 (
    echo.
    echo [ERROR] Application failed!
    pause
    exit /b 1
)

pause
`;
      const runBatPath = path.join(projectPath, 'run.bat');
      if (snapshots) {
        this.writeTrackedFile(runBatPath, runBat, snapshots);
      } else {
        fs.writeFileSync(runBatPath, runBat, 'utf-8');
      }
      createdBats.push('run.bat');
    }

    return createdBats;
  }
}

export default TemplateEngine;
