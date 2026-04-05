/**
 * Task Master - The Boss Review System
 * 
 * Acts like a boss reviewing work before it's committed.
 * "Bro wtf? This doesn't match. Do it like this and remember it."
 * 
 * This is the quality control layer that:
 * 1. Reviews what the agent wants to write BEFORE writing
 * 2. Compares it to existing files and the task
 * 3. BLOCKS bad decisions (like replacing game code with debugger code)
 * 4. Stores mistakes so the agent learns
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectProjectType, detectProjectTypeFromContent } from './tool-validation';
import { storeTaskLearning } from '../mirror/mirror-singleton';
import { getOpusReasoningEngine } from '../mirror/opus-reasoning-engine';
import {
  SPECIALIST_EXECUTION_ORDER,
  type SpecialistBlackboard,
  type SpecialistId,
  type SpecialistStepAssignment,
} from './specialist-contracts';

export interface BossReviewResult {
  approved: boolean;
  reason: string;
  mustFix: string[];
  suggestions: string[];
  storedLearning: boolean;
}

export interface FileToReview {
  path: string;
  content: string;
  existingContent?: string; // If file already exists
}

export interface TaskMasterRetryContext {
  missingFiles: string[];
  errors: string[];
}

export interface TaskMasterPlan {
  activeStepId?: string;
  steps: SpecialistStepAssignment[];
  claimedFiles: Record<SpecialistId, string[]>;
  summary: string;
}

/**
 * Task Master - The Boss
 * Reviews work before it's written and blocks bad decisions
 */
export class TaskMaster {
  private workspacePath: string;
  private task: string;
  private existingFiles: Map<string, string> = new Map();
  
  constructor(workspacePath: string, task: string) {
    this.workspacePath = workspacePath;
    this.task = task;
  }
  
  /**
   * Load existing files so boss can review against them
   */
  loadExistingFiles(files: Map<string, { content: string }>): void {
    for (const [filePath, fileInfo] of files.entries()) {
      this.existingFiles.set(filePath, fileInfo.content);
    }
    console.log(`[TaskMaster] 📋 Loaded ${this.existingFiles.size} existing files for review`);
  }

  buildPlan(params: {
    mode: SpecialistBlackboard['mode'];
    specialists: SpecialistId[];
    retryContext?: TaskMasterRetryContext;
  }): TaskMasterPlan {
    const orderedSpecialists = SPECIALIST_EXECUTION_ORDER.filter((id) => params.specialists.includes(id));
    const claimedFiles = this.createClaimMap();
    const steps: SpecialistStepAssignment[] = [];
    const projectType = detectProjectType(this.task);
    const retryFiles = this.extractRetryFiles(params.retryContext);

    for (const specialist of orderedSpecialists) {
      const specialistClaims = this.claimsForSpecialist(specialist, params.mode, projectType, retryFiles);
      claimedFiles[specialist] = specialistClaims;

      if (specialist === 'executive_router' || specialist === 'task_master') {
        continue;
      }

      const stepId = `${specialist}_${steps.length + 1}`;
      steps.push({
        id: stepId,
        specialist,
        goal: this.goalForSpecialist(specialist, params.mode, params.retryContext),
        status: 'pending',
        claimedFiles: specialistClaims,
        acceptanceCriteria: this.acceptanceCriteriaForSpecialist(specialist, params.mode, retryFiles),
        dependsOn: this.dependenciesForSpecialist(specialist, steps),
      });
    }

    return {
      activeStepId: steps[0]?.id,
      steps,
      claimedFiles,
      summary: `Planned ${steps.length} specialist step(s) for ${params.mode} mode${projectType ? ` (${projectType})` : ''}.`,
    };
  }
  
