/**
 * Maps validated chat IPC context → AgentLoop IdeContextSnapshot and file path helpers.
 */

import type { ChatIpcContext } from '../security/chat-ipc-context';
import type { IdeActiveFile, IdeContextSnapshot, IdeOpenTab } from '../../types/agent-ide-context';

export function buildIdeContextSnapshotFromChatIpc(ctx: ChatIpcContext): IdeContextSnapshot | undefined {
  const arc = ctx.agent_run_context;
  const focusedFolder = ctx.focused_folder;

  const openTabsFromPayload: IdeOpenTab[] | undefined = arc?.open_tabs?.length
    ? arc.open_tabs.map((t) => ({
        path: t.path,
        language: t.language,
        isDirty: t.is_dirty,
      }))
    : undefined;

  const openTabsFromLegacy: IdeOpenTab[] | undefined =
    !openTabsFromPayload?.length && ctx.open_files?.length
      ? ctx.open_files.map((p) => ({ path: p }))
      : undefined;

  const openTabs = openTabsFromPayload?.length ? openTabsFromPayload : openTabsFromLegacy;

  let activeFile: IdeActiveFile | undefined;
  if (arc?.active_file) {
    activeFile = {
      path: arc.active_file.path,
      content: arc.active_file.content,
      cursorLine: arc.active_file.cursor_line,
      cursorColumn: arc.active_file.cursor_column,
      selectedText: arc.active_file.selected_text,
    };
  } else if (ctx.file_path) {
    activeFile = {
      path: ctx.file_path,
      content: ctx.file_content,
    };
  }

  const folderTree = arc?.folder_tree;

  if (
    !arc?.workspace_path_relay &&
    !openTabs?.length &&
    !activeFile &&
    folderTree == null &&
    !focusedFolder
  ) {
    return undefined;
  }

  return {
    workspacePathRelay: arc?.workspace_path_relay,
    openTabs,
    activeFile,
    folderTree,
    focusedFolder,
  };
}

export function resolveOpenFilesForAgent(ctx: ChatIpcContext): string[] {
  if (ctx.open_files?.length) {
    return ctx.open_files;
  }
  const tabs = ctx.agent_run_context?.open_tabs;
  if (tabs?.length) {
    return tabs.map((t) => t.path);
  }
  return [];
}

export function resolveCurrentFileForAgent(
  ctx: ChatIpcContext,
  getCurrentFile: () => string | null
): string | undefined {
  return (
    ctx.file_path ||
    ctx.agent_run_context?.active_file?.path ||
    getCurrentFile() ||
    undefined
  );
}
