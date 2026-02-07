/**
 * LocalBrain - Fast Local Intelligence Module
 * 
 * Provides instant intent classification and simple response generation
 * using local resources, minimizing cloud API calls.
 * 
 * Architecture:
 * 1. FastPath: Regex patterns for common intents (< 1ms)
 * 2. LocalLLM: Ollama for classification/simple responses (< 500ms)
 * 3. Cloud: Complex tasks routed to Claude/cloud AI
 */

import { OllamaProvider } from '../../ai-providers/ollama-provider';
import {
  LocalBrainConfig,
  DEFAULT_CONFIG,
  ClassifiedIntent,
  CachedResponse,
  LocalBrainStatus
} from './types';
import {
  classifyIntentFast,
  estimateComplexity,
  isSimpleAcknowledgment,
  isFollowUp
} from './intent-classifier';

// Re-export types
export * from './types';
export { classifyIntentFast, estimateComplexity } from './intent-classifier';

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL BRAIN CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class LocalBrain {
  private config: LocalBrainConfig;
  private ollama: OllamaProvider | null = null;
  private cache: Map<string, CachedResponse> = new Map();
  private stats = {
    totalRequests: 0,
    fastPathHits: 0,
    localHandled: 0,
    cloudRouted: 0,
    cacheHits: 0,
    totalLatency: 0
  };
  private modelAvailable: boolean = false;
  private initPromise: Promise<void> | null = null;
  
  constructor(config: Partial<LocalBrainConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Initialize LocalBrain - check Ollama availability and load model
   */
  async initialize(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
      return this.modelAvailable;
    }
    
    this.initPromise = this._doInit();
    await this.initPromise;
    return this.modelAvailable;
  }
  
  private async _doInit(): Promise<void> {
    try {
      this.ollama = new OllamaProvider({ model: this.config.model });
      
      // Check if Ollama is running
      const healthy = await this.ollama.isHealthy();
      if (!healthy) {
        console.log('[LocalBrain] Ollama not running - local inference disabled');
        this.modelAvailable = false;
        return;
      }
      
      // Check if model is available
      const hasModel = await this.ollama.hasModel(this.config.model);
      if (!hasModel) {
        console.log(`[LocalBrain] Model ${this.config.model} not found, trying fallback...`);
        
        if (this.config.fallbackModel) {
          const hasFallback = await this.ollama.hasModel(this.config.fallbackModel);
          if (hasFallback) {
            console.log(`[LocalBrain] Using fallback model: ${this.config.fallbackModel}`);
            this.config.model = this.config.fallbackModel;
            this.ollama = new OllamaProvider({ model: this.config.fallbackModel });
            this.modelAvailable = true;
          } else {
            console.log('[LocalBrain] No suitable model found - local inference disabled');
            this.modelAvailable = false;
          }
        } else {
          this.modelAvailable = false;
        }
        return;
      }
      
      this.modelAvailable = true;
      console.log(`[LocalBrain] Initialized with model: ${this.config.model}`);
      
      // Warm up the model with a simple request
      this.warmUp();
    } catch (error) {
      console.error('[LocalBrain] Initialization error:', error);
      this.modelAvailable = false;
    }
  }
  
  /**
   * Warm up the model to reduce first-request latency
   */
  private async warmUp(): Promise<void> {
    if (!this.ollama || !this.modelAvailable) return;
    
    try {
      await this.ollama.complete('Hi', { maxTokens: 1 });
      console.log('[LocalBrain] Model warmed up');
    } catch {
      // Ignore warm-up errors
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Classify user intent - the main entry point
   * Returns routing decision and extracted intent
   */
  async classify(input: string): Promise<ClassifiedIntent> {
    const startTime = performance.now();
    this.stats.totalRequests++;
    
    // Check cache first
    const cacheKey = input.toLowerCase().trim();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      cached.hits++;
      this.stats.cacheHits++;
      return cached.output;
    }
    
    // Try FastPath first (regex patterns)
    const fastResult = classifyIntentFast(input);
    if (fastResult && fastResult.confidence >= 0.85) {
      this.stats.fastPathHits++;
      this.stats.totalLatency += performance.now() - startTime;
      this.cacheResult(cacheKey, fastResult);
      console.log(`[LocalBrain] FastPath hit: ${fastResult.category} -> ${fastResult.action} (${(performance.now() - startTime).toFixed(1)}ms)`);
      return fastResult;
    }
    
    // Check complexity
    const complexity = estimateComplexity(input);
    
    // Simple acknowledgments don't need classification
    if (isSimpleAcknowledgment(input)) {
      const result: ClassifiedIntent = {
        category: 'conversation',
        confidence: 0.95,
        routing: 'local'
      };
      return result;
    }
    
    // Follow-up questions need context - route to cloud
    if (isFollowUp(input)) {
      const result: ClassifiedIntent = {
        category: 'conversation',
        confidence: 0.7,
        routing: 'cloud',
        reasoning: 'Follow-up question needs conversation context'
      };
      this.stats.cloudRouted++;
      return result;
    }
    
    // High complexity - route to cloud
    if (complexity > this.config.complexityThreshold) {
      const result: ClassifiedIntent = {
        category: 'complex_task',
        confidence: 0.8,
        routing: 'cloud',
        reasoning: `Complexity score: ${complexity.toFixed(2)}`
      };
      this.stats.cloudRouted++;
      return result;
    }
    
    // If we have a FastPath result with lower confidence, use it but route appropriately
    if (fastResult) {
      if (fastResult.action && fastResult.confidence >= 0.7) {
        fastResult.routing = 'fastpath';
        this.stats.fastPathHits++;
      } else {
        fastResult.routing = this.modelAvailable ? 'local' : 'cloud';
        if (fastResult.routing === 'local') {
          this.stats.localHandled++;
        } else {
          this.stats.cloudRouted++;
        }
      }
      this.stats.totalLatency += performance.now() - startTime;
      this.cacheResult(cacheKey, fastResult);
      return fastResult;
    }
    
    // Try local LLM classification if available
    if (this.modelAvailable && this.ollama) {
      try {
        const llmResult = await this.classifyWithLLM(input);
        if (llmResult && llmResult.confidence >= this.config.confidenceThreshold) {
          this.stats.localHandled++;
          this.stats.totalLatency += performance.now() - startTime;
          this.cacheResult(cacheKey, llmResult);
          console.log(`[LocalBrain] LLM classified: ${llmResult.category} (${(performance.now() - startTime).toFixed(1)}ms)`);
          return llmResult;
        }
      } catch (error) {
        console.warn('[LocalBrain] LLM classification failed:', error);
      }
    }
    
    // Default: route to cloud
    const defaultResult: ClassifiedIntent = {
      category: 'unknown',
      confidence: 0.5,
      routing: 'cloud',
      reasoning: 'No clear intent detected'
    };
    this.stats.cloudRouted++;
    this.stats.totalLatency += performance.now() - startTime;
    return defaultResult;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // LLM CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Use local LLM for intent classification
   */
  private async classifyWithLLM(input: string): Promise<ClassifiedIntent | null> {
    if (!this.ollama) return null;
    
    const prompt = `Classify the user's intent. Respond with JSON only.

User message: "${input}"

Categories:
- system_control: volume, mute, lock, brightness
- app_launch: open apps, launch games
- file_operation: organize, create, move files
- calendar: calendar events, schedule queries
- email: send or read emails
- reminder: set reminders or alarms
- time_date: current time or date
- web_search: needs web search for info
- automation: mouse/keyboard actions
- media: music, video control
- smart_home: lights, thermostat
- conversation: casual chat, greeting
- complex_task: multi-step, needs planning

Respond ONLY with: {"category":"...", "confidence":0.0-1.0, "action":"...or null"}`;

    try {
      const result = await this.ollama.complete(prompt, {
        maxTokens: 100,
        temperature: 0.1  // Low temperature for consistent classification
      });
      
      if (result.success && result.content) {
        // Parse JSON response
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            category: parsed.category || 'unknown',
            confidence: parsed.confidence || 0.5,
            action: parsed.action || undefined,
            routing: parsed.confidence >= 0.8 ? 'local' : 'cloud'
          };
        }
      }
    } catch (error) {
      console.warn('[LocalBrain] LLM parse error:', error);
    }
    
    return null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SIMPLE RESPONSE GENERATION
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Generate a simple response locally (for greetings, acknowledgments, etc.)
   */
  async generateSimpleResponse(input: string): Promise<string | null> {
    if (!this.ollama || !this.modelAvailable) return null;
    
    const prompt = `You are Matrix, a casual AI assistant. Respond briefly and naturally.

User: ${input}

(Keep response under 50 words, be casual and friendly)

Matrix:`;

    try {
      const result = await this.ollama.complete(prompt, {
        maxTokens: 80,
        temperature: 0.7
      });
      
      if (result.success && result.content) {
        return result.content.trim();
      }
    } catch {
      return null;
    }
    
    return null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // CACHE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────
  
  private cacheResult(key: string, result: ClassifiedIntent): void {
    if (!this.config.enableCache) return;
    
    // Enforce cache size limit
    if (this.cache.size >= this.config.cacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this.config.cacheSize * 0.2));
      toRemove.forEach(([k]) => this.cache.delete(k));
    }
    
    this.cache.set(key, {
      input: key,
      output: result,
      timestamp: Date.now(),
      hits: 1
    });
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS & STATS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get LocalBrain status
   */
  async getStatus(): Promise<LocalBrainStatus> {
    const ollamaRunning = this.ollama ? await this.ollama.isHealthy() : false;
    
    return {
      available: this.modelAvailable,
      model: this.modelAvailable ? this.config.model : null,
      ollamaRunning,
      modelLoaded: this.modelAvailable,
      cacheSize: this.cache.size,
      averageLatency: this.stats.totalRequests > 0 
        ? this.stats.totalLatency / this.stats.totalRequests 
        : 0,
      totalRequests: this.stats.totalRequests,
      localHandled: this.stats.fastPathHits + this.stats.localHandled,
      cloudRouted: this.stats.cloudRouted
    };
  }
  
  /**
   * Get routing statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }
  
  /**
   * Check if LocalBrain can handle requests
   */
  isAvailable(): boolean {
    return true;  // FastPath always works, even without Ollama
  }
  
  /**
   * Check if local LLM is available
   */
  isLLMAvailable(): boolean {
    return this.modelAvailable;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let localBrainInstance: LocalBrain | null = null;

/**
 * Get or create LocalBrain instance
 */
export function getLocalBrain(config?: Partial<LocalBrainConfig>): LocalBrain {
  if (!localBrainInstance) {
    localBrainInstance = new LocalBrain(config);
  }
  return localBrainInstance;
}

/**
 * Initialize LocalBrain (call early in app startup)
 */
export async function initializeLocalBrain(config?: Partial<LocalBrainConfig>): Promise<LocalBrain> {
  const brain = getLocalBrain(config);
  await brain.initialize();
  return brain;
}

export default LocalBrain;
