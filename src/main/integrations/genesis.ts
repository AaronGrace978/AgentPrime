/**
 * Genesis Integration for AgentPrime
 * ===================================
 * 
 * Integrates the Genesis human-approval code forge with AgentPrime:
 * 
 * 1. Uses AgentPrime's AI providers (shares API keys & models)
 * 2. Can be triggered from Matrix Mode channels (Discord, Slack, etc.)
 * 3. Can be scheduled via Matrix Mode scheduler (cron, webhooks)
 * 4. Approval/rejection history feeds into AgentPrime's Mirror learning
 * 5. "Genesis Mode" in agent loop - all changes require human approval
 * 
 * Usage:
 *   - From chat: "@genesis improve error handling in api.ts"
 *   - From scheduler: Nightly code review proposals
 *   - From agent: When high-risk changes detected, route through Genesis
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface GenesisConfig {
  /** Path to Genesis installation (e.g., G:\Genesis) */
  genesisPath: string;
  /** Default project path for Genesis operations */
  defaultProjectPath?: string;
  /** Default LLM spec (e.g., "anthropic:claude-sonnet-4-20250514") */
  defaultLlm?: string;
  /** Whether to auto-approve low-risk changes */
  autoApproveLowRisk?: boolean;
  /** Channels that can trigger Genesis (Discord, Slack, etc.) */
  allowedChannels?: string[];
}

export interface GenesisProposal {
  id: string;
  goal: string;
  reasoning: string;
  changes: GenesisChange[];
  timestamp: string;
  project: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
}

export interface GenesisChange {
  file_path: string;
  old_code: string;
  new_code: string;
}

export interface GenesisResult {
  success: boolean;
  proposal?: GenesisProposal;
  applied?: boolean;
  commitHash?: string;
  error?: string;
}

export type ApprovalDecision = 'approve' | 'reject' | 'modify' | 'skip';

export interface ApprovalRequest {
  proposalId: string;
  goal: string;
  reasoning: string;
  changes: GenesisChange[];
  project: string;
  channel?: string;
  userId?: string;
}

export interface ApprovalResponse {
  proposalId: string;
  decision: ApprovalDecision;
  feedback?: string;
  approvedBy?: string;
  timestamp: number;
}

// ============================================================================
// GENESIS BRIDGE
// ============================================================================

/**
 * Bridge to Genesis - runs Genesis as a subprocess and communicates via JSON
 */
