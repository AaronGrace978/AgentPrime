/**
 * Safety Checker
 * Classifies operations by risk level and determines if confirmation is required
 */

import { OperationPlan, OperationStep } from './operation-planner';
import { ParsedCommand } from './command-parser';
import * as path from 'path';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface SafetyAssessment {
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  warningMessage?: string;
  affectedFilesCount: number;
  isDestructive: boolean;
  canUndo: boolean;
  autoApproveAllowed: boolean;
}

export class SafetyChecker {
  /**
   * Assess safety of an operation plan
   */
  assess(plan: OperationPlan, command: ParsedCommand): SafetyAssessment {
    if (plan.steps.length === 0) {
      return {
        riskLevel: 'low',
        requiresConfirmation: false,
        affectedFilesCount: 0,
        isDestructive: false,
        canUndo: true,
        autoApproveAllowed: true
      };
    }

    const firstStep = plan.steps[0];
    const riskLevel = this.classifyRiskLevel(firstStep.type, plan, command);
    const isDestructive = this.isDestructiveOperation(firstStep.type);
    const requiresConfirmation = this.requiresConfirmation(riskLevel, plan, command);
    const warningMessage = this.generateWarningMessage(firstStep, plan, riskLevel);

    return {
      riskLevel,
      requiresConfirmation,
      warningMessage,
      affectedFilesCount: plan.totalFiles,
      isDestructive,
      canUndo: plan.canUndo,
      autoApproveAllowed: riskLevel === 'low' || (riskLevel === 'medium' && plan.totalFiles < 5)
    };
  }

  /**
   * Classify risk level of operation
   */
  private classifyRiskLevel(
    operationType: OperationStep['type'],
    plan: OperationPlan,
    command: ParsedCommand
  ): RiskLevel {
    // High risk operations
    if (operationType === 'delete') {
      return 'high';
    }

    // Medium risk operations
    if (operationType === 'move') {
      // Moving to recycle bin is high risk
      if (command.destination?.toLowerCase().includes('recycle bin') ||
          command.destination?.toLowerCase().includes('trash') ||
          command.options?.useRecycleBin) {
        return 'high';
      }
      // Bulk moves are medium-high risk
      if (plan.totalFiles > 10) {
        return 'high';
      }
      return 'medium';
    }

    if (operationType === 'rename') {
      return 'medium';
    }

    // Low risk operations
    if (operationType === 'copy' || operationType === 'create' || operationType === 'open') {
      // But bulk operations are medium risk
      if (plan.totalFiles > 50) {
        return 'medium';
      }
      return 'low';
    }

    return 'medium'; // Default to medium for unknown operations
  }

  /**
   * Check if operation is destructive (cannot be easily undone)
   */
  private isDestructiveOperation(operationType: OperationStep['type']): boolean {
    return operationType === 'delete' || operationType === 'move';
  }

  /**
   * Determine if confirmation is required
   */
  private requiresConfirmation(
    riskLevel: RiskLevel,
    plan: OperationPlan,
    command: ParsedCommand
  ): boolean {
    // Always require confirmation for high risk
    if (riskLevel === 'high') {
      return true;
    }

    // Require confirmation for bulk operations
    if (plan.totalFiles > 10) {
      return true;
    }

    // Require confirmation for operations outside workspace
    if (command.source && !this.isInWorkspace(command.source)) {
      // This would need workspace context - for now, assume medium risk
      if (riskLevel === 'medium') {
        return true;
      }
    }

    // Medium risk operations require confirmation
    if (riskLevel === 'medium') {
      return true;
    }

    // Low risk operations don't require confirmation
    return false;
  }

  /**
   * Check if path is in workspace (simplified - would need actual workspace path)
   */
  private isInWorkspace(filePath: string): boolean {
    // This is a simplified check - in real implementation, would compare
    // against actual workspace path
    // For now, assume system folders are outside workspace
    const systemFolders = ['desktop', 'documents', 'pictures', 'music', 'videos', 'downloads'];
    const lowerPath = filePath.toLowerCase();
    return !systemFolders.some(folder => lowerPath.includes(folder));
  }

  /**
   * Generate warning message for operation
   */
  private generateWarningMessage(
    step: OperationStep,
    plan: OperationPlan,
    riskLevel: RiskLevel
  ): string | undefined {
    if (riskLevel === 'low') {
      return undefined; // No warning for low risk
    }

    const messages: string[] = [];

    if (step.type === 'delete') {
      messages.push(`This will delete ${plan.totalFiles} file(s)`);
      if (step.options?.useRecycleBin) {
        messages.push('Files will be moved to Recycle Bin and can be recovered');
      } else {
        messages.push('⚠️ This action cannot be undone!');
      }
    } else if (step.type === 'move') {
      if (plan.steps.length > 1) {
        const destinationFolders = new Set(
          plan.steps
            .map((planStep) => planStep.destination ? path.dirname(planStep.destination) : null)
            .filter((value): value is string => Boolean(value))
        );

        if (destinationFolders.size > 1) {
          messages.push(`This will move ${plan.totalFiles} file(s) into ${destinationFolders.size} folder(s)`);
        } else {
          messages.push(`This will move ${plan.totalFiles} file(s)`);
        }
      } else {
        messages.push(`This will move ${plan.totalFiles} file(s) to ${step.destination || 'destination'}`);
      }

      if (step.destination?.toLowerCase().includes('recycle bin')) {
        messages.push('Files will be moved to Recycle Bin');
      }
    } else if (step.type === 'rename') {
      messages.push(`This will rename "${step.source}" to "${step.newName}"`);
    } else if (plan.totalFiles > 10) {
      messages.push(`This operation will affect ${plan.totalFiles} file(s)`);
    }

    return messages.length > 0 ? messages.join('. ') : undefined;
  }

  /**
   * Check if operation can be safely auto-approved
   */
  canAutoApprove(assessment: SafetyAssessment): boolean {
    return assessment.autoApproveAllowed && !assessment.requiresConfirmation;
  }

  /**
   * Get confirmation prompt text
   */
  getConfirmationPrompt(assessment: SafetyAssessment, step: OperationStep): string {
    const operation = step.type.charAt(0).toUpperCase() + step.type.slice(1);
    const source = step.source ? `"${step.source}"` : 'selected item';
    const dest = step.destination ? ` to "${step.destination}"` : '';
    const newName = step.newName ? ` to "${step.newName}"` : '';

    let prompt = `${operation} ${source}${dest}${newName}?`;

    if (assessment.affectedFilesCount > 1) {
      prompt = `Execute ${assessment.affectedFilesCount} ${step.type} operation(s)?`;
    }

    if (assessment.warningMessage) {
      prompt += `\n\n${assessment.warningMessage}`;
    }

    if (assessment.affectedFilesCount > 1) {
      prompt += `\n\nThis will affect ${assessment.affectedFilesCount} file(s).`;
    }

    return prompt;
  }
}

