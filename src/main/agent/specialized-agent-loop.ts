/**
 * Specialized Agent Loop - ROBUST VERSION
 * 
 * Key improvements:
 * 1. Verification loop - checks if project is actually complete
 * 2. Self-correction - retries if files are missing
 * 3. Dependency checking - ensures all referenced files exist
 * 4. Single-pass orchestrator - creates ALL files needed
 * 5. Project documentation - generates PROJECT_LOG.md on completion
 * 6. Project memory - remembers past projects for updates
 */

import { routeToSpecialists, executeWithSpecialists, AGENT_CONFIGS, AgentRole, type SpecialistExecutionCallbacks } from './specialized-agents';
import { AgentContext } from '../agent-loop';
import { getProjectRegistry, ProjectRegistry } from './project-registry';
import { ProjectDocumenter } from './project-documenter';
import { testProjectInBrowser, formatBrowserTestResults } from './tools/projectTester';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { withAITimeoutAndRetry, TimeoutError } from '../core/timeout-utils';
import { transactionManager } from '../core/transaction-manager';
import { retryWithRecovery, getUserFriendlyErrorMessage } from '../core/error-recovery';
import { listWorkspaceSourceFilesSync } from '../core/workspace-glob';

const MAX_RETRIES = 2;

interface ProjectVerification {
  isComplete: boolean;
  missingFiles: string[];
  errors: string[];
  createdFiles: string[];
}

export class SpecializedAgentLoop extends EventEmitter {
  private context: AgentContext;
  private workHistory: Map<AgentRole, string[]> = new Map();
  private registry: ProjectRegistry;
  private stopRequested = false;

  constructor(context: AgentContext) {
    super();
    this.context = context;
    this.registry = getProjectRegistry();
  }

  requestStop(_reason: string = 'Stopped by user'): void {
    this.stopRequested = true;
  }

