import { semanticContextBuilder } from './contextBuilder';

export interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface AgentResponse {
  tool_calls?: ToolCall[];
  done?: boolean;
  message?: string;
  error?: string;
  // Planning support
  plan?: string[];
  current_step?: number;
}

export const toolSchemas = [
  {
    name: 'list_files',
    description: 'List files and directories in a given path. Use "." for the workspace root.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root (use "." for root)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file. Always read files before modifying them to understand the existing code.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root (e.g., "src/app.js", "index.html")'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write or create a file. Parent directories are created automatically. For HTML/CSS/JS websites: ensure all CSS classes used in HTML are defined in CSS, all JS selectors match HTML elements, and all buttons have event handlers.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root (e.g., "index.html", "styles.css", "src/components/Button.tsx")'
        },
        content: {
          type: 'string',
          description: 'Complete file content - write the FULL file, not partial content'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'apply_diff',
    description: 'Apply a unified diff patch to an existing file. Use for small targeted changes. For larger changes, use write_file with the complete new content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root'
        },
        diff: {
          type: 'string',
          description: 'Unified diff format patch (starts with --- and +++)'
        }
      },
      required: ['path', 'diff']
    }
  },
  {
    name: 'run_command',
    description: 'Run a terminal command in the workspace. Use for: npm install/start, python scripts, git commands, build tools. Commands run with shell enabled.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to run (e.g., "npm install", "npm start", "python main.py", "git status")'
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to workspace root (defaults to workspace root)'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds (defaults to 60, max 300)'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'search_codebase',
    description: 'Search for text patterns across all files in the codebase using ripgrep. Useful for finding usages, imports, or specific code patterns.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - supports regex (e.g., "function.*Handler", "import.*React")'
        },
        include_pattern: {
          type: 'string',
          description: 'Glob pattern for files to include (e.g., "*.ts", "*.{js,jsx}", "src/**/*.py")'
        },
        exclude_pattern: {
          type: 'string',
          description: 'Glob pattern for files to exclude (e.g., "node_modules", "*.test.ts")'
        },
        max_results: {
          type: 'number',
          description: 'Maximum results to return (default: 20, max: 100)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'create_directory',
    description: 'Create a new directory. Useful for organizing project structure before creating files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root (e.g., "src/components", "lib/utils")'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'str_replace',
    description: 'Make a surgical edit to a file by replacing specific text. PREFERRED over write_file for edits! The old_string must match EXACTLY (including whitespace). Much safer than rewriting entire files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root'
        },
        old_string: {
          type: 'string',
          description: 'The exact text to find and replace (must be unique in the file, include enough context)'
        },
        new_string: {
          type: 'string',
          description: 'The text to replace it with'
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace all occurrences. Default is false (replace first match only).'
        }
      },
      required: ['path', 'old_string', 'new_string']
    }
  }
];

export function validateToolCall(call: any): call is ToolCall {
  if (!call || typeof call !== 'object') return false;
  if (!call.name || typeof call.name !== 'string') return false;
  if (!call.parameters || typeof call.parameters !== 'object') return false;

  const schema = toolSchemas.find(s => s.name === call.name);
  if (!schema) return false;

  // Basic validation - could be enhanced with JSON schema validation
  const required = schema.parameters.required || [];
  return required.every((prop: string) => prop in call.parameters);
}
