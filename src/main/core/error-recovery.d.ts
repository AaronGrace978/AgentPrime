/**
 * Error Recovery System for AgentPrime
 * Provides centralized error handling with classification, retry logic, and recovery strategies
 */
export declare enum ErrorType {
    API_ERROR = "api_error",
    TIMEOUT_ERROR = "timeout_error",
    RATE_LIMIT_ERROR = "rate_limit_error",
    CREDIT_ERROR = "credit_error",
    MODEL_ERROR = "model_error",
    FILE_ERROR = "file_error",
    PARSE_ERROR = "parse_error",
    NETWORK_ERROR = "network_error",
    UNKNOWN_ERROR = "unknown_error"
}
export declare enum ErrorSeverity {
    LOW = "low",// Minor issues, can retry immediately
    MEDIUM = "medium",// Moderate issues, exponential backoff
    HIGH = "high",// Serious issues, may need user intervention
    CRITICAL = "critical"
}
export interface ErrorContext {
    operation: string;
    model?: string;
    provider?: string;
    attemptNumber: number;
    maxRetries: number;
    timestamp?: number;
    userMessage?: string;
}
export interface RecoveryAction {
    type: 'retry' | 'escalate_model' | 'fallback_provider' | 'user_intervention' | 'abort';
    delay?: number;
    message: string;
    userFriendlyMessage: string;
}
export interface ErrorClassification {
    type: ErrorType;
    severity: ErrorSeverity;
    recoverable: boolean;
    rootCause: string;
    recoveryAction: RecoveryAction;
}
/**
 * Classify an error and determine recovery strategy
 */
export declare function classifyError(error: Error | any, context: ErrorContext): ErrorClassification;
/**
 * Execute recovery action
 */
export declare function executeRecovery(classification: ErrorClassification, context: ErrorContext): Promise<{
    shouldRetry: boolean;
    delay: number;
    message: string;
}>;
/**
 * Enhanced retry function with error classification and recovery
 */
export declare function retryWithRecovery<T>(operation: () => Promise<T>, context: Omit<ErrorContext, 'attemptNumber'>, maxRetries?: number): Promise<T>;
/**
 * Get user-friendly error message for display
 */
export declare function getUserFriendlyErrorMessage(error: Error | any, context: ErrorContext): string;
/**
 * Check if error is recoverable
 */
export declare function isRecoverableError(error: Error | any, context: ErrorContext): boolean;
//# sourceMappingURL=error-recovery.d.ts.map