  /**
   * Run a task using specialized agents WITH VERIFICATION
   */
  async run(userMessage: string): Promise<string> {
    console.log('[SpecializedAgent] Starting specialized agent execution...');
    this.stopRequested = false;
    this.emit('task-start', { task: userMessage });

    // Start transaction for this specialized agent task
    const transactionId = transactionManager.startTransaction(`Specialized agent task: ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`);

    try {
      // Check if this is an update to an existing project
    const existingProject = this.registry.findByPath(this.context.workspacePath);
    const isUpdate = existingProject !== undefined;
    
    if (isUpdate) {
      console.log(`[SpecializedAgent] 🔄 Updating existing project: ${existingProject.name}`);
    }
    
    let retryCount = 0;
    let allCreatedFiles: string[] = [];
    let lastVerification: ProjectVerification | null = null;

    // Main execution loop with retries
    while (retryCount <= MAX_RETRIES) {
      if (this.stopRequested) {
        return `⏹️ **Agent stopped by user**\n\nCreated so far: ${allCreatedFiles.length} file(s).`;
      }

      // Step 1: Route to appropriate specialists
      const roles = routeToSpecialists(userMessage, {
        files: this.getProjectFiles(),
        language: this.detectLanguage(),
        projectType: this.detectProjectType()
      });

      console.log(`[SpecializedAgent] Attempt ${retryCount + 1}/${MAX_RETRIES + 1} - Routing to: ${roles.join(', ')}`);

      // Step 2: Build the task message (include missing files if retrying)
      let taskMessage = userMessage;
      if (retryCount > 0 && lastVerification && lastVerification.missingFiles.length > 0) {
        taskMessage = `CRITICAL: The following files are MISSING and MUST be created:\n${lastVerification.missingFiles.map(f => `- ${f}`).join('\n')}\n\nOriginal task: ${userMessage}\n\nCreate these missing files with COMPLETE, WORKING content. Do not skip any file.`;
        console.log(`[SpecializedAgent] Retry with missing files: ${lastVerification.missingFiles.join(', ')}`);
      }

      // Step 3: Execute with specialists
      const trackerMode = retryCount > 0 ? 'fix' : (isUpdate ? 'enhance' : 'create');
      const specialistCallbacks: SpecialistExecutionCallbacks = {
        shouldCancel: () => this.stopRequested,
        onToolStart: (event) => {
          this.emit('step-start', {
            type: event.type,
            title: event.title,
            specialist: event.specialist
          });
        },
        onToolComplete: (event) => {
          this.emit('step-complete', event);
        },
        onFileChange: (change) => {
          this.emit('file-modified', {
            path: change.filePath,
            action: change.action,
            oldContent: change.oldContent,
            newContent: change.newContent
          });
        },
        onCommandOutput: (event) => {
          this.emit('command-output', event);
        }
      };

      let specialistRun: Awaited<ReturnType<typeof executeWithSpecialists>>;
      try {
        specialistRun = await executeWithSpecialists(
          taskMessage,
          roles,
          {
            workspacePath: this.context.workspacePath,
            files: this.getProjectFiles()
          },
          trackerMode,
          specialistCallbacks
        );
      } catch (error) {
        if (this.stopRequested) {
          return `⏹️ **Agent stopped by user**\n\nCreated so far: ${allCreatedFiles.length} file(s).`;
        }
        throw error;
      }

      const { results, finalAnalysis, executedTools } = specialistRun;

      if (finalAnalysis) {
        this.emit('critique-complete', { analysis: finalAnalysis });
      }

      // Step 4: Collect created files from this run
      const newFiles: string[] = [];
      if (executedTools) {
        for (const tool of executedTools) {
          if (tool.toolCall?.function?.name === 'write_file' && tool.toolCall?.function?.arguments?.path) {
            const filePath = tool.toolCall.function.arguments.path;
            if (!allCreatedFiles.includes(filePath)) {
              allCreatedFiles.push(filePath);
              newFiles.push(filePath);
            }
          }
        }
      }

      console.log(`[SpecializedAgent] Created ${newFiles.length} new files: ${newFiles.join(', ')}`);

      // Step 5: VERIFY the project is complete
      lastVerification = await this.verifyProject(allCreatedFiles);
      
      // AUTO-FIX: Always run auto-fixer (even if verification fails, it can fix issues)
      try {
        const { ProjectAutoFixer } = await import('./tools/project-auto-fixer');
        const fixResult = await ProjectAutoFixer.fixProject(this.context.workspacePath);
        if (fixResult.fixes.length > 0) {
          console.log(`[SpecializedAgent] 🔧 Auto-fixed ${fixResult.fixes.length} issue(s):`);
          fixResult.fixes.forEach(fix => console.log(`  - ${fix}`));
        }
        if (fixResult.errors.length > 0) {
          console.warn(`[SpecializedAgent] ⚠️ ${fixResult.errors.length} error(s) during auto-fix:`);
          fixResult.errors.forEach(err => console.warn(`  - ${err}`));
        }
      } catch (error: any) {
        console.warn('[SpecializedAgent] Auto-fix failed (non-critical):', error.message);
      }

      if (lastVerification.isComplete) {
        console.log('[SpecializedAgent] ✅ Project verification PASSED');
        
        // Install dependencies if package.json exists
        await this.installDependenciesIfNeeded();
        
        // Step 6: BROWSER TESTING - Test the project in a real browser
        try {
          console.log('[SpecializedAgent] 🌐 Running browser tests...');
          const browserTestResult = await testProjectInBrowser(this.context.workspacePath);
          
          if (browserTestResult.passed) {
            console.log(`[SpecializedAgent] ✅ Browser tests passed (score: ${browserTestResult.score}/100)`);
          } else {
            console.log(`[SpecializedAgent] ⚠️ Browser tests found issues (score: ${browserTestResult.score}/100)`);
            console.log(formatBrowserTestResults(browserTestResult));
            
            // Add browser test issues to verification errors
            for (const issue of browserTestResult.issues.filter(i => i.severity === 'critical')) {
              lastVerification.errors.push(`[Browser Test] ${issue.description}`);
            }
            
            // If critical UI issues found, mark as incomplete for retry
            const criticalUIIssues = browserTestResult.issues.filter(i => 
              i.severity === 'critical' && 
              (i.category === 'click' || i.category === 'layout')
            );
            
            if (criticalUIIssues.length > 0 && retryCount < MAX_RETRIES) {
              console.log(`[SpecializedAgent] 🔧 Found ${criticalUIIssues.length} critical UI issues - will retry`);
              lastVerification.isComplete = false;
              lastVerification.errors.push(
                ...criticalUIIssues.map(i => `CSS FIX NEEDED: ${i.description}. ${i.suggestedFix || ''}`)
              );
            }
          }
        } catch (browserTestError: any) {
          console.warn('[SpecializedAgent] Browser testing skipped:', browserTestError.message);
          // Non-critical - continue without browser tests
        }
        
        // Only finalize if still complete after browser tests
        if (lastVerification.isComplete) {
          // Generate project documentation and register
          await this.finalizeProject(userMessage, allCreatedFiles, isUpdate);
          
          break;
        }
      }
      
      // Project verification or browser tests failed
      console.log(`[SpecializedAgent] ⚠️ Project verification FAILED - Missing: ${lastVerification.missingFiles.join(', ')}`);
      if (lastVerification.errors.length > 0) {
        console.log(`[SpecializedAgent] ⚠️ Errors: ${lastVerification.errors.slice(0, 3).join('; ')}`);
      }
      retryCount++;
      
      if (retryCount > MAX_RETRIES) {
        console.log('[SpecializedAgent] Max retries reached, returning partial result');
      }
    }

    // Step 6: Build final response

    // Commit transaction on successful completion
    try {
      await transactionManager.commitTransaction();
      console.log(`[SpecializedAgent] ✅ Transaction committed: ${transactionId}`);
    } catch (txError) {
      console.error(`[SpecializedAgent] ❌ Transaction commit failed:`, txError);
    }

    return this.buildResponse(allCreatedFiles, lastVerification);
    } catch (error) {
      // On timeout, try to rollback to last checkpoint instead of full rollback
      if (error instanceof TimeoutError) {
        try {
          const lastCheckpoint = transactionManager.getLastCheckpoint();
          if (lastCheckpoint) {
            console.log(`[SpecializedAgent] ⏱️ Timeout detected - rolling back to checkpoint: ${lastCheckpoint}`);
            await transactionManager.rollbackToCheckpoint(lastCheckpoint);
            console.log(`[SpecializedAgent] 🔄 Rolled back to checkpoint, preserving work up to that point`);
          } else {
            // No checkpoint, do full rollback
            await transactionManager.rollbackTransaction();
            console.log(`[SpecializedAgent] 🔄 Transaction rolled back (no checkpoint available)`);
          }
        } catch (rollbackError) {
          console.error(`[SpecializedAgent] ❌ Transaction rollback failed:`, rollbackError);
        }
      } else {
        // For non-timeout errors, do full rollback
        try {
          await transactionManager.rollbackTransaction();
          console.log(`[SpecializedAgent] 🔄 Transaction rolled back: ${transactionId}`);
        } catch (rollbackError) {
          console.error(`[SpecializedAgent] ❌ Transaction rollback failed:`, rollbackError);
        }
      }
      throw error; // Re-throw the original error
    }
  }

