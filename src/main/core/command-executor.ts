/**
 * Command Executor
 * Orchestrates command parsing, planning, safety checking, and execution
 */

import { CommandParser, ParsedCommand } from './command-parser';
import { PathResolver } from './path-resolver';
import { OperationPlanner, OperationPlan } from './operation-planner';
import { SafetyChecker, SafetyAssessment } from './safety-checker';
import { SystemActionExecutor, OperationResult } from './system-action-executor';

export interface CommandExecutionContext {
  currentFile?: string;
  currentFolder?: string;
  workspacePath?: string;
}

export interface CommandExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  plan?: OperationPlan;
  assessment?: SafetyAssessment;
  result?: OperationResult;
}

export class CommandExecutor {
  private commandParser: CommandParser;
  private pathResolver: PathResolver;
  private operationPlanner: OperationPlanner;
  private safetyChecker: SafetyChecker;
  private systemExecutor: SystemActionExecutor;

  constructor() {
    this.pathResolver = new PathResolver();
    this.commandParser = new CommandParser();
    this.operationPlanner = new OperationPlanner(this.pathResolver);
    this.safetyChecker = new SafetyChecker();
    this.systemExecutor = new SystemActionExecutor(this.pathResolver);
  }

  /**
   * Execute a natural language command
   */
  async execute(
    command: string,
    context?: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    // Parse command
    const parsed = this.commandParser.parse(command, {
      currentFile: context?.currentFile,
      currentFolder: context?.currentFolder
    });

    if (!parsed) {
      return {
        success: false,
        error: 'Could not parse command. Please try rephrasing your request.'
      };
    }

    // Plan operation
    const plan = this.operationPlanner.plan(parsed, context?.workspacePath);

    if (!plan) {
      return {
        success: false,
        error: 'Could not create operation plan. Please check that the source path exists.'
      };
    }

    // Assess safety
    const assessment = this.safetyChecker.assess(plan, parsed);

    // If requires confirmation, return with confirmation prompt
    if (assessment.requiresConfirmation) {
      const prompt = this.safetyChecker.getConfirmationPrompt(
        assessment,
        plan.steps[0]
      );

      return {
        success: false, // Not executed yet
        requiresConfirmation: true,
        confirmationPrompt: prompt,
        plan,
        assessment
      };
    }

    // Execute immediately (low risk operations)
    return await this.executePlan(plan);
  }

  /**
   * Execute a confirmed operation plan
   */
  async executePlan(plan: OperationPlan): Promise<CommandExecutionResult> {
    try {
      let totalProcessed = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      const errors: string[] = [];

      for (const step of plan.steps) {
        const result = await this.systemExecutor.executeStep(step);

        if (result.success) {
          totalProcessed += result.filesProcessed || 1;
        } else {
          totalFailed += result.filesFailed || 1;
          if (result.error) {
            errors.push(result.error);
          }
        }

        totalSkipped += result.filesSkipped || 0;
      }

      if (totalFailed > 0) {
        return {
          success: false,
          error: `Operation completed with errors: ${errors.join('; ')}`,
          result: {
            success: false,
            filesProcessed: totalProcessed,
            filesSkipped: totalSkipped,
            filesFailed: totalFailed
          }
        };
      }

      return {
        success: true,
        message: `✅ Operation completed successfully. Processed ${totalProcessed} file(s).`,
        result: {
          success: true,
          filesProcessed: totalProcessed,
          filesSkipped: totalSkipped,
          filesFailed: totalFailed
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error during execution'
      };
    }
  }

  /**
   * Check if a message is a file operation command
   */
  isFileOperationCommand(command: string): boolean {
    return this.commandParser.isFileOperationCommand(command);
  }

  /**
   * Get undo history
   */
  getUndoHistory() {
    return this.systemExecutor.getUndoHistory();
  }

  /**
   * Undo last operation
   */
  async undoLastOperation(): Promise<CommandExecutionResult> {
    const result = await this.systemExecutor.undoLastOperation();

    if (result.success) {
      return {
        success: true,
        message: result.message || '✅ Operation undone'
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to undo operation'
      };
    }
  }
}

