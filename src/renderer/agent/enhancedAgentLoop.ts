/**
 * Enhanced Agent Loop for AgentPrime
 * 
 * This is a smarter version of the agent loop that:
 * 1. Uses short-term memory to avoid redundant operations
 * 2. Verifies its own changes
 * 3. Manages context intelligently
 * 4. Has better error recovery
 * 5. Can checkpoint and resume
 */

import { promptBuilder, PromptContext } from './promptBuilder';
import { validateToolCall, AgentResponse, ToolCall, toolSchemas } from './toolSchemas';
import { shortTermMemory } from './shortTermMemory';
import { verifyFileWrite, verifyChanges } from './selfVerification';
import { contextManager, ChatMessage } from './contextManager';

// @ts-ignore - window.agentAPI is injected by preload script
declare const window: any;

/**
 * Custom error class for fatal errors
 */
class FatalAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalAgentError';
  }
}

/**
 * Checkpoint for task recovery
 */
export interface Checkpoint {
  id: string;
  timestamp: Date;
  task: string;
  iterations: number;
  completedSteps: string[];
  currentPlan: string[];
  currentStep: number;
  filesModified: string[];
  chatHistory: ChatMessage[];
}

/**
 * Enhanced agent state
 */
export interface EnhancedAgentState {
  isRunning: boolean;
  currentTask: string | null;
  iterations: number;
  maxIterations: number;
  chatHistory: ChatMessage[];
  // Planning
  currentPlan: string[];
  currentStep: number;
  completedSteps: string[];
  // Error tracking
  consecutiveParseErrors: number;
  consecutiveEmptyResponses: number;
  // Repetition detection
  consecutiveSameFileWrites: number;
  lastWrittenFile: string | null;
  // New: Files we've modified this session
  filesModified: string[];
  // New: Checkpoint support
  lastCheckpoint: Checkpoint | null;
  // New: Verification results
  pendingVerifications: Array<{ path: string; content: string }>;
}

/**
 * Agent callbacks
 */
export interface EnhancedAgentCallbacks {
  onIteration?: (iteration: number, response: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolName: string, result: any) => void;
  onError?: (error: string) => void;
  onComplete?: (message: string) => void;
  onPlanCreated?: (plan: string[]) => void;
  onStepComplete?: (step: string, stepIndex: number) => void;
  onRepetitiveWriteWarning?: (filePath: string, count: number) => void;
  // New callbacks
  onCheckpoint?: (checkpoint: Checkpoint) => void;
  onVerification?: (result: { path: string; success: boolean; issues: string[] }) => void;
  onCacheHit?: (path: string) => void;
  onContextCompressed?: (originalSize: number, compressedSize: number) => void;
}

export class EnhancedAgentLoop {
  private state: EnhancedAgentState = this.createInitialState();
  private callbacks: EnhancedAgentCallbacks = {};
  private selectedModel: string = 'qwen3-coder:480b-cloud';
  
  // Thresholds
  private readonly MAX_PARSE_ERRORS = 5;
  private readonly MAX_EMPTY_RESPONSES = 3;
  private readonly CHECKPOINT_INTERVAL = 5; // Create checkpoint every N iterations
  private readonly MAX_HISTORY_MESSAGES = 50; // Limit conversation history to prevent memory leaks

  private createInitialState(): EnhancedAgentState {
    return {
      isRunning: false,
      currentTask: null,
      iterations: 0,
      maxIterations: 100,
      chatHistory: [],
      currentPlan: [],
      currentStep: 0,
      completedSteps: [],
      consecutiveParseErrors: 0,
      consecutiveEmptyResponses: 0,
      consecutiveSameFileWrites: 0,
      lastWrittenFile: null,
      filesModified: [],
      lastCheckpoint: null,
      pendingVerifications: []
    };
  }

  setCallbacks(callbacks: EnhancedAgentCallbacks): void {
    this.callbacks = callbacks;
  }

  setContext(context: PromptContext): void {
    promptBuilder.setContext(context);
  }

  setModel(model: string): void {
    this.selectedModel = model;
    console.log('[EnhancedAgent] Model set to:', model);
  }