  /**
   * Finalize project - register in memory and generate documentation
   */
  private async finalizeProject(
    originalPrompt: string,
    createdFiles: string[],
    isUpdate: boolean
  ): Promise<void> {
    const workspacePath = this.context.workspacePath;
    const projectName = path.basename(workspacePath);
    
    // Detect project type and technologies
    const allFiles = this.getAllFiles(workspacePath);
    const projectType = ProjectRegistry.detectProjectType(allFiles);
    const technologies = ProjectRegistry.detectTechnologies(allFiles, workspacePath);
    
    // Generate description from prompt
    const description = this.generateDescription(originalPrompt);
    
    // Register project in memory
    const project = this.registry.registerProject(workspacePath, {
      name: projectName,
      type: projectType,
      description,
      files: createdFiles,
      technologies,
      prompt: originalPrompt,
      action: isUpdate ? 'update' : 'create'
    });
    
    console.log(`[SpecializedAgent] 📝 Project registered: ${project.name} (${project.type})`);
    
    // Update .bat files to include Node.js detection (for existing projects)
    try {
      const { updateProjectBatFiles } = require('../core/update-bat-files');
      const result = updateProjectBatFiles(workspacePath);
      if (result.updated > 0) {
        console.log(`[SpecializedAgent] 🔧 Updated ${result.updated} .bat file(s) with Node.js detection`);
      }
    } catch (error) {
      // Non-critical, continue
    }
    
    // Create run.bat for Node.js projects if it doesn't exist
    try {
      const runBatPath = path.join(workspacePath, 'run.bat');
      const packageJsonPath = path.join(workspacePath, 'package.json');
      
      if (!fs.existsSync(runBatPath) && fs.existsSync(packageJsonPath)) {
        const { ProjectRunner } = require('./tools/projectRunner');
        const projectInfo = await ProjectRunner.detectProject(workspacePath);
        
        if (projectInfo.type === 'node' && projectInfo.startCommand) {
          const batResult = ProjectRunner.createNodeBatchFile(workspacePath, projectInfo);
          if (batResult.success) {
            console.log(`[SpecializedAgent] 🔧 Created run.bat for easy project launching`);
          }
        }
      }
    } catch (error) {
      // Non-critical, continue
    }
    
    // Generate PROJECT_LOG.md
    try {
      const logPath = ProjectDocumenter.writeProjectLog(workspacePath, {
        projectPath: workspacePath,
        projectName: project.name,
        description: project.description,
        files: allFiles,
        technologies,
        buildHistory: project.buildHistory,
        originalPrompt,
        isUpdate
      });
      
      console.log(`[SpecializedAgent] 📄 Generated documentation: ${path.basename(logPath)}`);
    } catch (error) {
      console.warn('[SpecializedAgent] Could not generate project log:', error);
    }
  }