  /**
   * THE BOSS REVIEW - Main entry point
   * Reviews what agent wants to write and says YES or NO
   * NOW WITH OPUS REASONING: Applies Opus 4.5's reasoning patterns
   */
  async reviewWork(file: FileToReview): Promise<BossReviewResult> {
    console.log(`[TaskMaster] 👔 BOSS REVIEW: Reviewing "${file.path}"`);
    
    // 🧠 OPUS REASONING: Get Opus's reasoning patterns for this situation
    const opusEngine = getOpusReasoningEngine();
    // Convert string map to match expected type (it already is, but ensure type safety)
    const existingFilesMap = new Map<string, string>(this.existingFiles);
    const opusReasoning = await opusEngine.applyReasoning('task-master', {
      task: this.task,
      filePath: file.path,
      content: file.content,
      existingFiles: existingFilesMap
    });
    
    console.log(`[TaskMaster] 🧠 Opus Reasoning: ${opusReasoning.recommendations.length} recommendations`);
    
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    // Apply Opus recommendations
    for (const recommendation of opusReasoning.recommendations) {
      suggestions.push(`🧠 Opus Pattern: ${recommendation}`);
    }
    
    // If Opus reasoning says don't proceed, add to issues
    if (!opusReasoning.shouldProceed) {
      issues.push(`🧠 Opus Reasoning: ${opusReasoning.reasoning}`);
    }
    
    // ==========================================
    // CHECK 1: Does it match the task?
    // ==========================================
    const taskProjectType = detectProjectType(this.task);
    const contentProjectType = detectProjectTypeFromContent(file.content);
    
    if (taskProjectType && contentProjectType && taskProjectType !== contentProjectType) {
      const issue = `🚨 PROJECT TYPE MISMATCH: Task is "${taskProjectType}" but you wrote "${contentProjectType}" code!`;
      issues.push(issue);
      console.error(`[TaskMaster] ${issue}`);
      
      // Store this as a learning moment
      await this.storeMistake(
        `Wrote ${contentProjectType} code for ${taskProjectType} task`,
        `Task: ${this.task.substring(0, 100)}\nFile: ${file.path}\nWrong type: ${contentProjectType}`
      );
      
      return {
        approved: false,
        reason: `Boss says NO: ${issue}`,
        mustFix: [
          `Read the task again: "${this.task.substring(0, 150)}..."`,
          `The task is about ${taskProjectType}, not ${contentProjectType}`,
          `Generate code that matches ${taskProjectType} projects`
        ],
        suggestions: [`Look at examples of ${taskProjectType} projects`],
        storedLearning: true
      };
    }
    
    // ==========================================
    // CHECK 2: Does it match existing files?
    // ==========================================
    if (this.existingFiles.size > 0) {
      // Check if this file is referenced by other files
      for (const [existingPath, existingContent] of this.existingFiles.entries()) {
        const fileName = path.basename(file.path);
        
        // If HTML references this JS file, they MUST match
        if (existingPath.endsWith('.html') && existingContent.includes(fileName)) {
          const htmlProjectType = detectProjectTypeFromContent(existingContent);
          const jsProjectType = detectProjectTypeFromContent(file.content);
          
          if (htmlProjectType && jsProjectType && htmlProjectType !== jsProjectType) {
            const issue = `🚨 FILE MISMATCH: "${existingPath}" expects ${htmlProjectType} but "${file.path}" is ${jsProjectType}!`;
            issues.push(issue);
            console.error(`[TaskMaster] ${issue}`);
            
            // Store this mistake
            await this.storeMistake(
              `Created mismatched files: ${htmlProjectType} HTML with ${jsProjectType} JS`,
              `HTML: ${existingPath}\nJS: ${file.path}\nThey don't match!`
            );
            
            return {
              approved: false,
              reason: `Boss says NO: ${issue}`,
              mustFix: [
                `Read "${existingPath}" to see what project type it is`,
                `The HTML file shows this is a ${htmlProjectType} project`,
                `Rewrite "${file.path}" to match ${htmlProjectType}, not ${jsProjectType}`
              ],
              suggestions: [
                `Files in the same project MUST match each other`,
                `If HTML says "game", JS must be game code, not debugger code`
              ],
              storedLearning: true
            };
          }
        }
      }
    }
    
    // ==========================================
    // CHECK 3: Is it replacing good work with bad work?
    // ==========================================
    if (file.existingContent) {
      const existingType = detectProjectTypeFromContent(file.existingContent);
      const newType = detectProjectTypeFromContent(file.content);
      
      // If existing file is correct type but new one is wrong
      if (existingType && newType && existingType !== newType) {
        const taskType = detectProjectType(this.task);
        
        // If existing matches task but new doesn't, BLOCK IT
        if (taskType && existingType === taskType && newType !== taskType) {
          const issue = `🚨 REPLACING GOOD WORK: Existing file is correct (${existingType}) but you're replacing it with wrong type (${newType})!`;
          issues.push(issue);
          console.error(`[TaskMaster] ${issue}`);
          
          await this.storeMistake(
            `Replaced correct ${existingType} code with wrong ${newType} code`,
            `File: ${file.path}\nWas: ${existingType} (correct)\nTrying to replace with: ${newType} (wrong)`
          );
          
          return {
            approved: false,
            reason: `Boss says NO: ${issue}`,
            mustFix: [
              `STOP! The existing file is CORRECT (${existingType})`,
              `You're trying to replace it with WRONG type (${newType})`,
              `DO NOT replace correct work with wrong work`,
              `If you need to fix something, use patch_file for surgical edits`
            ],
            suggestions: [
              `Read the existing file first to understand what it does`,
              `Only make changes that preserve the project type`
            ],
            storedLearning: true
          };
        }
      }
    }
    
    // ==========================================
    // CHECK 4: Does it have the right structure?
    // ==========================================
    // Check for common mistakes
    const contentLower = file.content.toLowerCase();
    const taskLower = this.task.toLowerCase();
    
    // If task says "game" but content has debugger/portfolio patterns
    if (taskLower.includes('game') || taskLower.includes('three.js')) {
      if (contentLower.includes('code debugger') || 
          contentLower.includes('analyze code') ||
          contentLower.includes('error patterns') ||
          (contentLower.includes('hamburger') && contentLower.includes('nav-menu'))) {
        const issue = `🚨 WRONG CONTENT TYPE: Task is about games but you wrote debugger/portfolio code!`;
        issues.push(issue);
        console.error(`[TaskMaster] ${issue}`);
        
        await this.storeMistake(
          `Wrote debugger code for game task`,
          `Task: ${this.task.substring(0, 100)}\nFile: ${file.path}\nContent type: debugger (wrong)`
        );
        
        return {
          approved: false,
          reason: `Boss says NO: ${issue}`,
          mustFix: [
            `The task is about creating a GAME`,
            `You wrote DEBUGGER/PORTFOLIO code instead`,
            `Generate GAME code: Three.js, game loop, player, enemies, etc.`
          ],
          suggestions: [
            `Look at Three.js game examples`,
            `Game code has: game loop, player object, enemies, physics, etc.`,
            `NOT: code analyzers, debuggers, or portfolio websites`
          ],
          storedLearning: true
        };
      }
    }
    
    // ==========================================
    // ALL CHECKS PASSED - Boss approves
    // ==========================================
    if (issues.length === 0) {
      console.log(`[TaskMaster] ✅ BOSS APPROVAL: "${file.path}" looks good`);
      return {
        approved: true,
        reason: 'Boss says YES: Work looks good, matches task and existing files',
        mustFix: [],
        suggestions: [],
        storedLearning: false
      };
    }
    
    // ==========================================
    // ISSUES FOUND - Boss says fix it
    // ==========================================
    return {
      approved: false,
      reason: `Boss found ${issues.length} issue(s)`,
      mustFix: issues,
      suggestions,
      storedLearning: true
    };
  }
  
