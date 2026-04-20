/**
 * Prompt Builder for AgentPrime
 * Builds context-aware prompts for the AI agent
 * Enhanced for better webpage building and "vibe coding" experience
 */

import type { AgentRunContextPayload } from '../../types/agent-ide-context';

export interface PromptContext {
  workspacePath?: string;
  openTabs?: Array<{
    path: string;
    language?: string;
    isDirty?: boolean;
  }>;
  folderTree?: any;
  activeFile?: {
    path: string;
    content?: string;
    cursorLine?: number;
    cursorColumn?: number;
    selectedText?: string;
  };
  focusedFolder?: string;
}

// Detect project type from file structure
function detectProjectType(folderTree: any): { type: string; framework?: string; files: string[] } {
  const files: string[] = [];
  
  function collectFiles(tree: any, prefix: string = '') {
    if (!tree) return;
    if (Array.isArray(tree)) {
      for (const item of tree) {
        if (item.is_dir && item.children) {
          collectFiles(item.children, `${prefix}${item.name}/`);
        } else if (!item.is_dir) {
          files.push(`${prefix}${item.name}`);
        }
      }
    }
  }
  collectFiles(folderTree?.tree || folderTree);
  
  // Check for project indicators
  const hasPackageJson = files.includes('package.json');
  const hasIndexHtml = files.includes('index.html');
  const hasTsConfig = files.includes('tsconfig.json');
  const hasReact = files.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
  const hasVue = files.some(f => f.endsWith('.vue'));
  const hasSvelte = files.some(f => f.endsWith('.svelte'));
  const hasPython = files.some(f => f.endsWith('.py'));
  const hasRequirementsTxt = files.includes('requirements.txt');
  const hasPyProject = files.includes('pyproject.toml');
  
  if (hasReact && hasPackageJson) {
    return { type: 'react', framework: hasTsConfig ? 'React + TypeScript' : 'React', files };
  }
  if (hasVue && hasPackageJson) {
    return { type: 'vue', framework: 'Vue.js', files };
  }
  if (hasSvelte && hasPackageJson) {
    return { type: 'svelte', framework: 'Svelte', files };
  }
  if (hasIndexHtml && !hasPackageJson) {
    return { type: 'static-html', framework: 'Static HTML/CSS/JS', files };
  }
  if (hasPackageJson) {
    return { type: 'node', framework: 'Node.js', files };
  }
  if (hasPython && (hasRequirementsTxt || hasPyProject)) {
    return { type: 'python', framework: 'Python', files };
  }
  if (hasPython) {
    return { type: 'python-script', framework: 'Python Script', files };
  }
  
  return { type: 'unknown', files };
}