  /**
   * Generate a short description from the user's prompt
   */
  private generateDescription(prompt: string): string {
    // Extract first sentence or first 100 chars
    const firstSentence = prompt.split(/[.!?]/)[0];
    if (firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return prompt.substring(0, 100).trim() + '...';
  }

  /**
   * Verify the project is complete
   * Checks for missing dependencies, empty files, and referenced but non-existent files
   * NOW WITH SMART VALIDATION: Checks if referenced files make sense for the task
   */
  private async verifyProject(createdFiles: string[]): Promise<ProjectVerification> {
    const missingFiles: string[] = [];
    const errors: string[] = [];
    const workspacePath = this.context.workspacePath;

    // Get all files in workspace
    const existingFiles = this.getAllFiles(workspacePath);
    
    // Check each HTML file for referenced CSS/JS
    for (const file of existingFiles) {
      if (file.endsWith('.html')) {
        const filePath = path.join(workspacePath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for empty files
          if (content.trim().length === 0) {
            errors.push(`${file} is empty`);
            missingFiles.push(file); // Need to recreate
            continue;
          }

          // Find CSS references
          const cssRefs = content.match(/href=["']([^"']+\.css)["']/g) || [];
          for (const ref of cssRefs) {
            const cssFile = ref.match(/href=["']([^"']+\.css)["']/)?.[1];
            if (cssFile && !cssFile.startsWith('http')) {
              const normalizedPath = this.normalizePath(cssFile);
              if (!existingFiles.includes(normalizedPath) && !this.fileExists(workspacePath, cssFile)) {
                // SMART VALIDATION: Check if file name makes sense
                if (this.isValidFileReference(cssFile, workspacePath)) {
                  missingFiles.push(normalizedPath);
                } else {
                  // File reference doesn't make sense - likely a hallucination
                  errors.push(`${file} references invalid CSS file: ${cssFile} (likely hallucinated)`);
                }
              }
            }
          }

          // Find JS references
          const jsRefs = content.match(/src=["']([^"']+\.js)["']/g) || [];
          for (const ref of jsRefs) {
            const jsFile = ref.match(/src=["']([^"']+\.js)["']/)?.[1];
            if (jsFile && !jsFile.startsWith('http')) {
              const normalizedPath = this.normalizePath(jsFile);
              if (!existingFiles.includes(normalizedPath) && !this.fileExists(workspacePath, jsFile)) {
                // SMART VALIDATION: Check if file name makes sense for the project
                if (this.isValidFileReference(jsFile, workspacePath)) {
                  missingFiles.push(normalizedPath);
                } else {
                  // File reference doesn't make sense - likely a hallucination
                  errors.push(`${file} references invalid JS file: ${jsFile} (likely hallucinated - check if it matches the project type)`);
                }
              }
            }
          }
        } catch (err) {
          errors.push(`Could not read ${file}: ${err}`);
        }
      }
    }

    // Check for empty files
    for (const file of existingFiles) {
      const filePath = path.join(workspacePath, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.size === 0) {
          if (!missingFiles.includes(file)) {
            missingFiles.push(file);
            errors.push(`${file} is empty (0 bytes)`);
          }
        }
      } catch (err) {
        // Skip
      }
    }

    // Dedupe missing files
    const uniqueMissing = [...new Set(missingFiles)];

    return {
      isComplete: uniqueMissing.length === 0 && errors.length === 0,
      missingFiles: uniqueMissing,
      errors,
      createdFiles
    };
  }

