/**
 * AgentPrime - Completion Types
 * TypeScript interfaces for ghost text completions
 */

import type { IRange } from 'monaco-editor';

export interface CompletionRequest {
  beforeCursor: string;
  afterCursor: string;
  lineNumber: number;
  column: number;
  language: string;
  filePath: string;
  context?: {
    recentEdits: string[];
    visibleRange: IRange;
    imports: string[];
  };
}

export interface CompletionResponse {
  completion: string;
  confidence: number;
  model: string;
  latency: number;
}

export interface GhostCompletion {
  id: string;
  text: string;
  range: IRange;
  decorationIds: string[];
  timestamp: number;
}

export interface CompletionContext {
  filePath?: string;
  language?: string;
  beforeCursor: string;
  afterCursor?: string;
  lineNumber?: number;
}

export interface CompletionResult {
  completion: string;
  fromCache: boolean;
  latency: number;
  model: string;
}

export interface CompletionAnalytics {
  duration: number;
  length: number;
  language: string;
  model: string;
  latency: number;
  confidence: number;
  completionLength: number;
}
