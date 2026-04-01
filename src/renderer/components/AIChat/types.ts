/**
 * AIChat Types - Shared type definitions for the chat component
 */

import type { AgentReviewChange, AgentReviewVerificationState } from '../../../types/agent-review';
import type { RuntimeBudgetMode } from '../../../types/runtime-budget';

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string | null;
  content?: string;
}

export interface OpenFile {
  file: FileItem;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'system' | 'action' | 'result' | 'chat';
}

export type AgentFileChange = AgentReviewChange;

export interface AIChatProps {
  /** When false, the chat stays mounted but is hidden (preserves in-flight agent state when the sidebar is collapsed). */
  isVisible?: boolean;
  onClose: () => void;
  openFiles?: OpenFile[];
  activeFileIndex?: number;
  getSelectedText?: () => string | undefined;
  getCursorPosition?: () => { lineNumber: number; column: number } | undefined;
  onOpenFolder?: () => void;
  onOpenTemplates?: () => void;
  onApplyCode?: (code: string, filePath?: string) => void;
  onAgentChangesReady?: (
    changes: AgentFileChange[],
    taskDescription: string,
    reviewSessionId?: string,
    verification?: AgentReviewVerificationState
  ) => void;
}

// Chat interaction mode
export type ChatMode = 'agent' | 'chat' | 'dino';

// Runtime budget selector type
export type DualMode = RuntimeBudgetMode;

export interface DualModelState {
  enabled: boolean;
  mode: DualMode;
  currentModel: string;
  currentProvider: string;
  lastComplexity: number;
  lastReasoning: string;
}

export interface BrainConfig {
  fastModel: { provider: string; model: string; enabled: boolean };
  deepModel: { provider: string; model: string; enabled: boolean };
}

export interface PythonBrainStatus {
  connected: boolean;
  memories: number;
  patterns: number;
  lastCheck: Date | null;
}

export interface ModelOption {
  value: string;
  label: string;
}

