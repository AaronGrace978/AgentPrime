/**
 * IDE snapshot sent from renderer → main for a single agent run.
 * Kept separate from Electron IPC schema (snake_case) for use in AgentContext.
 */

export interface IdeOpenTab {
  path: string;
  language?: string;
  isDirty?: boolean;
}

export interface IdeActiveFile {
  path: string;
  content?: string;
  cursorLine?: number;
  cursorColumn?: number;
  selectedText?: string;
}

export interface IdeContextSnapshot {
  /** Optional cross-check against main workspace path (UI relay). */
  workspacePathRelay?: string;
  openTabs?: IdeOpenTab[];
  activeFile?: IdeActiveFile;
  /** Raw tree payload from readTree (shape varies); formatted with a size cap on main. */
  folderTree?: unknown;
  focusedFolder?: string;
}

/**
 * Snake_case nested payload under chat IPC `agent_run_context` (renderer → main).
 * Validated in `chat-ipc-context.ts`.
 */
export interface AgentRunContextPayload {
  workspace_path_relay?: string;
  open_tabs?: Array<{
    path: string;
    language?: string;
    is_dirty?: boolean;
  }>;
  active_file?: {
    path: string;
    content?: string;
    cursor_line?: number;
    cursor_column?: number;
    selected_text?: string;
  };
  folder_tree?: unknown;
}
