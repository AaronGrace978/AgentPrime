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
 * Thrown by every provider when the caller's AbortSignal fires (or the
 * underlying transport reports a CanceledError). This is a HARD STOP:
 * - withRetry must not retry on it
 * - withSmartFallback must not run the fallback chain on it
 * - UI should render a friendly "Stopped" state, not an error toast
 *
 * Use `isAbortError(err)` for safe duck-typing across module boundaries.
 */
export class AbortError extends Error {
  public readonly isAbortError = true;

  constructor(message: string = 'Request aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof AbortError) return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as any;
    if (anyErr.isAbortError === true) return true;
    if (anyErr.code === 'ERR_CANCELED') return true;
    if (anyErr.name === 'CanceledError') return true;
  }
  return false;
}

export type RuntimeBudgetMode = 'instant' | 'standard' | 'deep';

/**
 * Model size categories for adaptive timeouts
 */
export type ModelSize = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge' | 'cloud';
type OperationType = 'chat' | 'completion' | 'analysis' | 'complex' | 'project';

/**
 * Detect model size from model name for adaptive timeouts
 */
export function detectModelSize(modelName: string): ModelSize {
  const name = modelName.toLowerCase();
  
  // Cloud models (external API calls) - need longer timeouts
  if (name.includes('cloud') || name.includes('api')) return 'cloud';

  // Hosted provider models are always cloud-speed (network round-trip + inference).
  // GPT-5.x, GPT-4o, Claude, Gemini, etc. don't have a "7b" tag, so the param-size
  // heuristics below would misclassify them as 'medium' and give a 68s timeout that
  // kills the request before the API responds.
  if (
    name.startsWith('gpt-') ||
    name.startsWith('o1') ||
    name.startsWith('o3') ||
    name.startsWith('o4') ||
    name.startsWith('claude') ||
    name.startsWith('gemini') ||
    name.includes('openrouter/')
  ) {
    return 'cloud';
  }
  
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
    cloud: 2      // Cloud models need headroom, but interactive flows should fail over quickly
  };
  return multipliers[modelSize];
}

