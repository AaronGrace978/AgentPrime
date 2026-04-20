/**
 * Formats IDE snapshot for model-visible context (system prompt or user-task suffix).
 */

import type { IdeContextSnapshot } from '../../types/agent-ide-context';

const MAX_FOLDER_TREE_CHARS = 120_000;
const MAX_SELECTION_CHARS = 8_000;
const MAX_BUFFER_PREVIEW_CHARS = 24_000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… (truncated)`;
}

export function formatIdeContextForModel(snapshot: IdeContextSnapshot | undefined): string {
  if (!snapshot) return '';
  const parts: string[] = [];

  if (snapshot.workspacePathRelay) {
    parts.push(`Workspace (from UI): ${snapshot.workspacePathRelay}`);
  }
  if (snapshot.focusedFolder) {
    parts.push(`Focused folder: ${snapshot.focusedFolder}`);
  }
  if (snapshot.openTabs?.length) {
    parts.push('Open tabs:');
    for (const t of snapshot.openTabs) {
      const dirty = t.isDirty ? ' (modified)' : '';
      const lang = t.language ? ` [${t.language}]` : '';
      parts.push(`  - ${t.path}${dirty}${lang}`);
    }
  }
  if (snapshot.activeFile) {
    const af = snapshot.activeFile;
    parts.push(`Active file: ${af.path}`);
    if (af.cursorLine != null) {
      parts.push(`Cursor: L${af.cursorLine}:${af.cursorColumn ?? 1}`);
    }
    if (af.selectedText?.trim()) {
      parts.push('Selection:', '```', truncate(af.selectedText, MAX_SELECTION_CHARS), '```');
    }
    if (af.content?.length) {
      parts.push('Buffer preview:', '```', truncate(af.content, MAX_BUFFER_PREVIEW_CHARS), '```');
    }
  }
  if (snapshot.folderTree != null) {
    try {
      let s = JSON.stringify(snapshot.folderTree);
      if (s.length > MAX_FOLDER_TREE_CHARS) {
        s = `${s.slice(0, MAX_FOLDER_TREE_CHARS)}\n… (truncated)`;
      }
      parts.push('Folder tree (JSON):', s);
    } catch {
      parts.push('Folder tree: (unserializable — omitted)');
    }
  }

  return parts.join('\n');
}

/** Appends IDE block to a user task string for specialist runs (after repair/retry text is built). */
export function appendIdeContextToUserTask(
  userTask: string,
  snapshot: IdeContextSnapshot | undefined
): string {
  const block = formatIdeContextForModel(snapshot);
  if (!block.trim()) return userTask;
  return `${userTask}\n\n## IDE_CONTEXT (from UI)\n${block}`;
}