  /**
   * Store mistakes in mirror system so agent learns
   */
  private async storeMistake(description: string, details: string): Promise<void> {
    try {
      // storeTaskLearning expects: (task: string, success: boolean, patterns: any[], mistakes: string[])
      await storeTaskLearning(
        this.task,
        false, // success = false
        [], // patterns = empty
        [`${description}: ${details}`] // mistakes as string array
      );
      console.log(`[TaskMaster] 📚 Stored mistake in learning system: ${description}`);
    } catch (e) {
      console.warn(`[TaskMaster] Failed to store mistake:`, e);
    }
  }
  
  /**
   * Review multiple files at once (for batch operations)
   */
  async reviewBatch(files: FileToReview[]): Promise<Map<string, BossReviewResult>> {
    const results = new Map<string, BossReviewResult>();
    
    for (const file of files) {
      const result = await this.reviewWork(file);
      results.set(file.path, result);
    }
    
    return results;
  }

  private createClaimMap(): Record<SpecialistId, string[]> {
    return {
      executive_router: [],
      task_master: [],
      template_scaffold_specialist: [],
      javascript_specialist: [],
      styling_ux_specialist: [],
      python_specialist: [],
      tauri_specialist: [],
      pipeline_specialist: [],
      testing_specialist: [],
      integration_verifier: [],
      repair_specialist: [],
    };
  }

  private extractRetryFiles(retryContext?: TaskMasterRetryContext): string[] {
    const retryFiles = new Set<string>(retryContext?.missingFiles || []);
    for (const error of retryContext?.errors || []) {
      const matches = error.match(/[A-Za-z0-9_./-]+\.(tsx?|jsx?|py|json|html|css|md|yml|yaml|toml|rs)/g) || [];
      for (const match of matches) {
        retryFiles.add(match.replace(/\\/g, '/'));
      }
    }
    return [...retryFiles];
  }

