/**
 * Smart Controller - Main Module
 * AI-powered computer automation with vision
 * 
 * Features:
 * - Screen capture & AI vision analysis
 * - Mouse/keyboard automation
 * - Secure credential vault
 * - Task planning & execution
 * - Safety controls & audit logging
 * 
 * PERFORMANCE: Uses lazy loading for subsystems
 */

// Lazy-loaded subsystem instances
let _screenCapture: any = null;
let _automationController: any = null;
let _credentialVault: any = null;

// Lazy getters for subsystems - only load when first accessed
function getScreenCapture() {
  if (!_screenCapture) {
    const { screenCapture } = require('./screen-capture');
    _screenCapture = screenCapture;
  }
  return _screenCapture;
}

function getAutomationController() {
  if (!_automationController) {
    const { automationController } = require('./automation-controller');
    _automationController = automationController;
  }
  return _automationController;
}

function getCredentialVault() {
  if (!_credentialVault) {
    const { credentialVault } = require('./credential-vault');
    _credentialVault = credentialVault;
  }
  return _credentialVault;
}

// Type imports only (no runtime cost)
import type { ScreenCapture, UIElement, ScreenAnalysis } from './screen-capture';
import type { AutomationResult } from './automation-controller';
import type { Credential } from './credential-vault';

// Relationship intelligence (lazy loaded)
let _relationshipCore: any = null;
function getRelationship() {
  if (!_relationshipCore) {
    try {
      const { getRelationshipCore } = require('../relationship');
      _relationshipCore = getRelationshipCore();
    } catch (e) {
      console.warn('[SmartController] Relationship system not available');
      _relationshipCore = null;
    }
  }
  return _relationshipCore;
}

export interface SmartTask {
  id: string;
  name: string;
  description: string;
  steps: SmartStep[];
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  currentStep: number;
}

export interface SmartStep {
  id: string;
  type: 'click' | 'type' | 'screenshot' | 'wait' | 'scroll' | 'hotkey' | 'focus_window' | 
        'open_url' | 'login' | 'find_element' | 'conditional' | 'loop' | 'ai_decision';
  params: Record<string, any>;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  retryCount?: number;
  maxRetries?: number;
}

export interface SmartControllerConfig {
  aiProvider: string;
  aiModel: string;
  safetyMode: 'strict' | 'normal' | 'permissive';
  maxTaskDuration: number;  // Max minutes for a single task
  confirmBeforeActions: boolean;
  takeScreenshotsBetweenActions: boolean;
  enableVision: boolean;
}

export interface ActionConfirmation {
  taskId: string;
  stepId: string;
  action: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  timestamp: number;
}

/**
 * Smart Controller - AI Computer Control System
 * Uses lazy loading for subsystems to improve startup performance
 */
export class SmartController {
  private config: SmartControllerConfig = {
    aiProvider: 'anthropic',
    aiModel: 'claude-sonnet-4-20250514',
    safetyMode: 'normal',
    maxTaskDuration: 30,
    confirmBeforeActions: true,
    takeScreenshotsBetweenActions: true,
    enableVision: true
  };
  
  private tasks: Map<string, SmartTask> = new Map();
  private currentTask: SmartTask | null = null;
  private isRunning = false;
  private isPaused = false;
  private pendingConfirmations: ActionConfirmation[] = [];
  private onConfirmationNeeded?: (confirmation: ActionConfirmation) => Promise<boolean>;
  private onProgress?: (task: SmartTask, step: SmartStep) => void;
  private onScreenCapture?: (capture: ScreenCapture, analysis?: ScreenAnalysis) => void;

  // Lazy-loaded subsystem accessors
  public get screen(): any {
    return getScreenCapture();
  }
  
  public get automation(): any {
    return getAutomationController();
  }
  
  public get vault(): any {
    return getCredentialVault();
  }

