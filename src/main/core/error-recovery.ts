/**
 * Error Recovery System for AgentPrime
 * Provides centralized error handling with classification, retry logic, and recovery strategies
 * 
 * ENHANCED: Now includes smart model fallback recommendations
 */

import { TimeoutError, FALLBACK_MODEL_CHAIN, detectModelSize } from './timeout-utils';

export enum ErrorType {
  API_ERROR = 'api_error',
  TIMEOUT_ERROR = 'timeout_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  CREDIT_ERROR = 'credit_error',
  MODEL_ERROR = 'model_error',
  FILE_ERROR = 'file_error',
  PARSE_ERROR = 'parse_error',
  NETWORK_ERROR = 'network_error',
  OLLAMA_NOT_RUNNING = 'ollama_not_running',
  MODEL_NOT_FOUND = 'model_not_found',
  UNKNOWN_ERROR = 'unknown_error'
}

export enum ErrorSeverity {
  LOW = 'low',       // Minor issues, can retry immediately
  MEDIUM = 'medium', // Moderate issues, exponential backoff
  HIGH = 'high',     // Serious issues, may need user intervention
  CRITICAL = 'critical' // System-level issues, stop operation
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
  type: 'retry' | 'escalate_model' | 'fallback_model' | 'fallback_provider' | 'user_intervention' | 'abort';
  delay?: number; // milliseconds
  message: string;
  userFriendlyMessage: string;
  suggestedModel?: { provider: string; model: string }; // For fallback_model type
}

export interface ErrorClassification {
  type: ErrorType;
  severity: ErrorSeverity;
  recoverable: boolean;
  rootCause: string;
  recoveryAction: RecoveryAction;
}

/**
 * Get a suggested fallback model based on current model
 */
function getSuggestedFallback(currentModel?: string): { provider: string; model: string } | undefined {
  if (!currentModel) return FALLBACK_MODEL_CHAIN[0];
  
  const currentSize = detectModelSize(currentModel);
  
  // If using a large/xlarge model, suggest a medium one
  if (currentSize === 'xlarge' || currentSize === 'cloud' || currentSize === 'large') {
    return FALLBACK_MODEL_CHAIN.find(m => m.size === 'medium') || FALLBACK_MODEL_CHAIN[0];
  }
  
  // Otherwise suggest next in chain
  return FALLBACK_MODEL_CHAIN[0];
}

/**
 * Classify an error and determine recovery strategy
 * ENHANCED: Better handling of Ollama errors and smart fallback suggestions
 */
