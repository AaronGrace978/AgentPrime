/**
 * Timeout Utilities for AgentPrime
 * Provides timeout wrappers for operations to prevent infinite hangs
 * 
 * ENHANCED: Adaptive timeouts based on model size and operation complexity
 */

export class TimeoutError extends Error {
  public readonly shouldFallback: boolean;
  
  constructor(
    message: string, 
    public readonly timeoutMs: number,
    shouldFallback: boolean = true
  ) {
    super(message);
    this.name = 'TimeoutError';
    this.shouldFallback = shouldFallback;
  }
}

/**
 * Model size categories for adaptive timeouts
 */
export type ModelSize = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge' | 'cloud';

/**
 * Detect model size from model name for adaptive timeouts
 */
export function detectModelSize(modelName: string): ModelSize {
  const name = modelName.toLowerCase();
  
  // Cloud models (external API calls) - need longer timeouts
  if (name.includes('cloud') || name.includes('api')) return 'cloud';
  
  // XLarge models (>100B params)
  if (name.includes('671b') || name.includes('405b') || name.includes('180b')) return 'xlarge';
  
  // Large models (30B-100B)
  if (name.includes('70b') || name.includes('72b') || name.includes('34b') || name.includes('40b')) return 'large';
  
  // Medium models (7B-30B)
  if (name.includes('13b') || name.includes('14b') || name.includes('8b') || name.includes('7b') || name.includes('22b')) return 'medium';
  
  // Small models (1B-7B)
  if (name.includes('3b') || name.includes('1b') || name.includes('4b')) return 'small';
  
  // Tiny models (<1B)
  if (name.includes('0.5b') || name.includes('500m')) return 'tiny';
  
  // Default to medium if unknown
  return 'medium';
}

/**
 * Get timeout multiplier based on model size
 */
function getModelTimeoutMultiplier(modelSize: ModelSize): number {
  const multipliers: Record<ModelSize, number> = {
    tiny: 0.5,
    small: 1,
    medium: 1.5,
    large: 3,
    xlarge: 6,    // 671B models need 6x timeout
    cloud: 10     // Cloud models get 10x timeout - they are PRIORITIZED
  };
  return multipliers[modelSize];
}

/**
 * Wrap a promise with a timeout
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param errorMsg Custom error message for timeout
 * @returns Promise that rejects with TimeoutError if it doesn't complete in time
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMsg: string = `Operation timed out after ${ms}ms`
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(errorMsg, ms, true)), ms);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Base timeouts for different operation types (in ms)
 * These are multiplied by model size factor
 */
const BASE_TIMEOUTS = {
  chat: 45000,        // 45 seconds base for chat
  completion: 3000,   // 3 seconds for completions
  analysis: 90000,    // 90 seconds for analysis
  complex: 180000,    // 3 minutes base for complex tasks
  project: 300000     // 5 minutes for full project generation
};

/**
 * Wrap AI operations with ADAPTIVE timeouts based on model size
 * @param aiPromise AI operation promise
 * @param operationType Type of operation for timeout selection
 * @param modelName Optional model name for adaptive timeout calculation
 * @returns Promise with appropriate timeout
 */
export async function withAITimeout<T>(
  aiPromise: Promise<T>,
  operationType: 'chat' | 'completion' | 'analysis' | 'complex' | 'project' = 'chat',
  modelName?: string
): Promise<T> {
  const baseTimeout = BASE_TIMEOUTS[operationType];
  
  // Calculate adaptive timeout based on model size
  const modelSize = modelName ? detectModelSize(modelName) : 'medium';
  const multiplier = getModelTimeoutMultiplier(modelSize);
  const timeout = Math.round(baseTimeout * multiplier);
  
  const errorMsg = `${operationType} operation timed out after ${Math.round(timeout/1000)}s (model: ${modelName || 'unknown'}, size: ${modelSize}). Falling back to faster model...`;

  console.log(`[Timeout] ${operationType} timeout set to ${Math.round(timeout/1000)}s for ${modelSize} model`);
  
  return withTimeout(aiPromise, timeout, errorMsg);
}

/**
 * Wrap file operations with timeout
 * @param filePromise File operation promise
 * @param operationType Type of file operation
 * @returns Promise with timeout
 */
export async function withFileTimeout<T>(
  filePromise: Promise<T>,
  operationType: 'read' | 'write' | 'search' = 'read'
): Promise<T> {
  const timeouts = {
    read: 10000,   // 10 seconds for reading files
    write: 30000,  // 30 seconds for writing files
    search: 5000   // 5 seconds for file searches
  };

  const timeout = timeouts[operationType];
  const errorMsg = `File ${operationType} operation timed out after ${timeout/1000}s. The file may be locked or the operation is too large.`;

  return withTimeout(filePromise, timeout, errorMsg);
}