// Build the system prompt for agent mode
function buildSystemPrompt(context: PromptContext): string {
  const projectInfo = context.folderTree ? detectProjectType(context.folderTree) : { type: 'unknown', files: [] };
  
  let systemPrompt = `You are AgentPrime, an assistant that can EXECUTE ACTIONS in the user's workspace.

## YOUR CAPABILITIES
You can create, read, modify files, organize folders, and run commands. You work autonomously to complete tasks.

## INTENT DISCIPLINE — READ THIS FIRST
Classify the request BEFORE picking any tool. Match output to the ask.

- **file-chore** ("organize", "move", "rename", "sort", "tidy", "put X in a folder", "clean up files"):
  Use ONLY list_files, create_directory, run_command (for mv/move/rename). DO NOT write code. DO NOT create package.json, README.md, index.html, src/, or any project scaffold. A folder of videos/photos/docs is NOT a software project.
- **plan-only** ("analyze", "architect", "compare", "strategy"): return a plan via {"done": true, "message": "..."}. No files.
- **review-only** ("review", "audit", "inspect"): return findings via {"done": true, "message": "..."}. No implementation unless asked.
- **repair-only** ("fix", "debug", "repair"): smallest viable fix to the real failure. Read before editing.
- **build-now** ("build", "implement", "create <code thing>", "make a <app/component>", "vibe code"): implement directly, tightly scoped.

Hard rules:
- NEVER scaffold a project unless the user clearly asked for a coding project.
- Solve exactly what was asked. No unrequested extras.
- If intent is ambiguous, ask ONE clarifying question via {"done": true, "message": "Quick check: ..."} instead of guessing.

## AVAILABLE TOOLS
Respond with JSON containing tool_calls to execute actions:

1. **list_files** - List directory contents
   {"tool_calls": [{"name": "list_files", "parameters": {"path": "."}}]}

2. **read_file** - Read a file (ALWAYS read before modifying)
   {"tool_calls": [{"name": "read_file", "parameters": {"path": "src/app.js"}}]}

3. **write_file** - Create or update a file (writes COMPLETE content)
   {"tool_calls": [{"name": "write_file", "parameters": {"path": "index.html", "content": "<!DOCTYPE html>..."}}]}

4. **run_command** - Run shell commands
   {"tool_calls": [{"name": "run_command", "parameters": {"command": "npm install"}}]}

5. **search_codebase** - Search for code patterns
   {"tool_calls": [{"name": "search_codebase", "parameters": {"query": "useState"}}]}

6. **create_directory** - Create a new folder
   {"tool_calls": [{"name": "create_directory", "parameters": {"path": "src/components"}}]}

## RESPONSE FORMAT
Always respond with valid JSON:

**To use tools:**
{"tool_calls": [{"name": "TOOL_NAME", "parameters": {...}}]}

**To complete the task:**
{"done": true, "message": "Description of what was done"}

**With planning:**
{"plan": ["Step 1", "Step 2"], "current_step": 0, "tool_calls": [{"name": "write_file", "parameters": {...}}]}

## CRITICAL RULES FOR WEB DEVELOPMENT
⚠️ THIS SECTION APPLIES ONLY IF the user asked for a web/HTML/CSS/JS project. SKIP entirely for file-chores, plan-only, review-only, or non-web work.

### HTML/CSS/JS Coherence
1. **Every CSS class used in HTML MUST be defined in CSS** - No orphan classes
2. **Every JS selector (querySelector, getElementById) MUST match HTML** - Test your selectors
3. **Every button needs a working click handler** - Either onclick="" or addEventListener
4. **Forms need submit handlers** - form.addEventListener('submit', handler)
5. **Write COMPLETE files** - No "// TODO", no "...", no placeholders

### Quality Standards
- Create production-ready code, not sketches
- Every feature must WORK, not just exist
- Test mentally: "If I click this button, what happens?"
- Include proper error handling
- Make it look GOOD - use modern CSS

## WORKFLOW (Like Cursor - Explore First!)
1. **EXPLORE** - List files, read existing code, search for patterns BEFORE making changes
2. **UNDERSTAND** - Analyze what exists, identify dependencies and relationships
3. **PLAN** - Break complex tasks into clear steps with {"plan": [...]}
4. **EXECUTE** - Create/modify files one at a time, writing COMPLETE content
5. **VERIFY** - After writing, check if selectors match, classes are defined, handlers exist
6. **COMPLETE** - Mark done ONLY when everything works

### Exploration Tips
- Use list_files(".") first to see project structure
- Read existing files before modifying them
- Search for patterns like "useState" or class names to find related code
- If fixing a bug, find WHERE the bug is first before writing fixes`;

  // Add project-specific guidance
  if (projectInfo.type !== 'unknown') {
    systemPrompt += `\n\n## PROJECT CONTEXT
Detected project type: **${projectInfo.framework || projectInfo.type}**
Files in workspace: ${projectInfo.files.slice(0, 10).join(', ')}${projectInfo.files.length > 10 ? '...' : ''}`;
    
    if (projectInfo.type === 'static-html') {
      systemPrompt += `\n
### Static HTML Project Guidelines
- Main entry: index.html
- Link CSS with <link rel="stylesheet" href="styles.css">
- Link JS with <script src="script.js"></script> (at end of body)
- Test by opening index.html in a browser`;
    } else if (projectInfo.type === 'react') {
      systemPrompt += `\n
### React Project Guidelines
- Components go in src/components/
- Use functional components with hooks
- Run with: npm start
- Build with: npm run build`;
    } else if (projectInfo.type === 'node') {
      systemPrompt += `\n
### Node.js Project Guidelines
- Check package.json for scripts
- Install deps: npm install
- Start: npm start or check scripts`;
    } else if (projectInfo.type === 'python') {
      systemPrompt += `\n
### Python Project Guidelines
- Create virtualenv if needed
- Install: pip install -r requirements.txt
- Run: python main.py or check pyproject.toml`;
    }
  }

  return systemPrompt;
}