export function classifyError(error: Error | any, context: ErrorContext): ErrorClassification {
  const errorMessage = error.message || error.toString();
  const lowerMessage = errorMessage.toLowerCase();

  // Ollama not running - critical but actionable
  if (lowerMessage.includes('econnrefused') && (lowerMessage.includes('11434') || lowerMessage.includes('ollama'))) {
    return {
      type: ErrorType.OLLAMA_NOT_RUNNING,
      severity: ErrorSeverity.CRITICAL,
      recoverable: false,
      rootCause: 'Ollama is not running',
      recoveryAction: {
        type: 'user_intervention',
        message: 'Ollama not running - start with: ollama serve',
        userFriendlyMessage: '❌ Ollama is not running! Start it with: ollama serve'
      }
    };
  }

  // Model not found in Ollama
  if (lowerMessage.includes('model') && lowerMessage.includes('not found')) {
    const suggestedModel = getSuggestedFallback(context.model);
    return {
      type: ErrorType.MODEL_NOT_FOUND,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      rootCause: `Model '${context.model}' not installed`,
      recoveryAction: {
        type: 'fallback_model',
        message: `Model not found - trying ${suggestedModel?.model || 'fallback'}`,
        userFriendlyMessage: `Model not installed. Try: ollama pull ${context.model}`,
        suggestedModel
      }
    };
  }

  // API/Credit errors - often not recoverable
  if (lowerMessage.includes('credit') || lowerMessage.includes('billing') ||
      lowerMessage.includes('insufficient') || lowerMessage.includes('upgrade') ||
      lowerMessage.includes('purchase')) {
    return {
      type: ErrorType.CREDIT_ERROR,
      severity: ErrorSeverity.CRITICAL,
      recoverable: false,
      rootCause: 'API credits exhausted',
      recoveryAction: {
        type: 'user_intervention',
        message: 'API credits exhausted - requires user to add credits',
        userFriendlyMessage: 'Your API credits are exhausted. Please add credits to your account and try again.'
      }
    };
  }

  // Rate limiting
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('429') ||
      lowerMessage.includes('too many requests')) {
    const delay = Math.min(30000, Math.pow(2, context.attemptNumber) * 1000);
    return {
      type: ErrorType.RATE_LIMIT_ERROR,
      severity: ErrorSeverity.MEDIUM,
      recoverable: true,
      rootCause: 'Rate limit exceeded',
      recoveryAction: {
        type: 'retry',
        delay,
        message: `Rate limited - retrying in ${delay/1000}s`,
        userFriendlyMessage: `The API is busy. Retrying in ${Math.ceil(delay/1000)} seconds...`
      }
    };
  }

  // Timeout errors - RECOMMEND FALLBACK instead of just retry
  if (error instanceof TimeoutError) {
    const shouldFallback = (error as TimeoutError).shouldFallback && context.attemptNumber >= 1;
    const suggestedModel = getSuggestedFallback(context.model);
    
    if (shouldFallback && suggestedModel) {
      return {
        type: ErrorType.TIMEOUT_ERROR,
        severity: ErrorSeverity.MEDIUM,
        recoverable: true,
        rootCause: 'Model too slow - switching to faster model',
        recoveryAction: {
          type: 'fallback_model',
          message: `Timeout - switching to faster model: ${suggestedModel.model}`,
          userFriendlyMessage: `The model is too slow. Switching to ${suggestedModel.model}...`,
          suggestedModel
        }
      };
    }
    
    return {
      type: ErrorType.TIMEOUT_ERROR,
      severity: ErrorSeverity.MEDIUM,
      recoverable: context.attemptNumber < context.maxRetries,
      rootCause: 'Operation timed out',
      recoveryAction: context.attemptNumber < context.maxRetries ? {
        type: 'retry',
        delay: Math.min(5000, Math.pow(2, context.attemptNumber) * 500), // Shorter delays
        message: `Timeout - retrying`,
        userFriendlyMessage: 'The operation is taking longer than expected. Trying again...'
      } : {
        type: 'fallback_model',
        message: 'Max retries exceeded - try faster model',
        userFriendlyMessage: 'The model keeps timing out. Try a faster local model.',
        suggestedModel: getSuggestedFallback(context.model)
      }
    };
  }

  // Model-specific errors
  if (lowerMessage.includes('model') && (lowerMessage.includes('not found') || lowerMessage.includes('invalid'))) {
    const suggestedModel = getSuggestedFallback(context.model);
    return {
      type: ErrorType.MODEL_ERROR,
      severity: ErrorSeverity.HIGH,
      recoverable: true,
      rootCause: 'Model not available',
      recoveryAction: {
        type: 'fallback_model',
        message: 'Model not found - trying fallback model',
        userFriendlyMessage: 'The selected AI model is not available. Switching to a different model...',
        suggestedModel
      }
    };
  }

  // Network errors - could be Ollama not running
  if (lowerMessage.includes('network') || lowerMessage.includes('connection') ||
      lowerMessage.includes('ECONNREFUSED') || lowerMessage.includes('ENOTFOUND')) {
    return {
      type: ErrorType.NETWORK_ERROR,
      severity: ErrorSeverity.MEDIUM,
      recoverable: context.attemptNumber < 2,
      rootCause: 'Network connectivity issue',
      recoveryAction: context.attemptNumber < 2 ? {
        type: 'retry',
        delay: 1000,
        message: 'Network error - retrying',
        userFriendlyMessage: 'Network connection issue. Retrying...'
      } : {
        type: 'user_intervention',
        message: 'Persistent network errors - check Ollama',
        userFriendlyMessage: 'Unable to connect. Make sure Ollama is running: ollama serve'
      }
    };
  }

  // Parse errors
  if (lowerMessage.includes('json') && lowerMessage.includes('parse') ||
      lowerMessage.includes('syntax') || lowerMessage.includes('unexpected token')) {
    return {
      type: ErrorType.PARSE_ERROR,
      severity: ErrorSeverity.LOW,
      recoverable: true,
      rootCause: 'Response parsing failed',
      recoveryAction: {
        type: 'retry',
        delay: 0,
        message: 'Parse error - retrying with different approach',
        userFriendlyMessage: 'There was an issue processing the AI response. Trying a different approach...'
      }
    };
  }

  // File system errors
  if (lowerMessage.includes('ENOENT') || lowerMessage.includes('EACCES') ||
      lowerMessage.includes('file') || lowerMessage.includes('permission')) {
    return {
      type: ErrorType.FILE_ERROR,
      severity: ErrorSeverity.HIGH,
      recoverable: false,
      rootCause: 'File system error',
      recoveryAction: {
        type: 'user_intervention',
        message: 'File system error - requires user intervention',
        userFriendlyMessage: 'File system error. Please check file permissions and available disk space.'
      }
    };
  }

  // Generic API errors
  if (lowerMessage.includes('api') || lowerMessage.includes('500') ||
      lowerMessage.includes('502') || lowerMessage.includes('503') ||
      lowerMessage.includes('504')) {
    return {
      type: ErrorType.API_ERROR,
      severity: ErrorSeverity.MEDIUM,
      recoverable: context.attemptNumber < context.maxRetries,
      rootCause: 'API server error',
      recoveryAction: context.attemptNumber < context.maxRetries ? {
        type: 'retry',
        delay: Math.min(10000, Math.pow(2, context.attemptNumber) * 1000),
        message: 'API error - retrying',
        userFriendlyMessage: 'The AI service encountered an error. Retrying...'
      } : {
        type: 'escalate_model',
        message: 'Persistent API errors - escalating to more reliable model',
        userFriendlyMessage: 'The AI service is having issues. Switching to a more reliable model...'
      }
    };
  }

  // Unknown errors - assume recoverable with retry
  return {
    type: ErrorType.UNKNOWN_ERROR,
    severity: ErrorSeverity.MEDIUM,
    recoverable: context.attemptNumber < 2,
    rootCause: 'Unknown error',
    recoveryAction: context.attemptNumber < 2 ? {
      type: 'retry',
      delay: 1000,
      message: 'Unknown error - retrying once',
      userFriendlyMessage: 'An unexpected error occurred. Trying again...'
    } : {
      type: 'user_intervention',
      message: 'Unknown error after retries',
      userFriendlyMessage: 'An unexpected error occurred. Please try again or contact support if the issue persists.'
    }
  };
}