  constructor(config?: Partial<SmartControllerConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    // Don't log on construction - defer until first use
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SmartControllerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SmartControllerConfig {
    return { ...this.config };
  }

  /**
   * Set callback for confirmation requests
   */
  setConfirmationHandler(handler: (confirmation: ActionConfirmation) => Promise<boolean>): void {
    this.onConfirmationNeeded = handler;
  }

  /**
   * Set callback for progress updates
   */
  setProgressHandler(handler: (task: SmartTask, step: SmartStep) => void): void {
    this.onProgress = handler;
  }

  /**
   * Set callback for screen captures
   */
  setScreenCaptureHandler(handler: (capture: ScreenCapture, analysis?: ScreenAnalysis) => void): void {
    this.onScreenCapture = handler;
  }

  /**
   * Create a new automation task
   */
  createTask(name: string, description: string, steps: Omit<SmartStep, 'id' | 'status'>[]): SmartTask {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const task: SmartTask = {
      id: taskId,
      name,
      description,
      steps: steps.map((step, idx) => ({
        ...step,
        id: `step-${idx}-${Math.random().toString(36).substr(2, 6)}`,
        status: 'pending' as const
      })),
      status: 'pending',
      createdAt: Date.now(),
      currentStep: 0
    };
    
    this.tasks.set(taskId, task);
    console.log(`[SmartController] Created task: ${name} with ${steps.length} steps`);
    
    return task;
  }

  /**
   * Execute a task
   */
  async executeTask(taskId: string): Promise<{ success: boolean; task: SmartTask; message: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, task: null!, message: 'Task not found' };
    }

    if (this.isRunning) {
      return { success: false, task, message: 'Another task is already running' };
    }

    try {
      this.isRunning = true;
      this.isPaused = false;
      this.currentTask = task;
      task.status = 'running';
      task.startedAt = Date.now();

      console.log(`[SmartController] Starting task: ${task.name}`);

      // Execute each step
      for (let i = task.currentStep; i < task.steps.length; i++) {
        // Check for pause/cancel
        if (!this.isRunning) {
          task.status = 'cancelled';
          break;
        }
        
        while (this.isPaused) {
          await this.sleep(100);
          if (!this.isRunning) break;
        }

        task.currentStep = i;
        const step = task.steps[i];
        step.status = 'running';
        
        this.onProgress?.(task, step);

        try {
          // Take screenshot before action if enabled
          if (this.config.takeScreenshotsBetweenActions) {
            const capture = await this.screen.captureScreen('medium');
            this.onScreenCapture?.(capture);
          }

          // Check if confirmation needed
          if (this.config.confirmBeforeActions && this.shouldConfirm(step)) {
            const confirmed = await this.requestConfirmation(task, step);
            if (!confirmed) {
              step.status = 'skipped';
              continue;
            }
          }

          // Execute the step
          const result = await this.executeStep(step);
          
          if (result.success) {
            step.status = 'completed';
            step.result = result.data;
            
            // Record successful action in relationship system
            const relationship = getRelationship();
            if (relationship) {
              relationship.recordAction(
                task.description,
                step.description,
                step.type,
                true,
                undefined // User reaction will be inferred later
              );
            }
          } else {
            // Handle failure with retry logic
            const maxRetries = step.maxRetries || 2;
            step.retryCount = (step.retryCount || 0) + 1;
            
            if (step.retryCount < maxRetries) {
              console.log(`[SmartController] Retrying step ${step.id} (${step.retryCount}/${maxRetries})`);
              i--; // Retry this step
              await this.sleep(1000);
            } else {
              step.status = 'failed';
              step.error = result.message;
              
              // Record failed action in relationship system
              const relationship = getRelationship();
              if (relationship) {
                relationship.recordAction(
                  task.description,
                  step.description,
                  step.type,
                  false,
                  undefined
                );
              }
              
              if (this.config.safetyMode === 'strict') {
                throw new Error(`Step failed: ${result.message}`);
              }
            }
          }

        } catch (stepError: any) {
          step.status = 'failed';
          step.error = stepError.message;
          
          // Record error in relationship system
          const relationship = getRelationship();
          if (relationship) {
            relationship.recordAction(
              task.description,
              step.description,
              step.type,
              false,
              'negative'
            );
          }
          
          if (this.config.safetyMode === 'strict') {
            throw stepError;
          }
        }
      }

      // Check final status
      const failedSteps = task.steps.filter(s => s.status === 'failed');
      if (failedSteps.length === 0) {
        task.status = 'completed';
      } else if (task.status !== 'cancelled') {
        task.status = 'completed'; // Completed with some failures
      }

      task.completedAt = Date.now();
      
      return { 
        success: task.status === 'completed' && failedSteps.length === 0,
        task,
        message: `Task ${task.status}. ${task.steps.length - failedSteps.length}/${task.steps.length} steps succeeded.`
      };

    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = Date.now();
      
      return { success: false, task, message: `Task failed: ${error.message}` };
      
    } finally {
      this.isRunning = false;
      this.currentTask = null;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: SmartStep): Promise<{ success: boolean; message: string; data?: any }> {
    console.log(`[SmartController] Executing step: ${step.type} - ${step.description}`);
    
    switch (step.type) {
      case 'click':
        return await this.automation.click({
          x: step.params.x,
          y: step.params.y,
          button: step.params.button,
          double: step.params.double
        });
      
      case 'type':
        return await this.automation.typeText(step.params.text, {
          delay: step.params.delay
        });
      
      case 'hotkey':
        return await this.automation.hotkey(...(step.params.keys as string[]));
      
      case 'scroll':
        return await this.automation.scroll({
          direction: step.params.direction,
          amount: step.params.amount
        });
      
      case 'focus_window':
        return await this.automation.focusWindow(step.params.title);
      
      case 'wait':
        await this.sleep(step.params.duration || 1000);
        return { success: true, message: `Waited ${step.params.duration}ms` };
      
      case 'screenshot':
        const capture = await this.screen.captureScreen(step.params.quality || 'medium');
        this.onScreenCapture?.(capture);
        return { success: true, message: 'Screenshot captured', data: { width: capture.width, height: capture.height } };
      
      case 'open_url':
        // Use system to open URL
        const { exec } = require('child_process');
        await new Promise((resolve, reject) => {
          const cmd = process.platform === 'win32' ? `start ${step.params.url}` :
                     process.platform === 'darwin' ? `open ${step.params.url}` :
                     `xdg-open ${step.params.url}`;
          exec(cmd, (err: any) => err ? reject(err) : resolve(null));
        });
        return { success: true, message: `Opened URL: ${step.params.url}` };
      
      case 'login':
        return await this.performLogin(step.params);
      
      case 'find_element':
        return await this.findElementOnScreen(step.params);
      
      case 'conditional':
        return await this.executeConditional(step.params);
      
      case 'ai_decision':
        return await this.makeAIDecision(step.params);
      
      default:
        return { success: false, message: `Unknown step type: ${step.type}` };
    }
  }