  private claimsForSpecialist(
    specialist: SpecialistId,
    mode: SpecialistBlackboard['mode'],
    projectType: string | null,
    retryFiles: string[]
  ): string[] {
    if (specialist === 'repair_specialist') {
      return retryFiles.length > 0
        ? retryFiles
        : ['src/**', 'backend/**', 'package.json', 'vite.config.*', 'tsconfig*.json'];
    }

    switch (specialist) {
      case 'template_scaffold_specialist':
        return projectType === 'threejs'
          ? ['package.json', 'README.md', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/game/**']
          : mode === 'create'
            ? ['package.json', 'README.md', 'index.html', 'src/**']
            : [];
      case 'javascript_specialist':
        return [
          'src/**/*.js',
          'src/**/*.jsx',
          'src/**/*.ts',
          'src/**/*.tsx',
          'src/**/*.css',
          'tests/**/*.ts',
          'tests/**/*.tsx',
          'README.md',
        ];
      case 'styling_ux_specialist':
        return ['src/**/*.css', 'src/**/*.scss', 'src/**/*.html', 'src/**/*.tsx', 'src/**/*.jsx', 'public/**'];
      case 'python_specialist':
        return ['backend/**/*.py', 'scripts/**/*.py', 'tests/**/*.py'];
      case 'tauri_specialist':
        return ['src-tauri/**', 'src/**/*.ts', 'src/**/*.tsx'];
      case 'pipeline_specialist':
        return [
          'package.json',
          'package-lock.json',
          'pnpm-lock.yaml',
          'yarn.lock',
          'requirements*.txt',
          'pyproject.toml',
          'vite.config.*',
          'tsconfig*.json',
          '.github/workflows/**',
          '*.bat',
          'Makefile',
          'Dockerfile',
          'Dockerfile.*',
          'README.md',
        ];
      case 'testing_specialist':
        return ['tests/**', 'playwright.config.*', 'package.json', 'scripts/**/*.ts'];
      default:
        return [];
    }
  }

  private goalForSpecialist(
    specialist: SpecialistId,
    mode: SpecialistBlackboard['mode'],
    retryContext?: TaskMasterRetryContext
  ): string {
    if (specialist === 'repair_specialist') {
      return retryContext
        ? `Repair only the concrete failures: ${[...retryContext.missingFiles, ...retryContext.errors].slice(0, 4).join('; ')}`
        : 'Repair only the verifier-reported issues.';
    }

    const prefix = mode === 'create' ? 'Create' : mode === 'repair' ? 'Repair' : 'Implement';
    switch (specialist) {
      case 'template_scaffold_specialist':
        return `${prefix} the deterministic baseline scaffold without drifting from the chosen project shape.`;
      case 'javascript_specialist':
        return `${prefix} the JS/TS application files required by the user request.`;
      case 'styling_ux_specialist':
        return `${prefix} the styling, layout, and UX refinements required by the user request.`;
      case 'python_specialist':
        return `${prefix} the Python/backend files required by the user request.`;
      case 'tauri_specialist':
        return `${prefix} the desktop bridge and Tauri-specific files.`;
      case 'pipeline_specialist':
        return `${prefix} only build, dependency, and automation files needed to run and verify the project.`;
      case 'testing_specialist':
        return `${prefix} the focused test coverage and browser checks needed to prove the requested behavior.`;
      case 'integration_verifier':
        return 'Verify the current diff, runtime wiring, and command results without changing files.';
      default:
        return `${prefix} the assigned work.`;
    }
  }

  private acceptanceCriteriaForSpecialist(
    specialist: SpecialistId,
    mode: SpecialistBlackboard['mode'],
    retryFiles: string[]
  ): string[] {
    if (specialist === 'integration_verifier') {
      return [
        'Summarize pass/fail status with concrete findings.',
        'Reference only files or commands that were actually checked.',
        'Do not propose unrelated feature work.',
      ];
    }

    if (specialist === 'repair_specialist') {
      return [
        retryFiles.length > 0 ? `Touch only retry-target files: ${retryFiles.join(', ')}` : 'Touch only files named in the repair plan.',
        'Apply the smallest viable patch.',
        'Do not re-scaffold or broaden the feature scope.',
      ];
    }

    const criteria = ['Stay inside claimed files.', 'Do not take over another specialist’s domain.'];
    if (mode === 'create') {
      criteria.push('Produce runnable output that fits the requested project shape.');
    }
    if (specialist === 'pipeline_specialist') {
      criteria.push('Keep commands cross-platform and verification-oriented.');
    }
    if (specialist === 'testing_specialist') {
      criteria.push('Add only tests that materially reduce regression risk.');
    }
    return criteria;
  }

  private dependenciesForSpecialist(
    specialist: SpecialistId,
    existingSteps: SpecialistStepAssignment[]
  ): string[] {
    const previousStep = existingSteps[existingSteps.length - 1];
    if (!previousStep) {
      return [];
    }

    if (specialist === 'integration_verifier') {
      return existingSteps.map((step) => step.id).filter((stepId) => stepId !== previousStep.id);
    }

    if (specialist === 'pipeline_specialist' || specialist === 'testing_specialist' || specialist === 'repair_specialist') {
      return [previousStep.id];
    }

    return [];
  }
}

/**
 * Get the Task Master instance for a workspace
 */
export function getTaskMaster(workspacePath: string, task: string): TaskMaster {
  return new TaskMaster(workspacePath, task);
}

export default TaskMaster;
