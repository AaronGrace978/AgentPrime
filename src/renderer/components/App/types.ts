/**
 * App Types - Shared type definitions
 */

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
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  ruleId: string;
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
  icon: string;
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