  /**
   * Perform login with credentials from vault
   */
  private async performLogin(params: { credentialId?: string; url?: string }): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      let credential: { username?: string; password?: string } | null = null;
      
      if (params.credentialId) {
        const result = await this.vault.getCredential(params.credentialId, 'auto-login');
        if (result.success && result.credential) {
          credential = result.credential;
        }
      } else if (params.url) {
        const result = await this.vault.getCredentialForAutoFill(params.url);
        if (result.success) {
          credential = { username: result.username, password: result.password };
        }
      }

      if (!credential || !credential.username || !credential.password) {
        return { success: false, message: 'No matching credentials found in vault' };
      }

      // Wait for page to load
      await this.sleep(1000);
      
      // Find and fill username field (common patterns)
      // In a real implementation, this would use AI vision to find the fields
      await this.automation.typeText(credential.username);
      await this.automation.pressKey('Tab');
      await this.sleep(200);
      await this.automation.typeText(credential.password);
      await this.sleep(200);
      await this.automation.pressKey('Enter');
      
      return { success: true, message: 'Login credentials entered' };
      
    } catch (error: any) {
      return { success: false, message: `Login failed: ${error.message}` };
    }
  }

  /**
   * Get the Anthropic provider for vision
   */
  private async getVisionProvider(): Promise<any> {
    try {
      const aiRouter = await import('../ai-providers');
      // Get the anthropic provider directly for vision capabilities
      const { AnthropicProvider } = await import('../ai-providers/anthropic-provider');
      
      // Create a new instance with the current API key
      const { getSecureKeyStorage } = await import('../security/secureKeyStorage');
      const storage = getSecureKeyStorage();
      const apiKey = await storage.getApiKey('anthropic');
      
      if (!apiKey) {
        throw new Error('Anthropic API key not configured');
      }
      
      return new AnthropicProvider({ apiKey });
    } catch (error: any) {
      console.error('[SmartController] Failed to get vision provider:', error);
      throw error;
    }
  }

  /**
   * Find an element on screen using AI vision
   */
  private async findElementOnScreen(params: { description: string; action?: 'click' | 'type' }): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      // Capture screen in high quality for vision analysis
      const capture = await this.screen.captureScreen('high');
      
      // Get the vision provider
      const visionProvider = await this.getVisionProvider();
      
      // Use Claude's vision to find the element
      const result = await visionProvider.findUIElements(
        capture.base64,
        params.description,
        { mediaType: 'image/png' }
      );
      
      if (!result.success) {
        return { 
          success: false, 
          message: `Vision analysis failed: ${result.error}`,
          data: { captureWidth: capture.width, captureHeight: capture.height }
        };
      }
      
      if (!result.elements || result.elements.length === 0) {
        return { 
          success: false, 
          message: `Element not found: "${params.description}"`,
          data: { captureWidth: capture.width, captureHeight: capture.height, searchedFor: params.description }
        };
      }
      
      // Get the best match (highest confidence)
      const bestMatch = result.elements.reduce((best, current) => 
        (current.confidence > best.confidence) ? current : best
      );
      
      console.log(`[SmartController] Found element: ${bestMatch.type} at (${bestMatch.x}, ${bestMatch.y}) with confidence ${bestMatch.confidence}`);
      
      // Optionally perform the action
      if (params.action === 'click') {
        await this.automation.click({ x: bestMatch.x, y: bestMatch.y });
        return { 
          success: true, 
          message: `Found and clicked "${params.description}" at (${bestMatch.x}, ${bestMatch.y})`,
          data: { element: bestMatch, action: 'clicked' }
        };
      } else if (params.action === 'type') {
        // Click to focus first
        await this.automation.click({ x: bestMatch.x, y: bestMatch.y });
        return { 
          success: true, 
          message: `Found and focused "${params.description}" at (${bestMatch.x}, ${bestMatch.y}). Ready for typing.`,
          data: { element: bestMatch, action: 'focused' }
        };
      }
      
      return { 
        success: true, 
        message: `Found "${params.description}" at (${bestMatch.x}, ${bestMatch.y})`,
        data: { 
          element: bestMatch,
          allElements: result.elements,
          captureWidth: capture.width, 
          captureHeight: capture.height 
        }
      };
      
    } catch (error: any) {
      console.error('[SmartController] Element finding failed:', error);
      return { success: false, message: `Element finding failed: ${error.message}` };
    }
  }

  /**
   * Execute conditional logic using AI vision
   */
  private async executeConditional(params: { condition: string; ifTrue: SmartStep[]; ifFalse?: SmartStep[] }): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      // Capture current screen state
      const capture = await this.screen.captureScreen('medium');
      
      // Get vision provider
      const visionProvider = await this.getVisionProvider();
      
      // Ask AI to evaluate the condition based on screen content
      const result = await visionProvider.makeScreenDecision(
        capture.base64,
        `Evaluate if this condition is TRUE or FALSE: "${params.condition}"`,
        ['TRUE - the condition is met', 'FALSE - the condition is not met']
      );
      
      if (!result.success) {
        return { 
          success: false, 
          message: `Condition evaluation failed: ${result.error}` 
        };
      }
      
      const conditionMet = result.decision?.toUpperCase().includes('TRUE') || false;
      
      console.log(`[SmartController] Condition "${params.condition}" evaluated to: ${conditionMet}`);
      console.log(`[SmartController] Reasoning: ${result.reasoning}`);
      
      // Execute the appropriate branch
      const stepsToExecute = conditionMet ? params.ifTrue : (params.ifFalse || []);
      
      return { 
        success: true, 
        message: `Condition ${conditionMet ? 'met' : 'not met'}: ${result.reasoning}`,
        data: { 
          conditionMet,
          reasoning: result.reasoning,
          confidence: result.confidence,
          stepsToExecute: stepsToExecute.length
        }
      };
      
    } catch (error: any) {
      console.error('[SmartController] Conditional evaluation failed:', error);
      return { success: false, message: `Conditional evaluation failed: ${error.message}` };
    }
  }

  /**
   * Make AI-powered decision based on screen content
   */
  private async makeAIDecision(params: { question: string; options?: string[] }): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      // Capture current screen state
      const capture = await this.screen.captureScreen('medium');
      
      // Get vision provider
      const visionProvider = await this.getVisionProvider();
      
      // Ask AI to make a decision
      const result = await visionProvider.makeScreenDecision(
        capture.base64,
        params.question,
        params.options
      );
      
      if (!result.success) {
        return { 
          success: false, 
          message: `AI decision failed: ${result.error}` 
        };
      }
      
      console.log(`[SmartController] AI Decision: ${result.decision}`);
      console.log(`[SmartController] Reasoning: ${result.reasoning}`);
      
      return { 
        success: true, 
        message: `Decision: ${result.decision}`,
        data: { 
          decision: result.decision,
          reasoning: result.reasoning,
          confidence: result.confidence
        }
      };
      
    } catch (error: any) {
      console.error('[SmartController] AI decision failed:', error);
      return { success: false, message: `AI decision failed: ${error.message}` };
    }
  }

  /**
   * Check if step needs confirmation
   * Uses relationship intelligence guardrails for smart confirmation
   */
  private shouldConfirm(step: SmartStep): boolean {
    if (this.config.safetyMode === 'permissive') return false;
    if (this.config.safetyMode === 'strict') return true;
    
    // Use relationship guardrails if available
    const relationship = getRelationship();
    if (relationship) {
      const result = relationship.checkAction(step.description, step.type);
      return result.requiresConfirmation;
    }
    
    // Fallback: confirm risky actions
    const riskyTypes = ['login', 'type', 'hotkey', 'open_url'];
    return riskyTypes.includes(step.type);
  }

  /**
   * Request user confirmation for an action
   */
  private async requestConfirmation(task: SmartTask, step: SmartStep): Promise<boolean> {
    if (!this.onConfirmationNeeded) {
      console.warn('[SmartController] No confirmation handler set, auto-approving');
      return true;
    }

    const confirmation: ActionConfirmation = {
      taskId: task.id,
      stepId: step.id,
      action: step.type,
      description: step.description,
      riskLevel: this.assessRiskLevel(step),
      timestamp: Date.now()
    };

    this.pendingConfirmations.push(confirmation);
    
    try {
      return await this.onConfirmationNeeded(confirmation);
    } finally {
      this.pendingConfirmations = this.pendingConfirmations.filter(c => c.stepId !== step.id);
    }
  }

  /**
   * Assess risk level of a step
   * Uses relationship intelligence guardrails for smart risk assessment
   */
  private assessRiskLevel(step: SmartStep): 'low' | 'medium' | 'high' {
    // Use relationship guardrails if available
    const relationship = getRelationship();
    if (relationship) {
      const result = relationship.checkAction(step.description, step.type);
      // Map ActionRisk to simplified risk levels
      switch (result.riskLevel) {
        case 'critical':
        case 'high':
          return 'high';
        case 'medium':
          return 'medium';
        case 'low':
        case 'safe':
          return 'low';
        default:
          return 'medium';
      }
    }
    
    // Fallback assessment
    switch (step.type) {
      case 'login':
        return 'high';
      case 'type':
        // High if contains sensitive keywords
        const text = step.params.text?.toLowerCase() || '';
        if (text.includes('password') || text.includes('credit') || text.includes('ssn')) {
          return 'high';
        }
        return 'medium';
      case 'hotkey':
        // Some hotkeys are risky
        const keys = (step.params.keys || []).join('+').toLowerCase();
        if (keys.includes('delete') || keys.includes('alt+f4')) {
          return 'high';
        }
        return 'medium';
      case 'open_url':
        return 'medium';
      case 'click':
      case 'scroll':
      case 'focus_window':
        return 'low';
      case 'wait':
      case 'screenshot':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Pause current task
   */
  pauseTask(): void {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      if (this.currentTask) {
        this.currentTask.status = 'paused';
      }
      console.log('[SmartController] Task paused');
    }
  }

  /**
   * Resume paused task
   */
  resumeTask(): void {
    if (this.isPaused) {
      this.isPaused = false;
      if (this.currentTask) {
        this.currentTask.status = 'running';
      }
      console.log('[SmartController] Task resumed');
    }
  }

  /**
   * Cancel current task
   */
  cancelTask(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.isPaused = false;
      if (this.currentTask) {
        this.currentTask.status = 'cancelled';
      }
      console.log('[SmartController] Task cancelled');
    }
  }

  /**
   * Emergency stop all automation
   */
  emergencyStop(): void {
    this.cancelTask();
    this.automation.emergencyStop();
    console.log('[SmartController] 🛑 EMERGENCY STOP');
  }

  /**
   * Resume from emergency stop
   */
  resume(): void {
    this.automation.resume();
    console.log('[SmartController] ▶️ Resumed');
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): SmartTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): SmartTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get current running task
   */
  getCurrentTask(): SmartTask | null {
    return this.currentTask;
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): boolean {
    if (this.currentTask?.id === taskId) {
      return false; // Can't delete running task
    }
    return this.tasks.delete(taskId);
  }

  /**
   * Create task from natural language (AI-powered)
   * Uses Claude to analyze the instruction and generate automation steps
   */
  async createTaskFromNaturalLanguage(instruction: string): Promise<SmartTask | null> {
    console.log(`[SmartController] Creating task from: ${instruction}`);
    
    try {
      // Get AI provider
      const aiRouter = (await import('../ai-providers')).default;
      
      const systemPrompt = `You are an AI task planner that converts natural language instructions into automation steps.

Available step types:
- click: Click at position (params: x, y) or find_element first
- type: Type text (params: text, delay?)
- hotkey: Press keyboard shortcut (params: keys - array like ["ctrl", "c"])
- scroll: Scroll the page (params: direction: "up"|"down", amount)
- wait: Wait for duration (params: duration in ms)
- screenshot: Capture screen (params: quality: "high"|"medium"|"low")
- focus_window: Focus window by title (params: title)
- open_url: Open URL in browser (params: url)
- find_element: Find UI element with AI vision (params: description, action?: "click"|"type")
- ai_decision: Make AI decision (params: question, options?)
- conditional: Branch based on condition (params: condition, ifTrue, ifFalse)

Windows shortcuts:
- Win+R: Open Run dialog
- Alt+Tab: Switch windows
- Ctrl+C/V: Copy/Paste
- Win+E: Open Explorer
- Win+S: Windows Search

Output a JSON object with this structure:
{
  "taskName": "short name for the task",
  "steps": [
    {
      "type": "step_type",
      "params": { ... },
      "description": "human readable description"
    }
  ],
  "explanation": "what this task will do"
}

Be practical - use keyboard shortcuts when possible. For finding buttons or UI elements, use find_element with a description. Add appropriate waits between actions.`;

      const userPrompt = `Convert this instruction into automation steps:\n\n"${instruction}"\n\nProvide ONLY the JSON response, no additional text.`;
      
      let response = '';
      await aiRouter.stream([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], (chunk) => {
        if (chunk.content) {
          response += chunk.content;
        }
      }, { maxTokens: 2048 });
      
      // Parse the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[SmartController] No JSON in AI response:', response);
        return null;
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.steps || parsed.steps.length === 0) {
        console.warn('[SmartController] AI returned no steps');
        return null;
      }
      
      // Validate and normalize steps
      const steps: Omit<SmartStep, 'id' | 'status'>[] = parsed.steps.map((step: any) => ({
        type: step.type,
        params: step.params || {},
        description: step.description || `${step.type} action`,
        maxRetries: step.maxRetries || 2
      }));
      
      console.log(`[SmartController] AI generated ${steps.length} steps for: ${parsed.taskName}`);
      
      return this.createTask(
        parsed.taskName || `Task: ${instruction.substring(0, 40)}`,
        parsed.explanation || instruction,
        steps
      );
      
    } catch (error: any) {
      console.error('[SmartController] AI task generation failed:', error);
      
      // Fallback to simple keyword-based generation
      return this.createTaskFromKeywords(instruction);
    }
  }

  /**
   * Fallback keyword-based task generation
   */
  private createTaskFromKeywords(instruction: string): SmartTask | null {
    const steps: Omit<SmartStep, 'id' | 'status'>[] = [];
    const lowerInstruction = instruction.toLowerCase();
    
    // Common patterns
    if (lowerInstruction.includes('open')) {
      if (lowerInstruction.includes('chrome') || lowerInstruction.includes('browser')) {
        steps.push(
          { type: 'hotkey', params: { keys: ['meta', 'r'] }, description: 'Open Run dialog' },
          { type: 'wait', params: { duration: 500 }, description: 'Wait for dialog' },
          { type: 'type', params: { text: 'chrome' }, description: 'Type chrome' },
          { type: 'hotkey', params: { keys: ['enter'] }, description: 'Press Enter' }
        );
      } else if (lowerInstruction.includes('notepad')) {
        steps.push(
          { type: 'hotkey', params: { keys: ['meta', 'r'] }, description: 'Open Run dialog' },
          { type: 'wait', params: { duration: 500 }, description: 'Wait for dialog' },
          { type: 'type', params: { text: 'notepad' }, description: 'Type notepad' },
          { type: 'hotkey', params: { keys: ['enter'] }, description: 'Press Enter' }
        );
      } else if (lowerInstruction.includes('explorer') || lowerInstruction.includes('files')) {
        steps.push(
          { type: 'hotkey', params: { keys: ['meta', 'e'] }, description: 'Open File Explorer' }
        );
      }
    }
    
    if (lowerInstruction.includes('search')) {
      steps.push(
        { type: 'hotkey', params: { keys: ['meta', 's'] }, description: 'Open Windows Search' },
        { type: 'wait', params: { duration: 500 }, description: 'Wait for search' }
      );
      
      // Extract search term
      const searchMatch = lowerInstruction.match(/search(?:\s+for)?\s+["']?([^"']+)["']?/i);
      if (searchMatch) {
        steps.push(
          { type: 'type', params: { text: searchMatch[1].trim() }, description: `Search for: ${searchMatch[1]}` }
        );
      }
    }
    
    if (lowerInstruction.includes('screenshot')) {
      steps.push(
        { type: 'screenshot', params: { quality: 'high' }, description: 'Take screenshot' }
      );
    }
    
    if (steps.length === 0) {
      return null;
    }
    
    return this.createTask(
      `Task: ${instruction.substring(0, 50)}`,
      instruction,
      steps
    );
  }

  /**
   * Get controller status
   */
  getStatus(): {
    isRunning: boolean;
    isPaused: boolean;
    currentTaskId: string | null;
    taskCount: number;
    vaultUnlocked: boolean;
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentTaskId: this.currentTask?.id || null,
      taskCount: this.tasks.size,
      vaultUnlocked: this.vault.isVaultUnlocked()
    };
  }

  // Utility
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Re-export types (no runtime cost)
export type { ScreenCapture, UIElement, ScreenAnalysis } from './screen-capture';
export type { AutomationResult } from './automation-controller';
export type { Credential } from './credential-vault';

// Lazy re-exports - only load when accessed
export function getScreenCaptureService() {
  return getScreenCapture();
}

export function getAutomationControllerInstance() {
  return getAutomationController();
}

export function getCredentialVaultInstance() {
  return getCredentialVault();
}

// Lazy singleton - only created when first accessed
let _smartControllerInstance: SmartController | null = null;

export function getSmartController(config?: Partial<SmartControllerConfig>): SmartController {
  if (!_smartControllerInstance) {
    _smartControllerInstance = new SmartController(config);
    console.log('[SmartController] Lazy initialized');
  }
  return _smartControllerInstance;
}

// Legacy export for backwards compatibility - but lazy!
export const smartController = {
  get instance() {
    return getSmartController();
  }
};
