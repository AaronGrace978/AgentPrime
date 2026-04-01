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
import { getTelemetryService } from '../core/telemetry-service';
import { getTaskMaster, type TaskMasterRetryContext } from './task-master';
import {
  getProjectRuntimeProfileSync,
  mapRuntimeKindToRegistryType,
} from './project-runtime';
import { scaffoldProjectFromTemplate } from './scaffold-resolver';
import {
  LEGACY_SPECIALIST_ROLE_MAP,
  type SpecialistBlackboard,
  type SpecialistId,
} from './specialist-contracts';
import { ProjectRunner } from './tools/projectRunner';
import { getPluginManager } from '../core/plugin-singleton';
import { reviewSessionManager } from './review-session-manager';
import type {
  AgentReviewFinding,
  AgentReviewSessionSnapshot,
  AgentReviewVerificationState,
} from '../../types/agent-review';

const MAX_RETRIES = 2;

interface ProjectVerification {
  isComplete: boolean;
  missingFiles: string[];
  errors: string[];
  createdFiles: string[];
}

function extractFilesFromVerificationIssue(summary: string): string[] {
  const matches = summary.match(/[A-Za-z0-9_./-]+\.(tsx?|jsx?|py|json|html|css|md|yml|yaml|toml|rs|js)/g) || [];
  let anchorFile: string | null = null;
  const normalized = matches.map((match) => {
    const cleaned = match.replace(/\\/g, '/');
    if (cleaned.startsWith('./') || cleaned.startsWith('../')) {
      if (!anchorFile) {
        return cleaned.replace(/^\.\//, '');
      }
      return path.posix.normalize(path.posix.join(path.posix.dirname(anchorFile), cleaned));
    }
    anchorFile = anchorFile || cleaned;
    return cleaned;
  });
  return [...new Set(normalized)];
}

function inferVerificationStage(summary: string): AgentReviewFinding['stage'] {
  const normalized = summary.toLowerCase();
  if (normalized.startsWith('[install]') || normalized.includes('install failed')) {
    return 'install';
  }
  if (normalized.startsWith('[build]') || normalized.includes('build failed')) {
    return 'build';
  }
  if (normalized.startsWith('[run]') || normalized.includes('run failed')) {
    return 'run';
  }
  if (normalized.startsWith('[browser') || normalized.includes('browser fix needed')) {
    return 'browser';
  }
  if (normalized.startsWith('[validate]') || normalized.includes('missing file')) {
    return 'validation';
  }
  return 'unknown';
}

export class SpecializedAgentLoop extends EventEmitter {
  private context: AgentContext;
  private workHistory: Map<AgentRole, string[]> = new Map();
  private registry: ProjectRegistry;
  private stopRequested = false;
  private pendingReviewSession: AgentReviewSessionSnapshot | null = null;

  constructor(context: AgentContext) {
    super();
    this.context = context;
    this.registry = getProjectRegistry();
  }

  requestStop(_reason: string = 'Stopped by user'): void {
    this.stopRequested = true;
  }

  consumePendingReviewSession(): AgentReviewSessionSnapshot | null {
    const snapshot = this.pendingReviewSession;
    this.pendingReviewSession = null;
    return snapshot;
  }

  private resolveMode(isUpdate: boolean, retryCount: number): SpecialistBlackboard['mode'] {
    if (retryCount > 0) {
      return 'repair';
    }
    return isUpdate ? 'edit' : 'create';
  }

  private resolveRuntimeBudget(
    requestedBudget: AgentContext['runtimeBudget'],
    userMessage: string,
    isUpdate: boolean,
    retryCount: number
  ): 'instant' | 'standard' | 'deep' {
    if (retryCount > 0) {
      return 'deep';
    }
    if (requestedBudget === 'deep') {
      return 'deep';
    }

    const normalizedTask = userMessage.toLowerCase();
    const looksRisky =
      (!isUpdate && /(scaffold|template|full app|full application|tauri|desktop|browser test|e2e|security|performance|migrate)/.test(normalizedTask)) ||
      normalizedTask.length > 800;

    if (requestedBudget === 'instant') {
      return looksRisky ? 'standard' : 'instant';
    }

    return looksRisky ? 'deep' : 'standard';
  }

  private mapLegacyRoleToSpecialist(role: AgentRole): SpecialistId {
    if (role === 'repair_specialist') {
      return 'repair_specialist';
    }
    return LEGACY_SPECIALIST_ROLE_MAP[role as keyof typeof LEGACY_SPECIALIST_ROLE_MAP];
  }

  private buildSpecialistRoster(
    roles: AgentRole[],
    mode: SpecialistBlackboard['mode']
  ): SpecialistId[] {
    const mapped = roles.map((role) => this.mapLegacyRoleToSpecialist(role));
    const roster = new Set<SpecialistId>(['executive_router', 'task_master', ...mapped]);

    if (mode === 'create') {
      roster.add('template_scaffold_specialist');
    }

    if (mode === 'repair') {
      roster.add('repair_specialist');
    }

    return [...roster];
  }

  private buildBlackboard(
    userMessage: string,
    mode: SpecialistBlackboard['mode'],
    roles: AgentRole[],
    retryContext?: TaskMasterRetryContext
  ): SpecialistBlackboard {
    const taskId = `specialized_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const specialists = this.buildSpecialistRoster(roles, mode);
    const plan = getTaskMaster(this.context.workspacePath, userMessage).buildPlan({
      mode,
      specialists,
      retryContext,
    });

    return {
      taskId,
      userGoal: userMessage,
      mode,
      currentOwner: 'task_master',
      status: mode === 'repair' ? 'repairing' : 'planning',
      workspacePath: this.context.workspacePath,
      activeStepId: plan.activeStepId,
      claimedFiles: plan.claimedFiles,
      steps: plan.steps,
      artifacts: [],
      findings: [],
      approvalsRequired: [],
    };
  }

  /**
   * Run a task using specialized agents WITH VERIFICATION
   */
  async run(userMessage: string): Promise<string> {
    console.log('[SpecializedAgent] Starting specialized agent execution...');
    this.stopRequested = false;
    this.pendingReviewSession = null;
    this.emit('task-start', { task: userMessage });
    const telemetry = getTelemetryService();
    const taskStartedAt = Date.now();
    const requestedRuntimeBudget = this.context.runtimeBudget || 'standard';
    telemetry.track('agent_task_start', {
      mode: 'specialized',
      workspacePath: this.context.workspacePath,
      requestedModel: this.context.model || null,
      runtimeBudget: requestedRuntimeBudget,
    });

    // Start transaction for this specialized agent task
    const transaction = transactionManager.startTransaction(this.context.workspacePath);

    try {
      if (this.context.deterministicScaffoldOnly) {
        return await this.runDeterministicScaffoldReview(
          userMessage,
          transaction,
          taskStartedAt,
          requestedRuntimeBudget
        );
      }

      // Check if this is an update to an existing project
    const existingProject = this.registry.findByPath(this.context.workspacePath);
    const isUpdate = existingProject !== undefined;
    
    if (isUpdate) {
      console.log(`[SpecializedAgent] 🔄 Updating existing project: ${existingProject.name}`);
    }
    const repairScope = this.context.repairScope;
    
    let retryCount = 0;
    let allCreatedFiles: string[] = [];
    let lastVerification: ProjectVerification | null = null;
    let verificationSucceeded = false;
    let rolledBackIncomplete = false;
    let blackboard: SpecialistBlackboard | null = null;

    // Main execution loop with retries
    while (retryCount <= MAX_RETRIES) {
      if (this.stopRequested) {
        await transactionManager.rollbackTransaction();
        return `⏹️ **Agent stopped by user**\n\nCreated so far: ${allCreatedFiles.length} file(s).`;
      }

      // Step 1: Route to appropriate specialists
      const routedRoles = routeToSpecialists(userMessage, {
        files: this.getProjectFiles(),
        language: this.detectLanguage(),
        projectType: this.detectProjectType()
      });
      const roles = [...routedRoles];
      if (retryCount > 0 && !roles.includes('repair_specialist')) {
        roles.push('repair_specialist');
      }
      if (repairScope && !roles.includes('repair_specialist')) {
        roles.push('repair_specialist');
      }

      const mode = this.resolveMode(isUpdate, retryCount);
      const runtimeBudget = this.resolveRuntimeBudget(requestedRuntimeBudget, userMessage, isUpdate, retryCount);
      const retryContext = lastVerification
        ? { missingFiles: lastVerification.missingFiles, errors: lastVerification.errors }
        : repairScope
          ? {
              missingFiles: repairScope.allowedFiles,
              errors: repairScope.findings.map((finding) => finding.summary),
            }
          : undefined;
      blackboard = this.buildBlackboard(userMessage, mode, roles, retryContext);
      this.emit('blackboard-update', blackboard);

      console.log(`[SpecializedAgent] Attempt ${retryCount + 1}/${MAX_RETRIES + 1} - Routing to: ${roles.join(', ')} (budget: ${runtimeBudget})`);

      // Step 2: Build the task message (include missing files if retrying)
      let taskMessage = userMessage;
      if (retryCount > 0 && lastVerification) {
        const missingFileSection = lastVerification.missingFiles.length > 0
          ? `Missing files:\n${lastVerification.missingFiles.map(f => `- ${f}`).join('\n')}\n\n`
          : '';
        const issueSection = lastVerification.errors.length > 0
          ? `Verification/build/runtime issues:\n${lastVerification.errors.map(err => `- ${err}`).join('\n')}\n\n`
          : '';

        if (missingFileSection || issueSection) {
          taskMessage =
            `CRITICAL FIX PASS REQUIRED.\n\n` +
            `${missingFileSection}` +
            `${issueSection}` +
            `Original task: ${userMessage}\n\n` +
            `Fix the concrete issues above with targeted edits only. Keep the existing scaffold and working files intact.`;
          console.log(`[SpecializedAgent] Retry with targeted verification feedback`);
        }
      } else if (repairScope) {
        const findingLines = repairScope.findings.map((finding) => `- [${finding.stage}] ${finding.summary}`).join('\n');
        const allowedLines = repairScope.allowedFiles.map((filePath) => `- ${filePath}`).join('\n');
        const blockedLines = repairScope.blockedFiles.map((filePath) => `- ${filePath}`).join('\n');
        taskMessage =
          `REPAIR SCOPE IS ENFORCED.\n\n` +
          `Allowed files:\n${allowedLines || '- Use only files named in the findings.'}\n\n` +
          `Blocked files:\n${blockedLines || '- None'}\n\n` +
          `Verifier findings:\n${findingLines || '- No structured findings were provided.'}\n\n` +
          `Original repair request: ${userMessage}\n\n` +
          `Only patch allowed files, make the smallest viable fix, and do not touch blocked files.`;
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
          void transactionManager.recordFileChange(
            change.filePath,
            change.oldContent,
            change.newContent,
            change.action !== 'created'
          );
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
            files: this.getProjectFiles(),
            model: this.context.model,
            runtimeBudget,
            deterministicScaffoldOnly: this.context.deterministicScaffoldOnly,
            blackboard,
          },
          trackerMode,
          specialistCallbacks
        );
      } catch (error) {
        if (this.stopRequested) {
          await transactionManager.rollbackTransaction();
          return `⏹️ **Agent stopped by user**\n\nCreated so far: ${allCreatedFiles.length} file(s).`;
        }
        throw error;
      }

      const { results, finalAnalysis, executedTools, scaffoldApplied, scaffoldTemplateId, skippedGenerativePass } = specialistRun;
      if (blackboard) {
        blackboard.status = 'verifying';
        this.emit('blackboard-update', blackboard);
      }

      if (finalAnalysis) {
        this.emit('critique-complete', { analysis: finalAnalysis });
      }

      // Step 4: Collect created files from this run
      const newFiles = this.collectCreatedFilesFromExecutedTools(executedTools || []);
      for (const filePath of newFiles) {
        if (!allCreatedFiles.includes(filePath)) {
          allCreatedFiles.push(filePath);
        }
      }

      console.log(`[SpecializedAgent] Created ${newFiles.length} new files: ${newFiles.join(', ')}`);
      if (scaffoldApplied) {
        console.log(`[SpecializedAgent] 🧱 Scaffold-first path applied (${scaffoldTemplateId || 'template'})`);
      }
      if (skippedGenerativePass) {
        console.log('[SpecializedAgent] 🧪 Skipped long generative pass; proceeding directly to runnable verification');
      }

      // Step 5: VERIFY the project is complete
      lastVerification = await this.verifyProject(allCreatedFiles);
      const verificationSnapshot = lastVerification;
      if (blackboard && verificationSnapshot.errors.length > 0) {
        blackboard.findings = verificationSnapshot.errors.map((error) => ({
          severity: 'error',
          summary: error,
          files: extractFilesFromVerificationIssue(error),
          suggestedOwner: 'repair_specialist',
        }));
        if (verificationSnapshot.missingFiles.length > 0) {
          blackboard.findings.push({
            severity: 'error',
            summary: `Missing files: ${verificationSnapshot.missingFiles.join(', ')}`,
            files: verificationSnapshot.missingFiles,
            suggestedOwner: 'repair_specialist',
          });
        }
        this.emit('blackboard-update', blackboard);
      }

      if (lastVerification.isComplete) {
        console.log('[SpecializedAgent] ✅ Project verification PASSED');

        if (this.context.deterministicScaffoldOnly) {
          console.log('[SpecializedAgent] 🧪 Deterministic scaffold verification passed; deferring full runtime checks to staged review apply');
          verificationSucceeded = true;
          if (blackboard) {
            blackboard.status = 'completed';
            this.emit('blackboard-update', blackboard);
          }
          break;
        }

        const lifecycleResult = await ProjectRunner.autoRun(this.context.workspacePath);
        if (lifecycleResult.validation.issues.length > 0) {
          lastVerification.errors.push(
            ...lifecycleResult.validation.issues.map((issue) => `[Validate] ${issue}`)
          );
        }
        if (lifecycleResult.installResult && !lifecycleResult.installResult.success) {
          lastVerification.errors.push(`[Install] ${this.compactProcessOutput(lifecycleResult.installResult.output)}`);
        }
        if (lifecycleResult.buildResult && !lifecycleResult.buildResult.success) {
          lastVerification.errors.push(`[Build] ${this.compactProcessOutput(lifecycleResult.buildResult.output)}`);
        }
        if (lifecycleResult.runResult && !lifecycleResult.runResult.success) {
          lastVerification.errors.push(`[Run] ${this.compactProcessOutput(lifecycleResult.runResult.output)}`);
        }
        if (!lifecycleResult.success) {
          lastVerification.isComplete = false;
        }

        // Step 6: BROWSER TESTING - Test the project in a real browser
        if (lastVerification.isComplete) {
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
              
              const criticalIssues = browserTestResult.issues.filter(i => i.severity === 'critical');

              if (criticalIssues.length > 0 && retryCount < MAX_RETRIES) {
                console.log(`[SpecializedAgent] 🔧 Found ${criticalIssues.length} critical browser/runtime issues - will retry`);
                lastVerification.isComplete = false;
                lastVerification.errors.push(
                  ...criticalIssues.map(i => `BROWSER FIX NEEDED: ${i.description}. ${i.suggestedFix || ''}`.trim())
                );
              }
            }
          } catch (browserTestError: any) {
            console.warn('[SpecializedAgent] Browser testing skipped:', browserTestError.message);
          }
        }
        
        if (lastVerification.isComplete) {
          await this.finalizeProject(userMessage, allCreatedFiles, isUpdate);
          try {
            const pluginManager = getPluginManager();
            if (pluginManager?.getPlugin('mirror-learning')) {
              await pluginManager.executePluginCommand('mirror-learning', 'recordVerifiedRun', {
                workspacePath: this.context.workspacePath,
                task: userMessage,
              });
            }
          } catch (learningErr: unknown) {
            const msg = learningErr instanceof Error ? learningErr.message : String(learningErr);
            console.warn('[SpecializedAgent] Mirror learning plugin failed:', msg);
          }
          verificationSucceeded = true;
          if (blackboard) {
            blackboard.status = 'completed';
            this.emit('blackboard-update', blackboard);
          }
          
          break;
        }
      }
      
      // Project verification or browser tests failed
      console.log(`[SpecializedAgent] ⚠️ Project verification FAILED - Missing: ${lastVerification.missingFiles.join(', ')}`);
      if (lastVerification.errors.length > 0) {
        console.log(`[SpecializedAgent] ⚠️ Errors: ${lastVerification.errors.slice(0, 3).join('; ')}`);
      }
      if (blackboard) {
        blackboard.status = 'repairing';
        this.emit('blackboard-update', blackboard);
      }
      retryCount++;
      
      if (retryCount > MAX_RETRIES) {
        console.log('[SpecializedAgent] Max retries reached, returning partial result');
      }
    }

    const operationCount = transaction.getOperationCount();
    const stagedReview = reviewSessionManager.createSessionFromOperations(
      this.context.workspacePath,
      transaction.getOperations(),
      this.buildInitialReviewVerification(lastVerification)
    );
    const response = this.buildResponse(allCreatedFiles, lastVerification, {
      rolledBack: rolledBackIncomplete,
      stagedReview: Boolean(stagedReview),
    });

    if (stagedReview) {
      this.pendingReviewSession = stagedReview;
      if (blackboard) {
        blackboard.status = 'awaiting_review';
        blackboard.approvalsRequired = [{
          kind: 'apply_changes',
          requestedBy: 'task_master',
          granted: false,
        }];
        this.emit('blackboard-update', blackboard);
      }

      await transactionManager.rollbackTransaction();
      telemetry.track('agent_task_complete', {
        mode: 'specialized',
        success: verificationSucceeded,
        rolledBack: false,
        retryCount,
        fileCount: allCreatedFiles.length,
        durationMs: Date.now() - taskStartedAt,
        stagedReview: true,
        runtimeBudget: requestedRuntimeBudget,
      });
      console.log(`[SpecializedAgent] 📝 Staged ${operationCount} file operation(s) for review`);
      return `${response}\n\n### Review Required\nApply the staged changes from the review panel to write them into the workspace.`;
    }

    if (operationCount > 0) {
      transactionManager.commitTransaction();
      console.log(`[SpecializedAgent] ✅ Transaction committed with ${operationCount} file operation(s)`);
    } else {
      await transactionManager.rollbackTransaction();
      console.log('[SpecializedAgent] 🔄 Cleared empty transaction');
    }

    telemetry.track('agent_task_complete', {
      mode: 'specialized',
      success: verificationSucceeded,
      rolledBack: false,
      retryCount,
      fileCount: allCreatedFiles.length,
      durationMs: Date.now() - taskStartedAt,
      stagedReview: false,
      runtimeBudget: requestedRuntimeBudget,
    });

    return response;
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
          console.log('[SpecializedAgent] 🔄 Transaction rolled back');
        } catch (rollbackError) {
          console.error(`[SpecializedAgent] ❌ Transaction rollback failed:`, rollbackError);
        }
      }
      telemetry.track('agent_task_complete', {
        mode: 'specialized',
        success: false,
        rolledBack: true,
        durationMs: Date.now() - taskStartedAt,
        error: error instanceof Error ? error.message : String(error),
        runtimeBudget: requestedRuntimeBudget,
      });
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
    const runtimeProfile = getProjectRuntimeProfileSync(workspacePath);
    const projectType = mapRuntimeKindToRegistryType(runtimeProfile.kind);
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
    const runtimeProfile = getProjectRuntimeProfileSync(workspacePath);

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

          // Find local script/module references, including TS/TSX/JSX entries used by Vite.
          const scriptRefs = content.match(/src=["']([^"']+\.(?:js|jsx|ts|tsx|mjs|cjs|tsxx))["']/g) || [];
          for (const ref of scriptRefs) {
            const scriptFile = ref.match(/src=["']([^"']+\.(?:js|jsx|ts|tsx|mjs|cjs|tsxx))["']/)?.[1];
            if (scriptFile && !scriptFile.startsWith('http')) {
              const normalizedPath = this.normalizePath(scriptFile);
              if (scriptFile.endsWith('.tsxx')) {
                errors.push(`${file} references invalid script entry: ${scriptFile} (.tsxx is not a valid TypeScript React extension)`);
                const suggestedPath = normalizedPath.replace(/\.tsxx$/i, '.tsx');
                if (!missingFiles.includes(suggestedPath)) {
                  missingFiles.push(suggestedPath);
                }
                continue;
              }

              if (!existingFiles.includes(normalizedPath) && !this.fileExists(workspacePath, scriptFile)) {
                // SMART VALIDATION: Check if file name makes sense for the project
                if (this.isValidFileReference(scriptFile, workspacePath)) {
                  missingFiles.push(normalizedPath);
                } else {
                  // File reference doesn't make sense - likely a hallucination
                  errors.push(`${file} references invalid script file: ${scriptFile} (likely hallucinated - check if it matches the project type)`);
                }
              }
            }
          }
        } catch (err) {
          errors.push(`Could not read ${file}: ${err}`);
        }
      }
    }

    // Check JS/TS module imports so bundler-based projects don't pass with broken local references.
    for (const file of existingFiles) {
      if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file)) {
        continue;
      }

      const filePath = path.join(workspacePath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const importPath of this.extractLocalImports(content)) {
          const resolved = this.resolveLocalImport(file, importPath, workspacePath);
          if (!resolved) {
            const importError = `${file} imports missing file: ${importPath}`;
            errors.push(importError);
            const normalizedImport = this.normalizeImportTarget(file, importPath);
            if (normalizedImport && !missingFiles.includes(normalizedImport)) {
              missingFiles.push(normalizedImport);
            }
          }
        }
      } catch (err) {
        errors.push(`Could not read ${file}: ${err}`);
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

    const hasIndexHtml = existingFiles.some((file) => file === 'index.html' || file.endsWith('/index.html'));
    const hasFrontendAssets = existingFiles.some((file) =>
      file.endsWith('.css') ||
      file.endsWith('.html') ||
      /^src\/.+\.(js|jsx|ts|tsx)$/.test(file) ||
      /^public\/.+/.test(file)
    );
    const hasServerEntrypoint = existingFiles.some((file) =>
      ['server.js', 'app.js', 'index.js', 'server.ts', 'app.ts', 'index.ts'].includes(file)
    );

    if (runtimeProfile.kind === 'static' && hasFrontendAssets && !hasIndexHtml && !hasServerEntrypoint) {
      errors.push('Static website is missing index.html entrypoint');
      missingFiles.push('index.html');
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
  private buildInitialReviewVerification(
    verification: ProjectVerification | null
  ): AgentReviewVerificationState | undefined {
    if (!verification || verification.isComplete) {
      return undefined;
    }

    const runtimeProfile = getProjectRuntimeProfileSync(this.context.workspacePath);
    const findings: AgentReviewFinding[] = [];

    for (const missingFile of verification.missingFiles) {
      findings.push({
        stage: 'validation',
        severity: 'error',
        summary: `Missing file: ${missingFile}`,
        files: [missingFile],
      });
    }

    for (const error of verification.errors) {
      findings.push({
        stage: inferVerificationStage(error),
        severity: 'error',
        summary: error,
        files: extractFilesFromVerificationIssue(error),
      });
    }

    const issues = findings.map((finding) => finding.summary);
    if (issues.length === 0) {
      return undefined;
    }

    return {
      status: 'failed',
      projectTypeLabel: runtimeProfile.displayName,
      readinessSummary: runtimeProfile.readiness.summary,
      startCommand: runtimeProfile.run.command || undefined,
      buildCommand: runtimeProfile.build.command || undefined,
      installCommand: runtimeProfile.install.command || undefined,
      issues,
      findings,
    };
  }

  private async runDeterministicScaffoldReview(
    userMessage: string,
    transaction: any,
    taskStartedAt: number,
    requestedRuntimeBudget: AgentContext['runtimeBudget']
  ): Promise<string> {
    const telemetry = getTelemetryService();
    this.emit('step-start', {
      type: 'deterministic_scaffold',
      title: 'deterministic_scaffold',
      specialist: 'template_scaffold_specialist',
    });

    const scaffolded = await scaffoldProjectFromTemplate(this.context.workspacePath, userMessage, {
      runPostCreate: false,
      callbacks: {
        onFileChange: (change) => {
          void transactionManager.recordFileChange(
            change.filePath,
            change.oldContent,
            change.newContent,
            change.action !== 'created'
          );
          this.emit('file-modified', {
            path: change.filePath,
            action: change.action,
            oldContent: change.oldContent,
            newContent: change.newContent,
          });
        },
      },
    });

    this.emit('step-complete', {
      type: 'deterministic_scaffold',
      title: 'deterministic_scaffold',
      specialist: 'template_scaffold_specialist',
      success: scaffolded.success,
      error: scaffolded.error,
    });

    if (!scaffolded.success) {
      await transactionManager.rollbackTransaction();
      throw new Error(scaffolded.error || 'Deterministic scaffold generation failed');
    }

    const verification = await this.verifyProject(scaffolded.createdFiles);
    const stagedReview = reviewSessionManager.createSessionFromOperations(
      this.context.workspacePath,
      transaction.getOperations(),
      this.buildInitialReviewVerification(verification)
    );

    const response = this.buildResponse(scaffolded.createdFiles, verification, {
      stagedReview: Boolean(stagedReview),
    });

    await transactionManager.rollbackTransaction();

    if (stagedReview) {
      this.pendingReviewSession = stagedReview;
      telemetry.track('agent_task_complete', {
        mode: 'specialized',
        success: verification.isComplete,
        rolledBack: false,
        retryCount: 0,
        fileCount: scaffolded.createdFiles.length,
        durationMs: Date.now() - taskStartedAt,
        stagedReview: true,
        runtimeBudget: requestedRuntimeBudget || 'standard',
      });
      return `${response}\n\n### Review Required\nApply the staged changes from the review panel to write them into the workspace.`;
    }

    telemetry.track('agent_task_complete', {
      mode: 'specialized',
      success: verification.isComplete,
      rolledBack: false,
      retryCount: 0,
      fileCount: scaffolded.createdFiles.length,
      durationMs: Date.now() - taskStartedAt,
      stagedReview: false,
      runtimeBudget: requestedRuntimeBudget || 'standard',
    });
    return response;
  }

  private buildResponse(
    createdFiles: string[],
    verification: ProjectVerification | null,
    options: { rolledBack?: boolean; stagedReview?: boolean } = {}
  ): string {
    const runtimeProfile = getProjectRuntimeProfileSync(this.context.workspacePath);
    const runCommand = runtimeProfile.run.command;
    const installCommand = runtimeProfile.install.command;
    const installSatisfied =
      runtimeProfile.install.manager === 'npm'
        ? fs.existsSync(path.join(this.context.workspacePath, 'node_modules'))
        : runtimeProfile.install.manager === 'pip'
          ? !runtimeProfile.install.required
          : true;
    const isReady = Boolean(verification?.isComplete);
    
    let response = isReady ? `## ✅ Project Created!\n\n` : `## ⚠️ Project Needs Fixes\n\n`;
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
        response += `${runtimeProfile.readiness.summary}\n\n`;
      } else {
        if (options.rolledBack) {
          response += `### ↩️ Changes Reverted\n`;
          response += `AgentPrime rolled back the generated changes because no usable files could be kept.\n\n`;
        } else if (options.stagedReview) {
          response += `### 📝 Staged For Review\n`;
          response += `Files are ready for review and have not been written into the workspace yet.\n\n`;
        } else {
          response += `### ⚠️ Project Created With Issues\n`;
          response += `Files have been kept so you can inspect and fix the remaining issues.\n\n`;
        }
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

    if (runCommand) {
      response += `**▶ Run Project:** \`${runCommand}\`\n\n`;
      if (runtimeProfile.kind === 'vite') {
        response += `**🌐 Open in Browser:** Start the dev server, then open the local URL it prints\n\n`;
      }
    } else if (runtimeProfile.kind === 'static' && runtimeProfile.hasIndexHtml) {
      response += `**🚀 Launch in Browser:** Open \`index.html\` in your browser\n\n`;
    }

    if (runtimeProfile.install.required && installCommand && !installSatisfied) {
      response += `**📦 Install Dependencies:** Run \`${installCommand}\` in the project folder\n\n`;
    } else if (!runtimeProfile.install.required && (runtimeProfile.kind === 'static' || runtimeProfile.kind === 'node' || runtimeProfile.kind === 'vite')) {
      response += `**✅ No Dependency Install Needed:** This starter does not declare packages that require an install step.\n\n`;
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

    response += isReady
      ? `---\n🎉 Your project is ready!`
      : `---\n⚠️ AgentPrime found issues that still need fixing before this project is ready.`;

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
    return filePath.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\/g, '/');
  }

  private collectCreatedFilesFromExecutedTools(executedTools: any[]): string[] {
    const createdFiles = new Set<string>();

    for (const tool of executedTools) {
      const toolCall = tool?.toolCall;
      const name = toolCall?.name || toolCall?.function?.name;
      const args = toolCall?.arguments || toolCall?.function?.arguments || toolCall?.input || toolCall?.function?.input || {};

      if (name === 'write_file' && typeof args.path === 'string') {
        createdFiles.add(this.normalizePath(args.path));
      }

      if (name === 'scaffold_project' && Array.isArray(tool?.result?.files)) {
        for (const file of tool.result.files) {
          if (typeof file === 'string') {
            createdFiles.add(this.normalizePath(file));
          }
        }
      }
    }

    return [...createdFiles];
  }

  private readRootPackageJson(): any | null {
    const packageJsonPath = path.join(this.context.workspacePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private hasDeclaredNodeDependencies(packageJson: any | null): boolean {
    const deps = {
      ...(packageJson?.dependencies || {}),
      ...(packageJson?.devDependencies || {})
    };

    return Object.keys(deps).length > 0;
  }

  private isBundlerProject(packageJson: any | null): boolean {
    if (fs.existsSync(path.join(this.context.workspacePath, 'vite.config.ts')) || fs.existsSync(path.join(this.context.workspacePath, 'vite.config.js'))) {
      return true;
    }

    const deps = {
      ...(packageJson?.dependencies || {}),
      ...(packageJson?.devDependencies || {})
    };

    return Boolean(deps.vite || deps.webpack || deps.parcel || deps.next || deps['@vitejs/plugin-react']);
  }

  private getRecommendedRunCommand(packageJson: any | null): string | null {
    const scripts = packageJson?.scripts || {};
    if (typeof scripts.dev === 'string' && scripts.dev.trim()) {
      return 'npm run dev';
    }
    if (typeof scripts.start === 'string' && scripts.start.trim()) {
      return 'npm start';
    }
    return null;
  }

  private extractLocalImports(content: string): string[] {
    const matches = [
      ...content.matchAll(/import\s+[^'"]*['"]([^'"]+)['"]/g),
      ...content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...content.matchAll(/export\s+[^'"]*from\s+['"]([^'"]+)['"]/g)
    ];

    return matches
      .map((match) => match[1])
      .filter((value): value is string => Boolean(value))
      .filter((value) => value.startsWith('.') || value.startsWith('/'));
  }

  private normalizeImportTarget(sourceFile: string, importPath: string): string | null {
    const sanitizedImport = importPath.split('?')[0].split('#')[0];
    const sourceDir = path.posix.dirname(sourceFile.replace(/\\/g, '/'));
    const normalized = sanitizedImport.startsWith('/')
      ? sanitizedImport.replace(/^\//, '')
      : path.posix.normalize(path.posix.join(sourceDir, sanitizedImport));

    return normalized.replace(/\\/g, '/');
  }

  private resolveLocalImport(sourceFile: string, importPath: string, workspacePath: string): string | null {
    const normalizedImport = this.normalizeImportTarget(sourceFile, importPath);
    if (!normalizedImport) {
      return null;
    }

    const hasExtension = /\.[a-z0-9]+$/i.test(normalizedImport);
    const baseCandidates = hasExtension
      ? [normalizedImport]
      : [
          normalizedImport,
          `${normalizedImport}.js`,
          `${normalizedImport}.jsx`,
          `${normalizedImport}.ts`,
          `${normalizedImport}.tsx`,
          `${normalizedImport}.mjs`,
          `${normalizedImport}.cjs`,
          `${normalizedImport}.css`,
          `${normalizedImport}.scss`,
          `${normalizedImport}.sass`,
          `${normalizedImport}.less`,
          `${normalizedImport}.json`,
          path.posix.join(normalizedImport, 'index.js'),
          path.posix.join(normalizedImport, 'index.jsx'),
          path.posix.join(normalizedImport, 'index.ts'),
          path.posix.join(normalizedImport, 'index.tsx')
        ];

    for (const candidate of baseCandidates) {
      const fullPath = path.join(workspacePath, candidate);
      if (fs.existsSync(fullPath)) {
        return candidate;
      }
    }

    return null;
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
    const profile = getProjectRuntimeProfileSync(this.context.workspacePath);
    if (profile.kind === 'python') {
      return 'python';
    }
    if (profile.kind === 'node' || profile.kind === 'vite' || profile.kind === 'tauri') {
      return 'node';
    }
    if (profile.kind === 'static') {
      return 'web';
    }
    return undefined;
  }

  private compactProcessOutput(output: string, maxChars: number = 1200): string {
    const normalized = (output || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'Command failed with no output.';
    }

    if (normalized.length <= maxChars) {
      return normalized;
    }

    return `...${normalized.slice(-maxChars)}`;
  }

  /**
   * Install dependencies automatically if package.json or requirements.txt exists
   */
  private async installDependenciesIfNeeded(): Promise<{ success: boolean; output: string }> {
    const projectInfo = await ProjectRunner.detectProject(this.context.workspacePath);
    if (!projectInfo.requiresInstall) {
      return { success: true, output: 'No dependencies to install' };
    }

    return ProjectRunner.installDependencies(this.context.workspacePath, projectInfo);
  }

  private async buildProjectIfNeeded(): Promise<{ success: boolean; output: string }> {
    const projectInfo = await ProjectRunner.detectProject(this.context.workspacePath);
    return ProjectRunner.runBuild(this.context.workspacePath, projectInfo);
  }
}
