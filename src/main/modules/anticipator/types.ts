/**
 * Anticipator Types
 * Pattern learning and predictive actions
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActionPattern {
  id: string;
  trigger: PatternTrigger;
  actions: string[];              // Actions that typically follow
  params?: Record<string, any>;   // Common params
  confidence: number;             // 0-1 how confident we are
  occurrences: number;            // Times this pattern occurred
  lastSeen: number;               // Timestamp
  context?: PatternContext;       // When this pattern applies
}

export interface PatternTrigger {
  type: 'action' | 'time' | 'sequence' | 'context';
  value: string | string[];       // Action name, time pattern, or sequence
}

export interface PatternContext {
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek?: number[];           // 0-6 (Sunday-Saturday)
  afterAction?: string;           // Following a specific action
  appActive?: string;             // When specific app is active
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Prediction {
  action: string;
  params?: Record<string, any>;
  confidence: number;
  reasoning: string;
  pattern?: ActionPattern;
  expiresAt: number;              // When this prediction becomes stale
}

export interface PredictionSet {
  predictions: Prediction[];
  timestamp: number;
  context: {
    timeOfDay: string;
    lastAction?: string;
    activeApp?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActionHistory {
  action: string;
  params: Record<string, any>;
  timestamp: number;
  success: boolean;
  duration?: number;
}

export interface SequenceMatch {
  pattern: ActionPattern;
  matchScore: number;
  predictedNext: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnticipatorConfig {
  enabled: boolean;
  historySize: number;            // Max history entries to keep
  minOccurrences: number;         // Min times before pattern is trusted
  minConfidence: number;          // Min confidence for predictions
  maxPredictions: number;         // Max predictions to show
  learningRate: number;           // How fast patterns update (0-1)
  decayRate: number;              // How fast old patterns fade (0-1)
  predictionTTL: number;          // How long predictions stay valid (ms)
  persistPatterns: boolean;       // Save patterns to disk
  patternsFile: string;           // Where to save patterns
}

export const DEFAULT_ANTICIPATOR_CONFIG: AnticipatorConfig = {
  enabled: true,
  historySize: 500,
  minOccurrences: 3,
  minConfidence: 0.6,
  maxPredictions: 3,
  learningRate: 0.2,
  decayRate: 0.05,
  predictionTTL: 300000,          // 5 minutes
  persistPatterns: true,
  patternsFile: 'anticipator-patterns.json'
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIME HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function getDayOfWeek(): number {
  return new Date().getDay();
}
