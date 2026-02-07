/**
 * Base Tool Class - Abstract base for all agent tools
 */

export interface ToolParameter {
  type: string;
  required?: boolean;
  description?: string;
}

export interface ToolMetadata {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

export abstract class BaseTool {
  public name: string;
  public description: string;
  public parameters: Record<string, ToolParameter>;

  constructor(name: string, description: string, parameters: Record<string, ToolParameter> = {}) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  /**
   * Validate tool parameters
   */
  validateParameters(args: Record<string, any>): boolean {
    for (const [paramName, paramSpec] of Object.entries(this.parameters)) {
      if (paramSpec.required && !(paramName in args)) {
        throw new Error(`Missing required parameter: ${paramName}`);
      }

      if (paramSpec.type && typeof args[paramName] !== paramSpec.type) {
        throw new Error(`Parameter ${paramName} must be of type ${paramSpec.type}`);
      }
    }
    return true;
  }

  /**
   * Execute the tool with given arguments
   */
  abstract execute(args: Record<string, any>): Promise<any>;

  /**
   * Get tool metadata for LLM
   */
  getMetadata(): ToolMetadata {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }
}