  async startAgent(userGoal: string, model?: string): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Agent is already running');
    }

    if (model) {
      this.selectedModel = model;
    }

    // Clear short-term memory for new task
    shortTermMemory.clear();

    // Clean up old chat history if it exceeds limit (prevent memory leaks)
    const currentHistory = this.state.chatHistory;
    if (currentHistory.length > this.MAX_HISTORY_MESSAGES) {
      const excess = currentHistory.length - this.MAX_HISTORY_MESSAGES;
      this.state.chatHistory = currentHistory.slice(excess);
      console.log(`[EnhancedAgent] Cleaned up ${excess} old messages before starting new task`);
    }

    this.state = {
      ...this.createInitialState(),
      isRunning: true,
      currentTask: userGoal,
      // Preserve recent history if starting a new task in the same session
      chatHistory: this.state.chatHistory.slice(-this.MAX_HISTORY_MESSAGES)
    };

    try {
      // 🔍 EXPLORATION PHASE - Like Cursor, explore before acting
      await this.runExplorationPhase(userGoal);
      
      // Then run the main execution loop
      await this.runLoop(userGoal);
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.state.isRunning = false;
      // Final verification of all modified files
      await this.runFinalVerification();
      
      // Clean up chat history if it exceeds limit (prevent memory leaks in long sessions)
      if (this.state.chatHistory.length > this.MAX_HISTORY_MESSAGES) {
        const excess = this.state.chatHistory.length - this.MAX_HISTORY_MESSAGES;
        this.state.chatHistory = this.state.chatHistory.slice(excess);
        console.log(`[EnhancedAgent] Cleaned up ${excess} old messages after task completion`);
      }
    }
  }

  /**
   * 🔍 EXPLORATION PHASE - Gather context before taking action
   * This is what makes Cursor feel smart - it reads and understands first
   */
  private async runExplorationPhase(userGoal: string): Promise<void> {
    console.log('[EnhancedAgent] 🔍 Starting exploration phase...');
    
    // Detect what kind of task this is
    const isCreatingNew = /create|build|make|generate|new|start/i.test(userGoal);
    const isFixing = /fix|debug|error|bug|broken|issue|problem/i.test(userGoal);
    const isModifying = /change|update|modify|edit|add|remove|improve/i.test(userGoal);
    
    // Extract potential file references from the goal
    const filePatterns = userGoal.match(/[\w\-\/]+\.(js|ts|tsx|jsx|html|css|py|json|md)/gi) || [];
    const folderPatterns = userGoal.match(/(?:in|from|to)\s+(\w+\/?\w*)/gi) || [];
    
    const explorationResults: string[] = [];
    
    try {
      // 1. Always list the root directory first to understand project structure
      const rootListing = await this.executeTool({ 
        name: 'list_files', 
        parameters: { path: '.' } 
      });
      
      if (rootListing && rootListing.success !== false) {
        const files = Array.isArray(rootListing) ? rootListing : (rootListing.data || []);
        const fileNames = files.map((f: any) => f.name || f).join(', ');
        explorationResults.push(`📁 Project root contains: ${fileNames}`);
        shortTermMemory.cacheFileRead('.', JSON.stringify(files));
      }
      
      // 2. If fixing/modifying, try to find and read relevant files
      if ((isFixing || isModifying) && !isCreatingNew) {
        // Read files mentioned in the goal
        for (const file of filePatterns.slice(0, 3)) {
          try {
            const content = await this.executeTool({
              name: 'read_file',
              parameters: { path: file }
            });
            if (content && content.success !== false && content.content) {
              explorationResults.push(`📄 Read ${file} (${content.content.length} chars)`);
              shortTermMemory.cacheFileRead(file, content.content);
            }
          } catch (e) {
            // File might not exist, that's ok
          }
        }
        
        // If no specific files mentioned, look for common entry points
        if (filePatterns.length === 0) {
          const commonFiles = ['index.html', 'index.js', 'main.js', 'app.js', 'App.tsx', 'main.py', 'app.py'];
          for (const file of commonFiles) {
            try {
              const content = await this.executeTool({
                name: 'read_file',
                parameters: { path: file }
              });
              if (content && content.success !== false && content.content) {
                explorationResults.push(`📄 Found and read ${file}`);
                shortTermMemory.cacheFileRead(file, content.content);
                break; // Found an entry point, that's enough
              }
            } catch (e) {
              // File doesn't exist, try next
            }
          }
        }
      }
      
      // 3. Search for relevant code patterns if fixing or modifying
      if (isFixing || isModifying) {
        // Extract keywords from the goal for searching
        const keywords = userGoal
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3 && !/^(the|and|for|that|this|with|from|have|will|make|create|fix|change|update)$/i.test(w))
          .slice(0, 2);
        
        for (const keyword of keywords) {
          try {
            const searchResult = await this.executeTool({
              name: 'search_codebase',
              parameters: { query: keyword, max_results: 5 }
            });
            if (searchResult && searchResult.matches && searchResult.matches.length > 0) {
              const matchFiles = [...new Set(searchResult.matches.map((m: any) => m.file))];
              explorationResults.push(`🔎 Found "${keyword}" in: ${matchFiles.join(', ')}`);
            }
          } catch (e) {
            // Search failed, continue
          }
        }
      }
      
    } catch (error) {
      console.warn('[EnhancedAgent] Exploration phase error:', error);
    }
    
    // Add exploration results to chat history as context
    if (explorationResults.length > 0) {
      const explorationSummary = `## 🔍 EXPLORATION COMPLETE\n${explorationResults.join('\n')}\n\nNow proceeding with the task...`;
      
      this.state.chatHistory.push({
        role: 'assistant',
        content: explorationSummary,
        timestamp: new Date()
      });
      
      console.log(`[EnhancedAgent] 🔍 Exploration found ${explorationResults.length} insights`);
    }
  }

  /**
   * Resume from a checkpoint
   */
  async resumeFromCheckpoint(checkpoint: Checkpoint): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Agent is already running');
    }

    console.log(`[EnhancedAgent] Resuming from checkpoint at iteration ${checkpoint.iterations}`);

    this.state = {
      ...this.createInitialState(),
      isRunning: true,
      currentTask: checkpoint.task,
      iterations: checkpoint.iterations,
      chatHistory: checkpoint.chatHistory,
      currentPlan: checkpoint.currentPlan,
      currentStep: checkpoint.currentStep,
      completedSteps: checkpoint.completedSteps,
      filesModified: checkpoint.filesModified
    };

    try {
      await this.runLoop(checkpoint.task);
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.state.isRunning = false;
    }
  }

  stopAgent(): void {
    this.state.isRunning = false;
  }

  private async runLoop(userGoal: string): Promise<void> {
    while (this.state.isRunning && this.state.iterations < this.state.maxIterations) {
      this.state.iterations++;

      // Create checkpoint periodically
      if (this.state.iterations % this.CHECKPOINT_INTERVAL === 0) {
        this.createCheckpoint();
      }

      try {
        // Build optimized context using context manager
        const contextInfo = contextManager.buildContext(
          this.state.chatHistory,
          userGoal
        );

        // Build prompt with context
        let prompt = promptBuilder.buildPrompt(userGoal);
        
        // Add working memory context
        prompt = this.enhancePromptWithMemory(prompt, contextInfo);
        
        // Add planning context
        if (this.state.currentPlan.length > 0) {
          const planStatus = this.state.currentPlan.map((step, i) => {
            const status = i < this.state.currentStep ? '✅' : 
                          (i === this.state.currentStep ? '➡️' : '⬚');
            return `${status} ${i + 1}. ${step}`;
          }).join('\n');
          prompt += `\n\nCURRENT PLAN:\n${planStatus}\n\nContinue with step ${this.state.currentStep + 1}. Output JSON only.`;
        }

        // Call AI
        const response = await this.callAI(prompt);

        console.log(`[EnhancedAgent] Iteration ${this.state.iterations}, response length: ${response.length}`);
        this.callbacks.onIteration?.(this.state.iterations, response);

        // Add to history
        this.state.chatHistory.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });
        
        // Enforce history limit to prevent memory leaks
        if (this.state.chatHistory.length > this.MAX_HISTORY_MESSAGES) {
          const excess = this.state.chatHistory.length - this.MAX_HISTORY_MESSAGES;
          this.state.chatHistory = this.state.chatHistory.slice(excess);
          console.log(`[EnhancedAgent] Trimmed ${excess} old messages from history`);
        }

        // Parse response with enhanced error handling
        let parsedResponse: AgentResponse;
        try {
          parsedResponse = this.parseResponse(response);
          this.state.consecutiveParseErrors = 0;
        } catch (parseError: any) {
          this.state.consecutiveParseErrors++;
          console.error(`[EnhancedAgent] Parse error (${this.state.consecutiveParseErrors}/${this.MAX_PARSE_ERRORS}):`, parseError.message);
          
          if (this.state.consecutiveParseErrors >= this.MAX_PARSE_ERRORS) {
            this.callbacks.onError?.(`Model cannot produce valid JSON after ${this.MAX_PARSE_ERRORS} attempts. Stopping.`);
            return;
          }
          
          this.addCorrectionMessage(this.state.consecutiveParseErrors);
          continue;
        }

        // Handle response
        if (parsedResponse.error) {
          console.error('[EnhancedAgent] Response error:', parsedResponse.error);
          this.callbacks.onError?.(parsedResponse.error);
          continue;
        }

        // Handle plan
        if (parsedResponse.plan && parsedResponse.plan.length > 0) {
          this.state.currentPlan = parsedResponse.plan;
          this.state.currentStep = parsedResponse.current_step || 0;
          console.log('[EnhancedAgent] Plan created:', this.state.currentPlan);
          this.callbacks.onPlanCreated?.(this.state.currentPlan);
        }

        // Handle completion
        if (parsedResponse.done) {
          const summary = this.buildCompletionSummary(parsedResponse.message);
          this.callbacks.onComplete?.(summary);
          return;
        }

        // Handle tool calls with short-term memory integration
        if (parsedResponse.tool_calls && parsedResponse.tool_calls.length > 0) {
          this.state.consecutiveEmptyResponses = 0;
          
          // Filter out redundant operations using short-term memory
          const optimizedCalls = this.optimizeToolCalls(parsedResponse.tool_calls);
          
          if (optimizedCalls.length === 0) {
            // All calls were redundant
            this.state.chatHistory.push({
              role: 'user',
              content: 'All requested operations are cached. Please continue with the next step or mark as done.',
              timestamp: new Date()
            });
            continue;
          }
          
          // Execute optimized tool calls
          const results = await this.executeToolCallsWithVerification(optimizedCalls);

          // Track completed steps
          for (const call of optimizedCalls) {
            const stepDesc = `${call.name}(${call.parameters.path || call.parameters.command || '...'})`;
            this.state.completedSteps.push(stepDesc);
          }
          
          // Advance plan
          if (this.state.currentPlan.length > 0 && this.state.currentStep < this.state.currentPlan.length) {
            this.callbacks.onStepComplete?.(this.state.currentPlan[this.state.currentStep], this.state.currentStep);
            this.state.currentStep++;
          }

          // Add results to history
          const toolResultsText = results.map(r => {
            const resultStr = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
            const truncated = resultStr.length > 500 ? resultStr.substring(0, 500) + '...' : resultStr;
            return `${r.tool}: ${r.success ? '✅' : '❌'} ${truncated}`;
          }).join('\n');
          
          this.state.chatHistory.push({
            role: 'user',
            content: `Tool results:\n${toolResultsText}\n\nContinue with the next step. Output JSON only.`,
            timestamp: new Date()
          });
        } else {
          // No tools called
          this.state.consecutiveEmptyResponses++;
          
          if (this.state.consecutiveEmptyResponses >= this.MAX_EMPTY_RESPONSES) {
            this.state.chatHistory.push({
              role: 'user',
              content: `You haven't called any tools. Either:\n1. Call a tool: {"tool_calls": [...]}\n2. Mark complete: {"done": true, "message": "..."}\n\nWhat's next?`,
              timestamp: new Date()
            });
            
            if (this.state.consecutiveEmptyResponses >= this.MAX_EMPTY_RESPONSES + 2) {
              const summary = this.buildCompletionSummary('Task may be incomplete - agent stopped responding with actions');
              this.callbacks.onComplete?.(summary);
              return;
            }
          }
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[EnhancedAgent] Error in iteration ${this.state.iterations}:`, errorMsg);
        
        if (error instanceof FatalAgentError) {
          console.error('[EnhancedAgent] 🛑 FATAL ERROR - stopping agent loop');
          this.callbacks.onError?.(errorMsg);
          this.callbacks.onComplete?.(`Agent stopped: ${errorMsg}`);
          return;
        }
        
        this.state.chatHistory.push({
          role: 'user',
          content: `Error occurred: ${errorMsg}\n\nPlease fix the issue and continue. Output JSON only.`,
          timestamp: new Date()
        });
        
        this.callbacks.onError?.(`Iteration ${this.state.iterations}: ${errorMsg}`);
      }
    }

    if (this.state.iterations >= this.state.maxIterations) {
      const summary = this.buildCompletionSummary('Maximum iterations reached');
      this.callbacks.onError?.(summary);
    }
  }

  /**
   * Enhance prompt with short-term memory information
   */
  private enhancePromptWithMemory(prompt: string, contextInfo: string): string {
    const stats = shortTermMemory.getStats();
    
    let memorySection = '';
    
    if (stats.totalEntries > 0) {
      memorySection = `
## WORKING MEMORY STATUS
- Files cached: ${stats.fileReads}
- Cache hit rate: ${Math.round(stats.hitRate * 100)}%
- Bytes cached: ${stats.bytesCached}

${contextInfo}

IMPORTANT: If a file is listed as cached, you already have its content. 
Do NOT call read_file on cached files unless verifying a write.
`;
    }
    
    return prompt + memorySection;
  }

  /**
   * Optimize tool calls using short-term memory
   */
  private optimizeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    const optimized: ToolCall[] = [];
    
    for (const call of toolCalls) {
      if (call.name === 'read_file') {
        const path = call.parameters.path;
        const cached = shortTermMemory.getFileContent(path);
        
        if (cached !== null) {
          // File is cached, skip the read
          console.log(`[EnhancedAgent] ⚡ Skipping redundant read: ${path} (cached)`);
          this.callbacks.onCacheHit?.(path);
          
          // Add the cached content to history as if we read it
          this.state.chatHistory.push({
            role: 'user',
            content: `[From cache] File ${path}:\n${cached.substring(0, 1000)}${cached.length > 1000 ? '...' : ''}`,
            timestamp: new Date()
          });
          
          continue;
        }
      }
      
      optimized.push(call);
    }
    
    return optimized;
  }

  /**
   * Execute tool calls with verification
   */
  private async executeToolCallsWithVerification(
    toolCalls: ToolCall[]
  ): Promise<Array<{ tool: string; result: any; success: boolean }>> {
    const results: Array<{ tool: string; result: any; success: boolean }> = [];
    
    // Check for repetitive writes
    await this.checkRepetitiveWrites(toolCalls);
    
    // Execute tools
    for (const call of toolCalls) {
      this.callbacks.onToolCall?.(call);
      
      try {
        const result = await this.executeTool(call);
        results.push({ tool: call.name, result, success: true });
        this.callbacks.onToolResult?.(call.name, result);
        
        // Update short-term memory based on tool type
        this.updateMemoryFromTool(call, result);
        
        // Track file modifications
        if (call.name === 'write_file') {
          this.state.filesModified.push(call.parameters.path);
          this.state.pendingVerifications.push({
            path: call.parameters.path,
            content: call.parameters.content
          });
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Tool execution failed';
        results.push({ tool: call.name, result: { error: errorMsg }, success: false });
        this.callbacks.onToolResult?.(call.name, { error: errorMsg });
      }
    }
    
    return results;
  }

  /**
   * Update short-term memory based on tool execution
   */
  private updateMemoryFromTool(call: ToolCall, result: any): void {
    switch (call.name) {
      case 'read_file':
        if (result && !result.error) {
          shortTermMemory.cacheFileRead(call.parameters.path, result.content || result);
        }
        break;
        
      case 'write_file':
        shortTermMemory.recordFileWrite(call.parameters.path, call.parameters.content);
        break;
        
      case 'search_codebase':
        shortTermMemory.cacheSearchResult(call.parameters.query, result);
        break;
    }
  }

  /**
   * Check for repetitive write operations
   */
  private async checkRepetitiveWrites(toolCalls: ToolCall[]): Promise<void> {
    const writeCalls = toolCalls.filter(c => 
      c.name === 'write_file' || c.name === 'apply_diff'
    );
    
    for (const call of writeCalls) {
      const filePath = call.parameters.path;
      
      if (filePath === this.state.lastWrittenFile) {
        this.state.consecutiveSameFileWrites++;
        
        console.log(`[EnhancedAgent] ⚠️ Consecutive write to "${filePath}" (count: ${this.state.consecutiveSameFileWrites})`);
        
        if (this.state.consecutiveSameFileWrites === 2) {
          this.callbacks.onRepetitiveWriteWarning?.(filePath, this.state.consecutiveSameFileWrites);
        }
        
        if (this.state.consecutiveSameFileWrites >= 3) {
          throw new FatalAgentError(
            `🛑 Repetitive file write detected: "${filePath}" has been written ` +
            `${this.state.consecutiveSameFileWrites} times consecutively. ` +
            `Stopping to prevent infinite loop.`
          );
        }
      } else {
        this.state.consecutiveSameFileWrites = 1;
      }
      
      this.state.lastWrittenFile = filePath;
    }
  }

  /**
   * Execute a single tool
   */
  private async executeTool(call: ToolCall): Promise<any> {
    switch (call.name) {
      case 'list_files':
        return await window.agentAPI.listFiles(call.parameters.path || '.');

      case 'read_file':
        const readResult = await window.agentAPI.readFile(call.parameters.path);
        // Normalize response format
        if (readResult && readResult.error) {
          return { success: false, error: readResult.error };
        }
        return { 
          success: true, 
          path: call.parameters.path, 
          content: readResult.content || readResult,
          lines: readResult.lines || (readResult.content || '').split('\n').length
        };

      case 'write_file':
        const writeResult = await window.agentAPI.writeFile(call.parameters.path, call.parameters.content);
        if (writeResult && writeResult.error) {
          return { success: false, error: writeResult.error };
        }
        return { 
          success: true, 
          path: call.parameters.path, 
          written: true,
          size: call.parameters.content?.length || 0
        };

      case 'apply_diff':
        const diffResult = await window.agentAPI.applyDiff(call.parameters.path, call.parameters.diff);
        if (diffResult && diffResult.error) {
          return { success: false, error: diffResult.error };
        }
        return { success: true, path: call.parameters.path, patched: true };

      case 'run_command':
        return await window.agentAPI.agentRunCommand(
          call.parameters.command,
          call.parameters.cwd || '.',
          Math.min(call.parameters.timeout || 60, 300) // Cap timeout at 5 minutes
        );

      case 'search_codebase':
        return await window.agentAPI.agentSearchCodebase(
          call.parameters.query,
          {
            includePattern: call.parameters.include_pattern,
            excludePattern: call.parameters.exclude_pattern,
            maxResults: Math.min(call.parameters.max_results || 20, 100)
          }
        );

      case 'create_directory':
        // Create directory by writing a placeholder and then creating via API
        const dirPath = call.parameters.path;
        try {
          await window.agentAPI.createItem(dirPath, true);
          return { success: true, path: dirPath, created: true };
        } catch (error: any) {
          return { success: false, error: error.message || 'Failed to create directory' };
        }

      case 'str_replace':
        // Surgical edit - read file, replace text, write back
        const strReplacePath = call.parameters.path;
        const oldString = call.parameters.old_string;
        const newString = call.parameters.new_string;
        const replaceAll = call.parameters.replace_all || false;
        
        try {
          // Read current content
          const readResult = await window.agentAPI.readFile(strReplacePath);
          if (readResult.error) {
            return { success: false, error: `File not found: ${strReplacePath}` };
          }
          
          let content = readResult.content || '';
          
          if (!content.includes(oldString)) {
            return { 
              success: false, 
              error: `old_string not found in file. Make sure it matches exactly (including whitespace and indentation).`,
              hint: 'Try including more surrounding context to make the match unique.'
            };
          }
          
          // Count occurrences
          const occurrences = content.split(oldString).length - 1;
          
          if (occurrences > 1 && !replaceAll) {
            return {
              success: false,
              error: `old_string appears ${occurrences} times. Either include more context to make it unique, or set replace_all: true.`
            };
          }
          
          // Perform replacement
          if (replaceAll) {
            content = content.split(oldString).join(newString);
          } else {
            content = content.replace(oldString, newString);
          }
          
          // Write back
          const writeResult = await window.agentAPI.writeFile(strReplacePath, content);
          if (writeResult.error) {
            return { success: false, error: writeResult.error };
          }
          
          return { 
            success: true, 
            path: strReplacePath, 
            replacements: replaceAll ? occurrences : 1,
            message: `Replaced ${replaceAll ? occurrences : 1} occurrence(s)`
          };
        } catch (error: any) {
          return { success: false, error: error.message || 'str_replace failed' };
        }

      default:
        throw new Error(`Unknown tool: ${call.name}. Available tools: list_files, read_file, write_file, apply_diff, run_command, search_codebase, create_directory, str_replace`);
    }
  }

  /**
   * Create a checkpoint for recovery
   */
  private createCheckpoint(): void {
    const checkpoint: Checkpoint = {
      id: `checkpoint-${Date.now()}`,
      timestamp: new Date(),
      task: this.state.currentTask || '',
      iterations: this.state.iterations,
      completedSteps: [...this.state.completedSteps],
      currentPlan: [...this.state.currentPlan],
      currentStep: this.state.currentStep,
      filesModified: [...this.state.filesModified],
      chatHistory: [...this.state.chatHistory]
    };
    
    this.state.lastCheckpoint = checkpoint;
    this.callbacks.onCheckpoint?.(checkpoint);
    
    console.log(`[EnhancedAgent] 💾 Checkpoint created at iteration ${this.state.iterations}`);
  }

  /**
   * Run final verification on all modified files
   */
  private async runFinalVerification(): Promise<void> {
    if (this.state.pendingVerifications.length === 0) {
      return;
    }
    
    console.log(`[EnhancedAgent] 🔍 Running final verification on ${this.state.pendingVerifications.length} files`);
    
    const result = await verifyChanges(this.state.pendingVerifications);
    
    for (const check of result.checks) {
      this.callbacks.onVerification?.({
        path: check.name,
        success: check.passed,
        issues: check.passed ? [] : [check.message]
      });
    }
    
    if (!result.success) {
      console.warn('[EnhancedAgent] ⚠️ Some verifications failed:', result.suggestions);
    }
    
    // Clear pending verifications
    this.state.pendingVerifications = [];
  }

  /**
   * Parse AI response with enhanced error handling
   */
  private parseResponse(response: string): AgentResponse {
    console.log("=== PARSING RESPONSE ===");
    console.log(response.substring(0, 500));
    
    // Try multiple parsing strategies
    const strategies = [
      () => this.parseFromCodeBlock(response),
      () => this.parseFromRawJson(response),
      () => this.parseWithRepair(response),
      () => this.parseFromNaturalLanguage(response)
    ];
    
    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result) return result;
      } catch (e) {
        // Try next strategy
      }
    }
    
    return {
      error: `Model returned text instead of JSON. Response: "${response.substring(0, 200)}..."`
    };
  }

  private parseFromCodeBlock(text: string): AgentResponse | null {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      const parsed = JSON.parse(match[1].trim());
      return this.validateParsedResponse(parsed);
    }
    return null;
  }

  private parseFromRawJson(text: string): AgentResponse | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0].trim());
      return this.validateParsedResponse(parsed);
    }
    return null;
  }

  private parseWithRepair(text: string): AgentResponse | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    
    let cleaned = match[0]
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/'/g, '"')
      .replace(/(\w+):/g, '"$1":');
    
    const parsed = JSON.parse(cleaned);
    return this.validateParsedResponse(parsed);
  }

  private parseFromNaturalLanguage(text: string): AgentResponse | null {
    const lower = text.toLowerCase();
    if (lower.includes('completed') || lower.includes('finished') || lower.includes('done')) {
      if (lower.includes('success')) {
        return { done: true, message: "Task completed successfully" };
      }
    }
    return null;
  }

  private validateParsedResponse(parsed: any): AgentResponse {
    if (parsed.done === true) {
      return { done: true, message: parsed.message };
    }
    if (parsed.error) {
      return { error: parsed.error };
    }
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      const validCalls = parsed.tool_calls.filter(validateToolCall);
      if (validCalls.length > 0) {
        return { 
          tool_calls: validCalls,
          plan: parsed.plan,
          current_step: parsed.current_step
        };
      }
    }
    return { error: `Invalid response structure: ${JSON.stringify(parsed).substring(0, 200)}...` };
  }

  private addCorrectionMessage(errorCount: number): void {
    const corrections = [
      `Your response was not valid JSON. Respond with ONLY a JSON object like: {"tool_calls": [...]}`,
      `CRITICAL: Output ONLY JSON. No text. Start with { end with }. Example: {"tool_calls": [{"name": "write_file", "parameters": {"path": "test.js", "content": "console.log('hi')"}}]}`,
      `You keep failing to output JSON. Here's exactly what to do:\n1. No explanations\n2. No markdown\n3. Just: {"tool_calls": [{"name": "TOOL_NAME", "parameters": {...}}]}\nTry again.`,
      `FINAL WARNING: Pure JSON only. {"done": true, "message": "..."} or {"tool_calls": [...]}`
    ];
    
    this.state.chatHistory.push({
      role: 'user',
      content: corrections[Math.min(errorCount - 1, corrections.length - 1)],
      timestamp: new Date()
    });
  }

  private buildCompletionSummary(message?: string): string {
    let summary = message || 'Task completed';
    
    // Add memory stats
    const memStats = shortTermMemory.getStats();
    if (memStats.totalEntries > 0) {
      summary += `\n\n📊 Memory Stats:`;
      summary += `\n   - Cache hits: ${Math.round(memStats.hitRate * 100)}%`;
      summary += `\n   - Files cached: ${memStats.fileReads}`;
    }
    
    if (this.state.completedSteps.length > 0) {
      summary += `\n\n📋 Steps completed (${this.state.completedSteps.length}):`;
      const stepsToShow = this.state.completedSteps.slice(-10);
      if (this.state.completedSteps.length > 10) {
        summary += `\n   ... (${this.state.completedSteps.length - 10} earlier steps)`;
      }
      summary += '\n' + stepsToShow.map((s, i) => `   ${i + 1}. ${s}`).join('\n');
    }
    
    if (this.state.filesModified.length > 0) {
      summary += `\n\n📁 Files modified: ${[...new Set(this.state.filesModified)].join(', ')}`;
    }
    
    if (this.state.currentPlan.length > 0) {
      const completed = this.state.currentStep;
      const total = this.state.currentPlan.length;
      summary += `\n\n📊 Plan progress: ${completed}/${total} steps`;
    }
    
    return summary;
  }

  private async callAI(prompt: string): Promise<string> {
    console.log(`[EnhancedAgent] Calling AI with model: ${this.selectedModel}`);

    const result = await window.agentAPI.chat(prompt, {
      agent_mode: true,
      use_agent_loop: true,
      model: this.selectedModel
    });

    if (!result.success) {
      throw new Error('AI call failed');
    }

    if (!result.response || result.response.trim().length === 0) {
      throw new Error('Empty response from AI');
    }

    return result.response;
  }

  getState(): EnhancedAgentState {
    return { ...this.state };
  }

  getLastCheckpoint(): Checkpoint | null {
    return this.state.lastCheckpoint;
  }
}

// Export singleton instance
export const enhancedAgentLoop = new EnhancedAgentLoop();