export class PromptBuilder {
  private context: PromptContext = {};

  setContext(context: PromptContext): void {
    this.context = { ...this.context, ...context };
  }

  getContext(): PromptContext {
    return { ...this.context };
  }

  /**
   * Get the system prompt for agent mode
   */
  getSystemPrompt(): string {
    return buildSystemPrompt(this.context);
  }

  buildPrompt(userMessage: string): string {
    const parts: string[] = [];
    
    // Add system prompt
    parts.push(buildSystemPrompt(this.context));
    parts.push('\n---\n');
    
    // Add workspace context
    if (this.context.workspacePath) {
      parts.push(`## CURRENT WORKSPACE\nPath: ${this.context.workspacePath}`);
    }

    // Add focused folder context if available
    if (this.context.focusedFolder) {
      parts.push(`\nFocused folder: ${this.context.focusedFolder} (user wants you to work in this folder)`);
    }

    // Add open tabs context
    if (this.context.openTabs && this.context.openTabs.length > 0) {
      const tabs = this.context.openTabs.map(t => {
        let info = t.path;
        if (t.isDirty) info += ' (modified)';
        return info;
      }).join('\n  - ');
      parts.push(`\nOpen files:\n  - ${tabs}`);
    }

    // Add active file context with content preview
    if (this.context.activeFile) {
      const file = this.context.activeFile;
      parts.push(`\n## CURRENT FILE: ${file.path}`);
      
      if (file.cursorLine) {
        parts.push(`Cursor at line ${file.cursorLine}, column ${file.cursorColumn || 1}`);
      }
      
      if (file.selectedText) {
        parts.push(`\nSelected text:\n\`\`\`\n${file.selectedText}\n\`\`\``);
      }
      
      if (file.content) {
        const lines = file.content.split('\n');
        const preview = lines.length > 100 
          ? `${lines.slice(0, 50).join('\n')}\n... (${lines.length - 100} lines omitted) ...\n${lines.slice(-50).join('\n')}`
          : file.content;
        parts.push(`\nFile content:\n\`\`\`\n${preview}\n\`\`\``);
      }
    }

    // Add user message
    parts.push(`\n---\n## USER REQUEST\n${userMessage}`);
    parts.push('\n\nRespond with JSON only. Either call tools or mark as done.');

    return parts.join('\n');
  }

  clearContext(): void {
    this.context = {};
  }
  
  /**
   * Set the focused folder for context
   */
  setFocusedFolder(folderPath: string | null): void {
    this.context.focusedFolder = folderPath || undefined;
  }
}

/**
 * Serialized IDE snapshot for `chat` IPC `agent_run_context` (validated in main).
 */
export function buildAgentRunContextPayload(builder: PromptBuilder): AgentRunContextPayload {
  const ctx = builder.getContext();
  return {
    workspace_path_relay: ctx.workspacePath,
    open_tabs: ctx.openTabs?.map((t) => ({
      path: t.path,
      language: t.language,
      is_dirty: t.isDirty,
    })),
    active_file: ctx.activeFile
      ? {
          path: ctx.activeFile.path,
          content: ctx.activeFile.content,
          cursor_line: ctx.activeFile.cursorLine,
          cursor_column: ctx.activeFile.cursorColumn,
          selected_text: ctx.activeFile.selectedText,
        }
      : undefined,
    folder_tree: ctx.folderTree,
  };
}

// Singleton instance
export const promptBuilder = new PromptBuilder();

