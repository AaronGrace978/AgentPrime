# AgentPrime IPC API Documentation

This document describes all IPC (Inter-Process Communication) channels available in AgentPrime.

## Overview

AgentPrime uses Electron's IPC system to communicate between the main process and renderer process. All APIs are exposed through `window.agentAPI` in the renderer.

---

## File Operations

### `openFolder()`
Opens a folder selection dialog.

**Returns:** `{ success: boolean, path?: string }`

### `getWorkspace()`
Gets the current workspace path.

**Returns:** `string | null`

### `readTree(path?)`
Reads the directory tree structure.

**Parameters:**
- `path` (optional): Directory path to read

**Returns:** `{ tree: Array, root: string, error?: string }`

### `readFile(filePath)`
Reads a file's contents.

**Parameters:**
- `filePath`: Relative path to the file

**Returns:** `{ path, content, language, size, lines, error? }`

### `writeFile(filePath, content)`
Writes content to a file.

**Parameters:**
- `filePath`: Relative path to the file
- `content`: File content to write

**Returns:** `{ success: boolean, error?: string }`

### `saveFileDialog(defaultPath?, suggestedExtension?)`
Opens a "Save As" dialog.

**Returns:** `{ success: boolean, path?: string }`

### `createItem(path, isDir)`
Creates a new file or directory.

**Parameters:**
- `path`: Path for the new item
- `isDir`: Boolean, true for directory

**Returns:** `{ success: boolean, error?: string }`

### `deleteItem(path)`
Deletes a file or directory.

**Returns:** `{ success: boolean, error?: string }`

---

## AI Chat

### `chat(message, context)`
Sends a message to the AI.

**Parameters:**
- `message`: User message
- `context`: Current file context

**Returns:** `{ success: boolean, content?: string, error?: string }`

### `quickAction(action, code, language)`
Performs a quick AI action on code.

**Parameters:**
- `action`: Action type ('explain', 'fix', 'optimize', etc.)
- `code`: Code to process
- `language`: Programming language

**Returns:** `{ success: boolean, content?: string }`

### `aiStatus()`
Gets the current AI provider status.

**Returns:** `{ provider, model, status }`

### `clearHistory()`
Clears conversation history.

### `inlineCompletion(context)`
Gets inline code completion.

**Parameters:**
- `context`: Code context for completion

**Returns:** `{ success: boolean, completion?: string }`

---

## Agent Mode (Autonomous)

### `agentMode(task, autoApprove?)`
Starts autonomous agent mode.

**Parameters:**
- `task`: Task description
- `autoApprove`: Auto-approve all actions (default: false)

### `agentApproveAction(actionId)`
Approves a pending agent action.

### `agentRejectAction(actionId)`
Rejects a pending agent action.

### `agentApproveAll()`
Approves all pending actions.

### `agentRejectAll()`
Rejects all pending actions.

### `agentRollback(actionId)`
Rolls back a specific action.

### `agentRollbackAll()`
Rolls back all executed actions.

### `agentGetState()`
Gets current agent state.

### `agentGetDiff(actionId)`
Gets the diff for an action.

---

## Git Integration

### `gitStatus()`
Gets git repository status.

**Returns:** `{ success, branch, staged, modified, untracked }`

### `gitCommit(message)`
Commits staged changes.

**Parameters:**
- `message`: Commit message

### `gitCommand(command)`
Executes a git command.

**Parameters:**
- `command`: Git command (without 'git' prefix)

---

## Terminal

### `runCommand(command)`
Runs a terminal command.

**Parameters:**
- `command`: Command to execute

**Returns:** `{ success, output?, error? }`

---

## Search

### `globalSearch(query, options)`
Searches across all files.

**Parameters:**
- `query`: Search query
- `options`: { matchCase, useRegex, wholeWord }

**Returns:** `{ success, results: Array }`

---

## Settings

### `getSettings()`
Gets all settings.

### `updateSettings(settings)`
Updates settings.

---

## AI Providers

### `getProviders()`
Gets all available AI providers.

### `getProviderModels(providerName)`
Gets models for a provider.

### `testProvider(providerName)`
Tests provider connection.

### `setActiveProvider(providerName, model)`
Sets the active AI provider.

### `configureProvider(providerName, config)`
Configures a provider (API key, etc).

---

## Templates

### `getTemplates()`
Gets all project templates.

### `getTemplate(templateId)`
Gets a specific template.

### `createFromTemplate(templateId, targetDir, variables)`
Creates a project from template.

### `selectDirectory()`
Opens directory selection dialog.

---

## Codebase Indexer

### `indexWorkspace()`
Indexes the current workspace.

### `getIndexStats()`
Gets indexing statistics.

### `searchSymbols(query, limit?)`
Searches for code symbols.

### `searchFiles(query, limit?)`
Searches for files.

### `getFileSymbols(filePath)`
Gets symbols in a file.

### `getRelatedFiles(filePath, depth?)`
Gets related files.

### `getAIContext(filePath)`
Gets AI context for a file.

### `updateFileIndex(filePath)`
Updates index for a file.

### `getMentionSuggestions(query, type)`
Gets @mention suggestions.

---

## Mirror Intelligence System

### `mirrorGetStatus()`
Gets Mirror system status.

### `mirrorToggleLearning(enabled)`
Enables/disables learning mode.

### `mirrorGetMetrics()`
Gets intelligence metrics.

### `mirrorGetPatterns(category?, limit?)`
Gets learned patterns.

### `mirrorIngestUrl(url, options?)`
Ingests content from URL.

### `mirrorIngestContent(content, metadata)`
Ingests raw content.

### `mirrorGetIngestionHistory(limit?)`
Gets ingestion history.

---

## Event Listeners

### `onChatStream(callback)`
Listens for streaming chat responses.

### `onChatActionResult(callback)`
Listens for action results.

### `onAgentEvent(callback)`
Listens for agent mode events.


---

## Cleanup Functions

### `removeChatStream()`
Removes chat stream listener.

### `removeChatActionResult()`
Removes action result listener.

### `removeAgentEvent()`
Removes agent event listener.

