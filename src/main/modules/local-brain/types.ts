/**
 * LocalBrain Types
 * Fast local inference for intent classification and simple responses
 */

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

export type IntentCategory = 
  | 'system_control'      // volume, mute, lock, brightness
  | 'app_launch'          // open apps, launch games
  | 'web_navigation'      // open websites by name (linkedin, youtube, etc.)
  | 'file_operation'      // organize, create, move files
  | 'calendar'            // calendar events, schedule
  | 'email'               // send/read emails
  | 'reminder'            // reminders, alarms
  | 'time_date'           // current time/date
  | 'web_search'          // questions needing web search
  | 'automation'          // click, type, scroll
  | 'media'               // spotify, music, video
  | 'smart_home'          // lights, thermostat
  | 'conversation'        // casual chat, questions
  | 'complex_task'        // multi-step, needs planning
  | 'unknown';

export interface ClassifiedIntent {
  category: IntentCategory;
  confidence: number;
  action?: string;           // Specific action if detected
  params?: Record<string, any>;
  routing: 'fastpath' | 'local' | 'cloud';
  reasoning?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL BRAIN CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export interface LocalBrainConfig {
  // Model settings
  model: string;                    // e.g., 'phi3', 'llama3.2', 'qwen2.5:1.5b'
  fallbackModel?: string;           // Backup if primary not available
  
  // Thresholds
  confidenceThreshold: number;      // Min confidence to use local (default: 0.7)
  complexityThreshold: number;      // Max complexity for local handling
  
  // Performance
  maxTokens: number;                // Max response tokens (keep low for speed)
  timeout: number;                  // Request timeout in ms
  
  // Features
  enableCache: boolean;             // Cache common responses
  cacheSize: number;                // Max cache entries
  cacheTTL: number;                 // Cache TTL in ms
}

export const DEFAULT_CONFIG: LocalBrainConfig = {
  model: 'phi3',                    // Fast, small, good at classification
  fallbackModel: 'llama3.2',
  confidenceThreshold: 0.7,
  complexityThreshold: 0.6,
  maxTokens: 150,                   // Keep responses short for speed
  timeout: 5000,                    // 5 second timeout
  enableCache: true,
  cacheSize: 100,
  cacheTTL: 300000                  // 5 minutes
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE CACHE
// ═══════════════════════════════════════════════════════════════════════════════

export interface CachedResponse {
  input: string;
  output: ClassifiedIntent;
  timestamp: number;
  hits: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL BRAIN STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export interface LocalBrainStatus {
  available: boolean;
  model: string | null;
  ollamaRunning: boolean;
  modelLoaded: boolean;
  cacheSize: number;
  averageLatency: number;
  totalRequests: number;
  localHandled: number;
  cloudRouted: number;
}
