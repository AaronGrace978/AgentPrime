/**
 * Tool Registry - Manages all available agent tools
 */

import { BaseTool } from './base-tool';

interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

export class ToolRegistry {
  private workspacePath: string;
  private aiRouter: any;
  private tools: Map<string, BaseTool>;

  constructor(workspacePath: string, aiRouter: any) {
    this.workspacePath = workspacePath;
    this.aiRouter = aiRouter;
    this.tools = new Map();

    // Note: Tool implementations would be registered here
    // this.registerAllTools();
  }

  /**
   * Register a tool instance
   */
  registerTool(toolInstance: BaseTool): void {
    this.tools.set(toolInstance.name, toolInstance);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool by name with arguments
   */
  async executeTool(toolName: string, args: Record<string, any>): Promise<any> {
    const tool = this.getTool(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    tool.validateParameters(args);
    return await tool.execute(args);
  }

  /**
   * Get all available tools metadata
   */
  getAllToolsMetadata(): Record<string, ReturnType<BaseTool['getMetadata']>> {
    const metadata: Record<string, ReturnType<BaseTool['getMetadata']>> = {};
    for (const tool of this.tools.values()) {
      metadata[tool.name] = tool.getMetadata();
    }
    return metadata;
  }

  /**
   * Get tool descriptions formatted for LLM
   */
  getToolDescriptions(): string {
    const descriptions: string[] = [];
    for (const tool of this.tools.values()) {
      descriptions.push(this.formatToolDescription(tool));
    }
    return descriptions.join('\n\n');
  }

  /**
   * Format tool description for LLM consumption
   */
  formatToolDescription(tool: BaseTool): string {
    const metadata = tool.getMetadata();
    let desc = `${metadata.name}: ${metadata.description}\nParameters:`;

    if (Object.keys(metadata.parameters).length === 0) {
      desc += ' (none)';
    } else {
      for (const [paramName, paramSpec] of Object.entries(metadata.parameters)) {
        desc += `\n  - ${paramName}${paramSpec.required ? ' (required)' : ' (optional)'}: ${paramSpec.description || ''}`;
      }
    }

    return desc;
  }

  /**
   * Parse tool calls from LLM response
   */
  parseToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Try to find JSON tool calls in the response
    const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.actions) {
          return parsed.actions;
        } else if (parsed.tool) {
          return [parsed];
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    // Try to find multiple JSON objects (array of actions)
    const jsonArrayMatch = response.match(/\[[\s\S]*\{[\s\S]*"tool"[\s\S]*\}[\s\S]*\]/);
    if (jsonArrayMatch) {
      try {
        const parsed = JSON.parse(jsonArrayMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        // Not valid JSON array, continue
      }
    }

    // Try to parse natural language tool calls
    const patterns = [
      { regex: /read_file\(['"](.+?)['"]\)/, tool: 'read_file', params: ['filePath'] },
      { regex: /write_file\(['"](.+?)['"],\s*['"](.+?)['"]\)/s, tool: 'write_file', params: ['filePath', 'content'] },
      { regex: /list_directory\(['"](.+?)['"]\)/, tool: 'list_directory', params: ['dirPath'] },
      { regex: /search_codebase\(['"](.+?)['"]\)/, tool: 'search_codebase', params: ['query'] },
      { regex: /run_terminal\(['"](.+?)['"]\)/, tool: 'run_terminal', params: ['command'] },
      { regex: /git_operations\(['"](.+?)['"],?\s*['"]?(.+?)['"]?\)/, tool: 'git_operations', params: ['operation', 'args'] }
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern.regex);
      if (match) {
        const args: Record<string, any> = {};
        pattern.params.forEach((param, index) => {
          args[param] = match[index + 1];
        });
        toolCalls.push({ tool: pattern.tool, args });
      }
    }

    return toolCalls;
  }
}
