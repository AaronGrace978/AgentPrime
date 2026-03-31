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
/**
 * Validate a tool call before execution
 */
export declare function validateToolCall(toolCall: any, workspacePath: string, taskContext?: string, specialistContext?: SpecialistValidationContext): ValidationResult;
/**
 * Fix a tool call based on validation result
 */
export declare function fixToolCall(toolCall: any, validation: ValidationResult): any;
//# sourceMappingURL=tool-validation.d.ts.map