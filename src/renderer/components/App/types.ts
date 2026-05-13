/**
 * App Types - Shared type definitions
 */

import type { ReactNode } from 'react';

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

export interface CodeIssue {
  id?: string;
  filePath?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning';
  ruleId: string;
  source?: string;
  origin?: 'language' | 'terminal' | 'verification' | 'task' | 'eslint' | 'agentprime';
}

export interface RunOutput {
  type: string;
  text: string;
}

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

export interface Command {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  category: 'file' | 'ai' | 'view' | 'git' | 'settings' | 'navigation';
  shortcut?: string;
  action: () => void;
}

export interface FileInfo {
  name: string;
  path: string;
  language: string;
  lines: number;
}

