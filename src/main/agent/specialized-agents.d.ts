/**
 * Specialized Agent Architecture - WITH MIRROR INTELLIGENCE
 *
 * Instead of one agent trying to do everything, we have specialists:
 * 1. Tool Orchestrator - Handles tool calls, parsing, execution
 * 2. JavaScript Specialist - Writes JS/TS/React code
 * 3. Python Specialist - Writes Python code
 * 4. Pipeline Specialist - Handles build/deploy/CI/CD
 * 5. Integration Analyst - Reviews work, wires things together, ensures coherence
 *
 * NOW WITH MIRROR INTELLIGENCE:
 * - Each specialist learns from stored patterns
 * - Patterns are injected into prompts for better results
 * - Successes/failures are stored for future learning
 * - Anti-patterns are avoided based on past mistakes
 */
export type AgentRole = 'tool_orchestrator' | 'javascript_specialist' | 'python_specialist' | 'pipeline_specialist' | 'integration_analyst';
export interface AgentConfig {
    role: AgentRole;
    model: string;
    provider: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
}
/**
 * Agent Specialization Configurations
 */
export declare const AGENT_CONFIGS: Record<AgentRole, AgentConfig>;
/**
 * Route a task to the appropriate specialist(s)
 */
export declare function routeToSpecialists(task: string, context?: {
    files?: string[];
    language?: string;
    projectType?: string;
}): AgentRole[];
/**
 * Execute a task using specialized agents
 *
 * This is a simplified version - in production, this would integrate
 * with the actual tool execution system from agent-loop.ts
 */
export declare function executeWithSpecialists(task: string, roles: AgentRole[], context?: any): Promise<{
    results: Map<AgentRole, string>;
    finalAnalysis?: string;
    executedTools: any[];
}>;
//# sourceMappingURL=specialized-agents.d.ts.map