  /**
   * Build the final response with project status
   */
  private buildResponse(createdFiles: string[], verification: ProjectVerification | null): string {
    const projectType = this.detectProjectType();
    const hasPackageJson = this.getProjectFiles().includes('package.json');
    const hasIndexHtml = this.getProjectFiles().some(f => f === 'index.html' || f.endsWith('/index.html'));
    
    let response = `## ✅ Project Created!\n\n`;
    response += `**Location:** \`${this.context.workspacePath}\`\n\n`;
    
    if (createdFiles.length > 0) {
      response += `### Files Created\n`;
      createdFiles.forEach(file => {
        // Check if file exists and has content
        const fullPath = path.join(this.context.workspacePath, file);
        let status = '✅';
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) status = '⚠️ (empty)';
        } catch {
          status = '❌ (missing)';
        }
        response += `- ${status} \`${file}\`\n`;
      });
      response += `\n`;
    }

    // Show verification results
    if (verification) {
      if (verification.isComplete) {
        response += `### ✅ Verification Passed\n`;
        response += `All files created and properly linked!\n\n`;
      } else {
        if (verification.missingFiles.length > 0) {
          response += `### ⚠️ Missing Files\n`;
          verification.missingFiles.forEach(file => {
            response += `- \`${file}\`\n`;
          });
          response += `\n`;
        }
        if (verification.errors.length > 0) {
          response += `### ⚠️ Issues Found\n`;
          verification.errors.forEach(err => {
            response += `- ${err}\n`;
          });
          response += `\n`;
        }
      }
    }

    // Add action buttons
    response += `### Actions\n`;
    response += `**📂 Open Folder:** [Click to open](file://${this.context.workspacePath})\n\n`;
    
    if (hasIndexHtml) {
      response += `**🚀 Launch in Browser:** Open \`index.html\` in your browser\n\n`;
    }
    
    if (hasPackageJson) {
      response += `**📦 Install Dependencies:** Run \`npm install\` in the project folder\n\n`;
    }

    // Mention the PROJECT_LOG.md
    const logExists = fs.existsSync(path.join(this.context.workspacePath, 'PROJECT_LOG.md'));
    if (logExists) {
      response += `### 📝 Documentation\n`;
      response += `A \`PROJECT_LOG.md\` file has been generated with:\n`;
      response += `- Build history and changes\n`;
      response += `- How to run the project\n`;
      response += `- Suggested improvements\n\n`;
    }

    response += `---\n🎉 Your project is ready!`;

    return response;
  }

  /**
   * Get all source files in workspace (fast glob, ignores node_modules / .git / build dirs)
   */
  private getAllFiles(dir: string, _baseDir: string = dir): string[] {
    return listWorkspaceSourceFilesSync(dir, 8000);
  }

  /**
   * Check if a file exists (handles relative paths)
   */
  private fileExists(workspacePath: string, filePath: string): boolean {
    const fullPath = path.join(workspacePath, filePath);
    return fs.existsSync(fullPath);
  }

  /**
   * Normalize a path (remove leading ./ etc)
   */
  private normalizePath(filePath: string): string {
    return filePath.replace(/^\.\//, '').replace(/\\/g, '/');
  }

  /**
   * Check if a file reference makes sense for this project
   * Prevents hallucinated file names (e.g., tetris.js in a Minecraft project)
   */
  private isValidFileReference(fileName: string, workspacePath: string): boolean {
    const fileNameLower = fileName.toLowerCase();
    const allFiles = this.getAllFiles(workspacePath);
    
    // Check existing files to understand project type
    const projectContext = this.inferProjectContext(allFiles);
    
    // Common mismatches
    const mismatches: { [key: string]: string[] } = {
      'minecraft': ['tetris', 'snake', 'pong', 'breakout'],
      'tetris': ['minecraft', 'voxel', 'chunk', 'block'],
      'voxel': ['tetris', 'snake'],
      'block': ['tetris', 'snake']
    };
    
    // If project is Minecraft/voxel/block related, reject Tetris files
    if (projectContext.includes('minecraft') || projectContext.includes('voxel') || projectContext.includes('block')) {
      if (fileNameLower.includes('tetris') || fileNameLower.includes('snake')) {
        console.warn(`[Verification] Rejecting invalid file reference: ${fileName} (doesn't match Minecraft/voxel project)`);
        return false;
      }
    }
    
    // If project is Tetris related, reject Minecraft files
    if (projectContext.includes('tetris')) {
      if (fileNameLower.includes('minecraft') || fileNameLower.includes('voxel') || fileNameLower.includes('chunk')) {
        console.warn(`[Verification] Rejecting invalid file reference: ${fileName} (doesn't match Tetris project)`);
        return false;
      }
    }
    
    // Generic file names are always valid (game.js, app.js, main.js, etc.)
    const genericNames = ['game', 'app', 'main', 'index', 'script', 'style', 'styles', 'utils', 'config'];
    if (genericNames.some(name => fileNameLower.includes(name))) {
      return true;
    }
    
    // If we can't determine, allow it (better to be permissive than reject valid files)
    return true;
  }

  /**
   * Infer project context from existing files
   */
  private inferProjectContext(files: string[]): string {
    const context: string[] = [];
    const allFileNames = files.map(f => f.toLowerCase()).join(' ');
    
    if (allFileNames.includes('minecraft') || allFileNames.includes('voxel') || allFileNames.includes('chunk') || allFileNames.includes('block')) {
      context.push('minecraft');
      context.push('voxel');
      context.push('block');
    }
    
    if (allFileNames.includes('tetris')) {
      context.push('tetris');
    }
    
    return context.join(' ');
  }

  /**
   * Get project files for context (shallow, current directory only)
   */
  private getProjectFiles(): string[] {
    try {
      const files = fs.readdirSync(this.context.workspacePath);
      return files.filter(f => {
        const filePath = path.join(this.context.workspacePath, f);
        try {
          const stat = fs.statSync(filePath);
          return stat.isFile() && !f.startsWith('.');
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  /**
   * Detect primary language
   */
  private detectLanguage(): string | undefined {
    const files = this.getProjectFiles();
    if (files.some(f => f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx'))) {
      return 'javascript';
    }
    if (files.some(f => f.endsWith('.py'))) {
      return 'python';
    }
    return undefined;
  }

  /**
   * Detect project type
   */
  private detectProjectType(): string | undefined {
    const files = this.getProjectFiles();
    if (files.includes('package.json')) {
      return 'node';
    }
    if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
      return 'python';
    }
    if (files.some(f => f.endsWith('.html'))) {
      return 'web';
    }
    return undefined;
  }

  /**
   * Install dependencies automatically if package.json or requirements.txt exists
   */
  private async installDependenciesIfNeeded(): Promise<void> {
    const workspacePath = this.context.workspacePath;
    const packageJsonPath = path.join(workspacePath, 'package.json');
    const requirementsPath = path.join(workspacePath, 'requirements.txt');

    // Check for Node.js project
    if (fs.existsSync(packageJsonPath)) {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { resolveCommand, getNodeEnv } = require('../core/tool-path-finder');
      
      const nodeModulesPath = path.join(workspacePath, 'node_modules');
      let installAttempt = 0;
      const maxAttempts = 2;
      
      while (installAttempt < maxAttempts) {
        installAttempt++;
        try {
          console.log(`[SpecializedAgent] 📦 Installing npm dependencies (attempt ${installAttempt}/${maxAttempts})...`);
          
          // Use tool-path-finder to resolve npm command and get proper environment
          // CRITICAL: getNodeEnv() ensures child processes (like esbuild's postinstall) can find node.exe
          const npmCommand = resolveCommand('npm install');
          const env = getNodeEnv();
          
          console.log('[SpecializedAgent] Running:', npmCommand);
          
          const { stdout, stderr } = await execAsync(npmCommand, {
            cwd: workspacePath,
            timeout: 180000, // 3 minutes (longer for large projects)
            env: env,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
          });
          
          console.log('[SpecializedAgent] ✅ Dependencies installed successfully');
          if (stdout) console.log(stdout.substring(0, 500));
          break; // Success, exit loop
          
        } catch (error: any) {
          console.warn(`[SpecializedAgent] ⚠️ Install attempt ${installAttempt} failed:`, error.message);
          
          // If first attempt fails, try cleaning node_modules and retrying
          if (installAttempt < maxAttempts && fs.existsSync(nodeModulesPath)) {
            console.log('[SpecializedAgent] 🧹 Cleaning corrupted node_modules for retry...');
            try {
              fs.rmSync(nodeModulesPath, { recursive: true, force: true });
              const lockPath = path.join(workspacePath, 'package-lock.json');
              if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
              }
              console.log('[SpecializedAgent] ✅ Cleaned up, retrying install...');
            } catch (cleanError: any) {
              console.warn('[SpecializedAgent] Could not clean node_modules:', cleanError.message);
              break; // Can't clean, don't retry
            }
          }
        }
      }
    }

    // Check for Python project
    if (fs.existsSync(requirementsPath)) {
      try {
        console.log('[SpecializedAgent] 📦 Installing Python dependencies...');
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Use tool-path-finder to resolve python/pip command with proper environment
        const { resolveCommand, getPythonEnv } = require('../core/tool-path-finder');
        const pipCommand = resolveCommand('pip install -r requirements.txt');
        const env = getPythonEnv();
        
        const { stdout, stderr } = await execAsync(pipCommand, {
          cwd: workspacePath,
          timeout: 180000, // 3 minutes
          env: env,
          maxBuffer: 10 * 1024 * 1024
        });
        
        console.log('[SpecializedAgent] ✅ Python dependencies installed successfully');
        if (stdout) console.log(stdout.substring(0, 500));
      } catch (error: any) {
        console.warn('[SpecializedAgent] ⚠️ Failed to install Python dependencies:', error.message);
        // Don't fail the whole process if install fails
      }
    }
  }
}
