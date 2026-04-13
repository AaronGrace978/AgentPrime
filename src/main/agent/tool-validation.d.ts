/**
 * Tool Validation Utilities
 * Validates tool calls before execution to prevent errors
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
    fixedPath?: string;
    warning?: string;
}
export interface SpecialistValidationContext {
    specialist?: string;
    claimedFiles?: string[];
    blackboard?: any;
}
export interface VibeCoderExecutionPolicy {
    intent: 'plan-only' | 'build-now' | 'repair-only' | 'review-only';
    responseMode: 'direct' | 'agent';
    allowWrites: boolean;
    allowCommands: boolean;
    allowScaffold: boolean;
    allowInstalls: boolean;
}
/**
 * Validate a tool call before execution
 */
export declare function validateToolCall(toolCall: any, workspacePath: string, taskContext?: string, specialistContext?: SpecialistValidationContext, executionPolicy?: VibeCoderExecutionPolicy): ValidationResult;
/**
 * Fix a tool call based on validation result
 */
export declare function fixToolCall(toolCall: any, validation: ValidationResult): any;
//# sourceMappingURL=tool-validation.d.ts.map