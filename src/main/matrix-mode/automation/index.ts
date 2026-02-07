/**
 * Matrix Mode Automation System
 * Workflow engine, triggers, and approval queues
 */

import { EventEmitter } from 'events';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// Types
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'event' | 'email' | 'file';
  config: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'condition' | 'loop' | 'parallel' | 'approval';
  config: Record<string, any>;
  onSuccess?: string; // Next step ID
  onFailure?: string; // Step ID on failure
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStepId?: string;
  startedAt: number;
  completedAt?: number;
  context: Record<string, any>;
  results: Map<string, any>;
  error?: string;
}

export interface ApprovalRequest {
  id: string;
  executionId: string;
  stepId: string;
  title: string;
  description?: string;
  options: string[];
  createdAt: number;
  expiresAt?: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  response?: string;
  respondedAt?: number;
  respondedBy?: string;
}

// Generate ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Workflow Engine
 */
export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private approvals: Map<string, ApprovalRequest> = new Map();
  private stepHandlers: Map<string, (step: WorkflowStep, context: Record<string, any>) => Promise<any>> = new Map();
  private storagePath: string;

  constructor(storagePath?: string) {
    super();
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.storagePath = storagePath || path.join(userDataPath, 'matrix-workflows.json');
    
    // Register default step handlers
    this.registerDefaultHandlers();
  }

  /**
   * Initialize and load workflows
   */
  async initialize(): Promise<void> {
    await this.loadWorkflows();
    console.log(`[WorkflowEngine] Initialized with ${this.workflows.size} workflows`);
  }

  /**
   * Register default step handlers
   */
  private registerDefaultHandlers(): void {
    // Action step
    this.stepHandlers.set('action', async (step, context) => {
      const { action, params } = step.config;
      // Execute action based on config
      this.emit('action', { action, params, context });
      return { success: true };
    });

    // Condition step
    this.stepHandlers.set('condition', async (step, context) => {
      const { condition, value, comparator } = step.config;
      const actualValue = this.resolveValue(condition, context);
      
      let result = false;
      switch (comparator) {
        case 'equals': result = actualValue === value; break;
        case 'notEquals': result = actualValue !== value; break;
        case 'contains': result = String(actualValue).includes(value); break;
        case 'greaterThan': result = actualValue > value; break;
        case 'lessThan': result = actualValue < value; break;
        default: result = !!actualValue;
      }
      
      return { result };
    });

    // Approval step
    this.stepHandlers.set('approval', async (step, context) => {
      // Create approval request and wait
      return new Promise((resolve) => {
        const request = this.createApprovalRequest(
          context.executionId,
          step.id,
          step.config.title || 'Approval Required',
          step.config.description,
          step.config.options || ['Approve', 'Reject']
        );
        
        // Wait for response
        const checkInterval = setInterval(() => {
          const updated = this.approvals.get(request.id);
          if (updated && updated.status !== 'pending') {
            clearInterval(checkInterval);
            resolve({ approved: updated.status === 'approved', response: updated.response });
          }
        }, 1000);
      });
    });

    // Delay step
    this.stepHandlers.set('delay', async (step, context) => {
      const ms = step.config.milliseconds || step.config.seconds * 1000 || 1000;
      await new Promise(resolve => setTimeout(resolve, ms));
      return { delayed: ms };
    });
  }

  /**
   * Resolve value from context
   */
  private resolveValue(path: string, context: Record<string, any>): any {
    const parts = path.split('.');
    let value: any = context;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }

  /**
   * Register a custom step handler
   */
  registerStepHandler(
    type: string, 
    handler: (step: WorkflowStep, context: Record<string, any>) => Promise<any>
  ): void {
    this.stepHandlers.set(type, handler);
  }

  /**
   * Load workflows from storage
   */
  private async loadWorkflows(): Promise<void> {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
        for (const workflow of data.workflows || []) {
          this.workflows.set(workflow.id, workflow);
        }
      }
    } catch (error) {
      console.warn('[WorkflowEngine] Failed to load workflows:', error);
    }
  }

  /**
   * Save workflows to storage
   */
  private async saveWorkflows(): Promise<void> {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = {
        workflows: Array.from(this.workflows.values())
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[WorkflowEngine] Failed to save workflows:', error);
    }
  }

  /**
   * Create a workflow
   */
  createWorkflow(definition: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>): WorkflowDefinition {
    const workflow: WorkflowDefinition = {
      ...definition,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(workflow.id, workflow);
    this.saveWorkflows();
    
    return workflow;
  }

  /**
   * Get a workflow
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Update a workflow
   */
  updateWorkflow(workflowId: string, updates: Partial<WorkflowDefinition>): WorkflowDefinition | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;
    
    const updated = { ...workflow, ...updates, updatedAt: Date.now() };
    this.workflows.set(workflowId, updated);
    this.saveWorkflows();
    
    return updated;
  }

  /**
   * Delete a workflow
   */
  deleteWorkflow(workflowId: string): boolean {
    const deleted = this.workflows.delete(workflowId);
    if (deleted) {
      this.saveWorkflows();
    }
    return deleted;
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId: string, initialContext: Record<string, any> = {}): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (!workflow.enabled) {
      throw new Error(`Workflow is disabled: ${workflowId}`);
    }

    const execution: WorkflowExecution = {
      id: generateId(),
      workflowId,
      status: 'running',
      startedAt: Date.now(),
      context: { ...initialContext, executionId: '' },
      results: new Map()
    };
    execution.context.executionId = execution.id;

    this.executions.set(execution.id, execution);
    this.emit('executionStarted', execution);

    try {
      // Execute steps
      for (const step of workflow.steps) {
        if (execution.status !== 'running') break;
        
        execution.currentStepId = step.id;
        this.emit('stepStarted', { execution, step });

        const handler = this.stepHandlers.get(step.type);
        if (!handler) {
          throw new Error(`Unknown step type: ${step.type}`);
        }

        try {
          const result = await handler(step, execution.context);
          execution.results.set(step.id, result);
          execution.context[`step_${step.id}`] = result;
          
          this.emit('stepCompleted', { execution, step, result });

          // Handle condition results
          if (step.type === 'condition' && !result.result && step.onFailure) {
            // Skip to failure step (simplified - real impl would navigate)
            continue;
          }
        } catch (stepError: any) {
          if (step.onFailure) {
            execution.context.lastError = stepError.message;
            continue;
          }
          throw stepError;
        }
      }

      execution.status = 'completed';
      execution.completedAt = Date.now();
      this.emit('executionCompleted', execution);

    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = Date.now();
      this.emit('executionFailed', { execution, error });
    }

    return execution;
  }

  /**
   * Pause an execution
   */
  pauseExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'paused';
      this.emit('executionPaused', execution);
      return true;
    }
    return false;
  }

  /**
   * Resume an execution
   */
  async resumeExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'paused') {
      execution.status = 'running';
      this.emit('executionResumed', execution);
      // Would continue from current step
      return true;
    }
    return false;
  }

  /**
   * Cancel an execution
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (execution && (execution.status === 'running' || execution.status === 'paused')) {
      execution.status = 'cancelled';
      execution.completedAt = Date.now();
      this.emit('executionCancelled', execution);
      return true;
    }
    return false;
  }

  /**
   * Get execution status
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all executions
   */
  getExecutions(workflowId?: string): WorkflowExecution[] {
    const all = Array.from(this.executions.values());
    if (workflowId) {
      return all.filter(e => e.workflowId === workflowId);
    }
    return all;
  }

  /**
   * Create an approval request
   */
  createApprovalRequest(
    executionId: string,
    stepId: string,
    title: string,
    description?: string,
    options: string[] = ['Approve', 'Reject']
  ): ApprovalRequest {
    const request: ApprovalRequest = {
      id: generateId(),
      executionId,
      stepId,
      title,
      description,
      options,
      createdAt: Date.now(),
      status: 'pending'
    };

    this.approvals.set(request.id, request);
    this.emit('approvalRequired', request);

    return request;
  }

  /**
   * Respond to an approval request
   */
  respondToApproval(requestId: string, approved: boolean, response?: string, respondedBy?: string): boolean {
    const request = this.approvals.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = approved ? 'approved' : 'rejected';
    request.response = response;
    request.respondedAt = Date.now();
    request.respondedBy = respondedBy;

    this.emit('approvalResponded', request);
    return true;
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvals.values()).filter(a => a.status === 'pending');
  }
}

// Singleton
let workflowEngineInstance: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!workflowEngineInstance) {
    workflowEngineInstance = new WorkflowEngine();
  }
  return workflowEngineInstance;
}

export async function initializeWorkflowEngine(): Promise<WorkflowEngine> {
  const engine = getWorkflowEngine();
  await engine.initialize();
  return engine;
}

export default WorkflowEngine;
