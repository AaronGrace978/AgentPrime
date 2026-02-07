/**
 * Tool Validation Utilities
 * Validates tool calls before execution to prevent errors
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
    fixedPath?: string;
}
/**
 * Validate a tool call before execution
 */
export declare function validateToolCall(toolCall: any, workspacePath: string, taskContext?: string): ValidationResult;
/**
 * Fix a tool call based on validation result
 */
export declare function fixToolCall(toolCall: any, validation: ValidationResult): any;
//# sourceMappingURL=tool-validation.d.ts.map