/**
 * Fallback model chain - CLOUD PROVIDERS FIRST!
 * When a model fails, we try the next one in the chain
 * Using Anthropic/OpenAI since they're confirmed working!
 */
export const FALLBACK_MODEL_CHAIN = [
  // Cloud providers - CONFIRMED WORKING!
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514', size: 'cloud' as ModelSize },
  { provider: 'openai', model: 'gpt-4o', size: 'cloud' as ModelSize },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', size: 'fast' as ModelSize },
  { provider: 'openai', model: 'gpt-4o-mini', size: 'fast' as ModelSize },

  // Ollama Cloud as last resort (if configured correctly)
  { provider: 'ollama', model: 'qwen3-coder:480b-cloud', size: 'cloud' as ModelSize },
];

/**
 * Result of a retry operation with fallback info
 */
export interface RetryResult<T> {
  result: T;
  usedFallback: boolean;
  finalModel?: string;
  attempts: number;
}

/**
 * Create a retry wrapper with exponential backoff
 * ENHANCED: Now signals when fallback should be used
 * @param operation Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 * @returns Promise that retries on timeout
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 500
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Only retry on TimeoutError
      if (!(error instanceof TimeoutError)) {
        throw error;
      }

      // Check if this timeout suggests we should fallback instead of retry
      const timeoutError = error as TimeoutError;
      if (timeoutError.shouldFallback && attempt >= 1) {
        // After 1 failed retry, signal that fallback is needed
        const fallbackError = new TimeoutError(
          `${lastError.message} - FALLBACK_RECOMMENDED`,
          timeoutError.timeoutMs,
          true
        );
        fallbackError.name = 'FallbackRecommended';
        throw fallbackError;
      }

      if (attempt === maxRetries) {
        throw new Error(`Operation failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`);
      }

      // Shorter backoff: 500ms, 1s (don't waste time on slow models)
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[Timeout] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Combined timeout and retry wrapper for AI operations
 * ENHANCED: Includes model name for adaptive timeouts
 * @param aiOperation AI operation function
 * @param operationType Type of operation
 * @param modelName Model name for adaptive timeout
 * @param maxRetries Maximum retries on timeout
 * @returns Promise with timeout and retry logic
 */
export async function withAITimeoutAndRetry<T>(
  aiOperation: () => Promise<T>,
  operationType: 'chat' | 'completion' | 'analysis' | 'complex' | 'project' = 'chat',
  modelName?: string,
  maxRetries: number = 1
): Promise<T> {
  return withRetry(
    () => withAITimeout(aiOperation(), operationType, modelName),
    maxRetries,
    500
  );
}

/**
 * Smart AI operation with automatic fallback to faster models
 * This is the RECOMMENDED way to call AI in AgentPrime
 */
export async function withSmartFallback<T>(
  operation: (provider: string, model: string) => Promise<T>,
  primaryProvider: string,
  primaryModel: string,
  operationType: 'chat' | 'completion' | 'analysis' | 'complex' | 'project' = 'chat'
): Promise<RetryResult<T>> {
  let attempts = 0;
  
  // Try primary model first
  try {
    attempts++;
    console.log(`[SmartFallback] Trying primary: ${primaryProvider}/${primaryModel}`);
    const result = await withAITimeoutAndRetry(
      () => operation(primaryProvider, primaryModel),
      operationType,
      primaryModel,
      1 // Only 1 retry on primary
    );
    return { result, usedFallback: false, finalModel: primaryModel, attempts };
  } catch (primaryError) {
    console.log(`[SmartFallback] Primary model failed: ${(primaryError as Error).message}`);
    
    // Try fallback models
    for (const fallback of FALLBACK_MODEL_CHAIN) {
      // Skip if it's the same as primary
      if (fallback.provider === primaryProvider && fallback.model === primaryModel) continue;
      
      try {
        attempts++;
        console.log(`[SmartFallback] Trying fallback: ${fallback.provider}/${fallback.model}`);
        const result = await withAITimeoutAndRetry(
          () => operation(fallback.provider, fallback.model),
          operationType,
          fallback.model,
          0 // No retries on fallbacks, just try next
        );
        console.log(`[SmartFallback] ✅ Fallback succeeded: ${fallback.model}`);
        return { result, usedFallback: true, finalModel: fallback.model, attempts };
      } catch (fallbackError) {
        console.log(`[SmartFallback] Fallback ${fallback.model} failed, trying next...`);
        continue;
      }
    }
    
    // All fallbacks failed
    throw new Error(`All models failed after ${attempts} attempts. Primary: ${primaryModel}. Check your Ollama installation.`);
  }
}