/**
 * Execute recovery action
 * ENHANCED: Returns suggested fallback model when available
 */
export async function executeRecovery(
  classification: ErrorClassification,
  context: ErrorContext
): Promise<{ 
  shouldRetry: boolean; 
  delay: number; 
  message: string;
  suggestedModel?: { provider: string; model: string };
}> {
  const action = classification.recoveryAction;

  switch (action.type) {
    case 'retry':
      return {
        shouldRetry: true,
        delay: action.delay || 0,
        message: action.message
      };

    case 'fallback_model':
      // Return suggested model for caller to use
      return {
        shouldRetry: true,
        delay: 0,
        message: action.message,
        suggestedModel: action.suggestedModel
      };

    case 'escalate_model':
      return {
        shouldRetry: true,
        delay: 0,
        message: action.message
      };

    case 'fallback_provider':
      return {
        shouldRetry: true,
        delay: 0,
        message: action.message
      };

    case 'user_intervention':
      return {
        shouldRetry: false,
        delay: 0,
        message: action.message
      };

    case 'abort':
    default:
      return {
        shouldRetry: false,
        delay: 0,
        message: 'Operation aborted due to critical error'
      };
  }
}

/**
 * Enhanced retry function with error classification and recovery
 * ENHANCED: Supports model fallback suggestions
 */
export async function retryWithRecovery<T>(
  operation: () => Promise<T>,
  context: Omit<ErrorContext, 'attemptNumber'>,
  maxRetries: number = 2  // Reduced from 3 - fail fast, fallback faster
): Promise<T> {
  let lastError: Error;
  let lastClassification: ErrorClassification;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const attemptContext: ErrorContext = {
        ...context,
        attemptNumber: attempt,
        maxRetries
      };

      const classification = classifyError(error, attemptContext);
      lastClassification = classification;

      console.log(`[ErrorRecovery] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, {
        type: classification.type,
        severity: classification.severity,
        recoverable: classification.recoverable,
        rootCause: classification.rootCause
      });

      // If it's a critical error (Ollama not running), fail immediately with helpful message
      if (classification.type === ErrorType.OLLAMA_NOT_RUNNING) {
        throw new Error(`❌ Ollama is not running!\n\nStart Ollama with: ollama serve\n\nThen pull a model: ollama pull qwen2.5:14b`);
      }

      // If not recoverable or max retries reached, throw
      if (!classification.recoverable || attempt === maxRetries) {
        const recovery = await executeRecovery(classification, attemptContext);
        if (recovery.suggestedModel) {
          throw new Error(`${classification.rootCause}. Try model: ${recovery.suggestedModel.model}\n\nOriginal error: ${lastError.message}`);
        }
        throw new Error(`${classification.rootCause}: ${lastError.message}`);
      }

      // Execute recovery action
      const recovery = await executeRecovery(classification, attemptContext);

      if (!recovery.shouldRetry) {
        throw new Error(`${classification.rootCause}: ${lastError.message}`);
      }

      // Log recovery action
      if (recovery.suggestedModel) {
        console.log(`[ErrorRecovery] 🔄 ${recovery.message} → ${recovery.suggestedModel.model}`);
      } else if (recovery.delay > 0) {
        console.log(`[ErrorRecovery] ${recovery.message} (${recovery.delay}ms delay)`);
        await new Promise(resolve => setTimeout(resolve, recovery.delay));
      } else {
        console.log(`[ErrorRecovery] ${recovery.message}`);
      }
    }
  }

  throw lastError!;
}

/**
 * Get user-friendly error message for display
 */
export function getUserFriendlyErrorMessage(error: Error | any, context: ErrorContext): string {
  const classification = classifyError(error, context);
  return classification.recoveryAction.userFriendlyMessage;
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error: Error | any, context: ErrorContext): boolean {
  const classification = classifyError(error, context);
  return classification.recoverable && classification.severity !== ErrorSeverity.CRITICAL;
}