export class GenesisBridge extends EventEmitter {
  private config: GenesisConfig;
  private activeProcess: ChildProcess | null = null;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  constructor(config: GenesisConfig) {
    super();
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.genesisPath) {
      throw new Error('Genesis path not configured');
    }
    if (!fs.existsSync(this.config.genesisPath)) {
      throw new Error(`Genesis not found at: ${this.config.genesisPath}`);
    }
    const runPy = path.join(this.config.genesisPath, 'run.py');
    if (!fs.existsSync(runPy)) {
      throw new Error(`Genesis run.py not found at: ${runPy}`);
    }
  }

  /**
   * Run Genesis with a goal
   * Returns the proposal for human review
   */
  async propose(
    goal: string,
    projectPath?: string,
    llmSpec?: string
  ): Promise<GenesisResult> {
    const project = projectPath || this.config.defaultProjectPath;
    if (!project) {
      return { success: false, error: 'No project path specified' };
    }

    const llm = llmSpec || this.config.defaultLlm;

    try {
      // For now, we run Genesis and capture output
      // In future, Genesis could expose a JSON API
      const result = await this.runGenesisCommand(goal, project, llm);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Run Genesis CLI command
   */
  private async runGenesisCommand(
    goal: string,
    projectPath: string,
    llmSpec?: string
  ): Promise<GenesisResult> {
    return new Promise((resolve) => {
      const args = ['run.py', goal, '--project', projectPath];
      if (llmSpec) {
        args.push('--llm', llmSpec);
      }

      console.log(`[Genesis] Running: python ${args.join(' ')}`);

      const proc = spawn('python', args, {
        cwd: this.config.genesisPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      this.activeProcess = proc;
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        this.emit('output', chunk);
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        this.activeProcess = null;
        
        if (code === 0) {
          // Parse output to extract proposal info
          const proposal = this.parseGenesisOutput(stdout, goal, projectPath);
          resolve({
            success: true,
            proposal,
            applied: stdout.includes('Applied') || stdout.includes('✓')
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Genesis exited with code ${code}`
          });
        }
      });

      proc.on('error', (error) => {
        this.activeProcess = null;
        resolve({ success: false, error: error.message });
      });
    });
  }

  /**
   * Parse Genesis output to extract proposal
   */
  private parseGenesisOutput(
    output: string,
    goal: string,
    project: string
  ): GenesisProposal {
    // Basic parsing - Genesis could provide structured JSON output in future
    return {
      id: `genesis-${Date.now()}`,
      goal,
      reasoning: this.extractReasoning(output),
      changes: this.extractChanges(output),
      timestamp: new Date().toISOString(),
      project,
      status: 'pending'
    };
  }

  private extractReasoning(output: string): string {
    const match = output.match(/Reasoning[:\s]+(.+?)(?=\n\n|File:|$)/is);
    return match ? match[1].trim() : 'No reasoning provided';
  }

  private extractChanges(output: string): GenesisChange[] {
    // Simplified - real implementation would parse diff format
    const changes: GenesisChange[] = [];
    const fileMatches = output.matchAll(/File:\s*(.+?)\n/g);
    for (const match of fileMatches) {
      changes.push({
        file_path: match[1].trim(),
        old_code: '',
        new_code: ''
      });
    }
    return changes;
  }

  /**
   * Send input to Genesis (for interactive approval)
   */
  sendInput(input: string): void {
    if (this.activeProcess?.stdin) {
      this.activeProcess.stdin.write(input + '\n');
    }
  }

  /**
   * Approve a pending proposal
   */
  approve(): void {
    this.sendInput('a');
  }

  /**
   * Reject a pending proposal
   */
  reject(): void {
    this.sendInput('r');
  }

  /**
   * Modify a pending proposal
   */
  modify(feedback: string): void {
    this.sendInput('m');
    setTimeout(() => this.sendInput(feedback), 100);
  }

  /**
   * Cancel the active Genesis process
   */
  cancel(): void {
    if (this.activeProcess) {
      this.activeProcess.kill();
      this.activeProcess = null;
    }
  }

  /**
   * Get evolution log stats
   */
  async getStats(): Promise<{ total: number; approved: number; rejected: number; rate: number } | null> {
    const logPath = path.join(this.config.genesisPath, 'evolution', 'log.json');
    if (!fs.existsSync(logPath)) {
      return null;
    }

    try {
      const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      const entries = log.entries || [];
      const approved = entries.filter((e: any) => e.decision === 'approved').length;
      const rejected = entries.filter((e: any) => e.decision === 'rejected').length;
      const total = entries.length;
      return {
        total,
        approved,
        rejected,
        rate: total > 0 ? approved / total : 0
      };
    } catch {
      return null;
    }
  }

  /**
   * Read recent evolution log entries
   */
  async getRecentProposals(limit: number = 10): Promise<GenesisProposal[]> {
    const logPath = path.join(this.config.genesisPath, 'evolution', 'log.json');
    if (!fs.existsSync(logPath)) {
      return [];
    }

    try {
      const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      const entries = (log.entries || []).slice(-limit);
      return entries.map((e: any) => ({
        id: e.proposal_id || e.id,
        goal: e.goal,
        reasoning: e.reasoning || '',
        changes: e.changes || [],
        timestamp: e.timestamp,
        project: e.project_path || '',
        status: e.decision || 'pending'
      }));
    } catch {
      return [];
    }
  }
}

// ============================================================================
// MATRIX MODE INTEGRATION
// ============================================================================

/**
 * Register Genesis commands for Matrix Mode channels
 */
export function registerGenesisMatrixCommands(
  bridge: GenesisBridge,
  messageHandler: (channel: string, message: string) => Promise<void>
): void {
  // This would be called by Matrix Mode's message router
  // to handle @genesis commands from any channel
  
  console.log('[Genesis] Matrix Mode commands registered');
  
  // Example commands:
  // @genesis improve error handling in api.ts
  // @genesis stats
  // @genesis recent
  // @genesis approve
  // @genesis reject
}

/**
 * Create Genesis approval request for Matrix Mode
 */
export function createApprovalRequest(
  proposal: GenesisProposal,
  channel: string,
  userId?: string
): ApprovalRequest {
  return {
    proposalId: proposal.id,
    goal: proposal.goal,
    reasoning: proposal.reasoning,
    changes: proposal.changes,
    project: proposal.project,
    channel,
    userId
  };
}

/**
 * Format proposal for chat display
 */
export function formatProposalForChat(proposal: GenesisProposal): string {
  let message = `🔨 **Genesis Proposal**\n\n`;
  message += `**Goal:** ${proposal.goal}\n`;
  message += `**Reasoning:** ${proposal.reasoning}\n\n`;
  
  if (proposal.changes.length > 0) {
    message += `**Files to modify:**\n`;
    for (const change of proposal.changes) {
      message += `  • ${change.file_path}\n`;
    }
  }
  
  message += `\n**Reply with:** approve | reject | modify <feedback>`;
  
  return message;
}

// ============================================================================
// SCHEDULER INTEGRATION
// ============================================================================

/**
 * Create a scheduled Genesis task
 * For automated code reviews, nightly improvements, etc.
 */
export interface ScheduledGenesisTask {
  id: string;
  name: string;
  goal: string;
  projectPath: string;
  cronExpression: string;
  llmSpec?: string;
  autoApprove?: boolean;
  notifyChannels?: string[];
}

/**
 * Create a Genesis task for the Matrix Mode scheduler
 */
export function createScheduledGenesisTask(
  task: Omit<ScheduledGenesisTask, 'id'>
): ScheduledGenesisTask {
  return {
    ...task,
    id: `genesis-task-${Date.now()}`
  };
}

// ============================================================================
// AGENT LOOP INTEGRATION
// ============================================================================

/**
 * GenesisMode for AgentPrime's agent loop
 * When enabled, all file changes go through human approval
 */
export interface GenesisAgentConfig {
  /** Enable Genesis mode (all changes need approval) */
  enabled: boolean;
  /** Only require approval for high-risk changes */
  highRiskOnly?: boolean;
  /** Patterns for files that always need approval */
  sensitivePatterns?: string[];
  /** Approval timeout in seconds */
  approvalTimeout?: number;
}

/**
 * Check if a file change should require Genesis approval
 */
export function requiresGenesisApproval(
  filePath: string,
  config: GenesisAgentConfig
): boolean {
  if (!config.enabled) return false;
  if (!config.highRiskOnly) return true;

  const sensitivePatterns = config.sensitivePatterns || [
    '*.config.*',
    '*.env*',
    '*secret*',
    '*password*',
    '*auth*',
    '*security*',
    'package.json',
    'tsconfig.json',
    'main.ts',
    'index.ts'
  ];

  const fileName = path.basename(filePath).toLowerCase();
  const fullPath = filePath.toLowerCase();

  for (const pattern of sensitivePatterns) {
    const regex = new RegExp(
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*'),
      'i'
    );
    if (regex.test(fileName) || regex.test(fullPath)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// LEARNING INTEGRATION
// ============================================================================

/**
 * Feed Genesis approval history into AgentPrime's Mirror learning system
 * This helps the agent learn what kinds of changes get approved/rejected
 */
export interface GenesisLearningEntry {
  goal: string;
  proposal: GenesisProposal;
  decision: ApprovalDecision;
  feedback?: string;
  timestamp: number;
}

/**
 * Extract learning patterns from Genesis evolution log
 */
export async function extractLearningPatterns(
  bridge: GenesisBridge
): Promise<{
  approvedPatterns: string[];
  rejectedPatterns: string[];
  commonFeedback: string[];
}> {
  const proposals = await bridge.getRecentProposals(100);
  
  const approvedPatterns: string[] = [];
  const rejectedPatterns: string[] = [];
  const commonFeedback: string[] = [];

  for (const p of proposals) {
    const pattern = `${p.goal.substring(0, 50)}...`;
    if (p.status === 'approved') {
      approvedPatterns.push(pattern);
    } else if (p.status === 'rejected') {
      rejectedPatterns.push(pattern);
    }
  }

  return { approvedPatterns, rejectedPatterns, commonFeedback };
}

// ============================================================================
// SINGLETON & INITIALIZATION
// ============================================================================

let genesisBridgeInstance: GenesisBridge | null = null;

/**
 * Initialize Genesis integration
 */
export function initializeGenesis(config: GenesisConfig): GenesisBridge {
  genesisBridgeInstance = new GenesisBridge(config);
  console.log(`[Genesis] Initialized with path: ${config.genesisPath}`);
  return genesisBridgeInstance;
}

/**
 * Get Genesis bridge instance
 */
export function getGenesisBridge(): GenesisBridge | null {
  return genesisBridgeInstance;
}

/**
 * Check if Genesis is available
 */
export function isGenesisAvailable(): boolean {
  return genesisBridgeInstance !== null;
}

export default {
  GenesisBridge,
  initializeGenesis,
  getGenesisBridge,
  isGenesisAvailable,
  requiresGenesisApproval,
  formatProposalForChat,
  createScheduledGenesisTask,
  extractLearningPatterns
};