function getRuntimeBudgetTimeoutMultiplier(runtimeBudget: RuntimeBudgetMode): number {
  const multipliers: Record<RuntimeBudgetMode, number> = {
    instant: 0.7,
    standard: 1,
    deep: 1.35,
  };
  return multipliers[runtimeBudget];
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
 * Hard caps prevent runaway adaptive timeouts (e.g. 30+ minute cloud waits).
 * Goal: fail faster so smart fallback can try the next model sooner,
 * but not SO fast that Ollama cloud models always timeout on valid work.
 */
const MAX_TIMEOUTS: Record<OperationType, number> = {
  chat: 300000,       // 5 minutes
  completion: 30000,  // 30 seconds
  analysis: 600000,   // 10 minutes
  complex: 900000,    // 15 minutes
  project: 1200000    // 20 minutes
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
  operationType: OperationType = 'chat',
  modelName?: string,
  runtimeBudget: RuntimeBudgetMode = 'standard'
): Promise<T> {
  const baseTimeout = BASE_TIMEOUTS[operationType];
  
  // Calculate adaptive timeout based on model size
  const modelSize = modelName ? detectModelSize(modelName) : 'medium';
  const multiplier = getModelTimeoutMultiplier(modelSize) * getRuntimeBudgetTimeoutMultiplier(runtimeBudget);
  const adaptiveTimeout = Math.round(baseTimeout * multiplier);
  const timeout = Math.min(adaptiveTimeout, MAX_TIMEOUTS[operationType]);
  
  const errorMsg = `${operationType} operation timed out after ${Math.round(timeout/1000)}s (model: ${modelName || 'unknown'}, size: ${modelSize}, budget: ${runtimeBudget}). Falling back to faster model...`;

  if (timeout < adaptiveTimeout) {
    console.log(
      `[Timeout] ${operationType} timeout capped from ${Math.round(adaptiveTimeout / 1000)}s to ${Math.round(timeout / 1000)}s for ${modelSize} model`
    );
  }
  console.log(`[Timeout] ${operationType} timeout set to ${Math.round(timeout/1000)}s for ${modelSize} model (${runtimeBudget} budget)`);
  
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
  // Prefer faster interactive models before deeper long-running fallbacks.
  { provider: 'ollama', model: 'minimax-m2.7:cloud', size: 'cloud' as ModelSize },
  { provider: 'ollama', model: 'gemma4', size: 'cloud' as ModelSize },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', size: 'fast' as ModelSize },
  { provider: 'openai', model: 'gpt-4o-mini', size: 'fast' as ModelSize },
  { provider: 'ollama', model: 'qwen3-coder-next:cloud', size: 'cloud' as ModelSize },
  { provider: 'ollama', model: 'qwen3-coder:480b-cloud', size: 'cloud' as ModelSize },
  { provider: 'anthropic', model: 'claude-sonnet-4-6', size: 'cloud' as ModelSize },
  { provider: 'openai', model: 'gpt-4o', size: 'cloud' as ModelSize },
  { provider: 'anthropic', model: 'claude-opus-4-7', size: 'cloud' as ModelSize },
  { provider: 'anthropic', model: 'claude-opus-4-6', size: 'cloud' as ModelSize },
  { provider: 'openai', model: 'gpt-5.2-2025-12-11', size: 'cloud' as ModelSize },
];

const recentProviderFailures: Map<string, { count: number; lastFailed: number }> = new Map();
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // skip provider for 5 min after 2+ failures

function recordProviderFailure(provider: string): void {
  const entry = recentProviderFailures.get(provider) || { count: 0, lastFailed: 0 };
  entry.count += 1;
  entry.lastFailed = Date.now();
  recentProviderFailures.set(provider, entry);
}

function shouldSkipProvider(provider: string): boolean {
  // Never skip Ollama: failures are often per-model (timeouts). Aggregating by
  // provider would skip the second Ollama fallback after the first times out.
  if (provider === 'ollama') {
    return false;
  }
  const entry = recentProviderFailures.get(provider);
  if (!entry) return false;
  if (Date.now() - entry.lastFailed > FAILURE_COOLDOWN_MS) {
    recentProviderFailures.delete(provider);
    return false;
  }
  return entry.count >= 2;
}

/**
 * Result of a retry operation with fallback info
 */
export interface RetryResult<T> {
  result: T;
  usedFallback: boolean;
  finalProvider?: string;
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

      // User-initiated abort is a hard stop — never retry.
      if (isAbortError(error)) {
        throw error;
      }

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
  operationType: OperationType = 'chat',
  modelName?: string,
  maxRetries: number = 1,
  runtimeBudget: RuntimeBudgetMode = 'standard'
): Promise<T> {
  return withRetry(
    () => withAITimeout(aiOperation(), operationType, modelName, runtimeBudget),
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
  operationType: OperationType = 'chat',
  runtimeBudget: RuntimeBudgetMode = 'standard'
): Promise<RetryResult<T>> {
  let attempts = 0;

  const primaryModelSize = detectModelSize(primaryModel);
  // For cloud models, fail over faster instead of repeating the same large request.
  const primaryRetries =
    primaryModelSize === 'cloud' && (operationType === 'chat' || operationType === 'analysis' || operationType === 'complex' || operationType === 'project')
      ? 0
      : 1;
  
  // Try primary model first
  try {
    attempts++;
    console.log(`[SmartFallback] Trying primary: ${primaryProvider}/${primaryModel}`);
    const result = await withAITimeoutAndRetry(
      () => operation(primaryProvider, primaryModel),
      operationType,
      primaryModel,
      primaryRetries,
      runtimeBudget
    );
    const servedBy = (result as any)?.servedBy;
    return {
      result,
      usedFallback: false,
      finalProvider: servedBy?.provider || primaryProvider,
      finalModel: servedBy?.model || primaryModel,
      attempts
    };
  } catch (primaryError) {
    // User-initiated abort: do NOT walk the fallback chain. The whole
    // point of Stop is to stop, not to silently retry against every other
    // model in the lineup.
    if (isAbortError(primaryError)) {
      throw primaryError;
    }

    console.log(`[SmartFallback] Primary model failed: ${(primaryError as Error).message}`);

    recordProviderFailure(primaryProvider);

    // Try fallback models
    for (const fallback of FALLBACK_MODEL_CHAIN) {
      if (fallback.provider === primaryProvider && fallback.model === primaryModel) continue;

      if (shouldSkipProvider(fallback.provider)) {
        console.log(`[SmartFallback] Skipping ${fallback.provider}/${fallback.model} (provider failed recently)`);
        continue;
      }
      
      try {
        attempts++;
        console.log(`[SmartFallback] Trying fallback: ${fallback.provider}/${fallback.model}`);
        const result = await withAITimeoutAndRetry(
          () => operation(fallback.provider, fallback.model),
          operationType,
          fallback.model,
          0,
          runtimeBudget
        );
        console.log(`[SmartFallback] ✅ Fallback succeeded: ${fallback.model}`);
        const servedBy = (result as any)?.servedBy;
        return {
          result,
          usedFallback: true,
          finalProvider: servedBy?.provider || fallback.provider,
          finalModel: servedBy?.model || fallback.model,
          attempts
        };
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) {
          // User aborted mid-fallback — bail out of the whole chain.
          throw fallbackError;
        }
        const errMsg = (fallbackError as Error).message || String(fallbackError);
        console.log(`[SmartFallback] Fallback ${fallback.model} failed: ${errMsg.substring(0, 200)}`);
        recordProviderFailure(fallback.provider);
        continue;
      }
    }
    
    throw new Error(`All models failed after ${attempts} attempts. Primary: ${primaryModel}. Check your API keys and Ollama configuration.`);
  }
}
