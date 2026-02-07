/**
 * AgentPrime - Enhanced Autonomous Agent Mode
 * With diff preview, step approval, rollback, and progress indicators
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class AgentMode {
    constructor(workspacePath, ollamaUrl, ollamaModel, apiKey, eventEmitter = null, mirrorSystem = null) {
        this.workspacePath = workspacePath;
        this.ollamaUrl = ollamaUrl;
        this.ollamaModel = ollamaModel;
        this.apiKey = apiKey;
        this.eventEmitter = eventEmitter; // For sending progress updates to renderer
        this.platform = process.platform;
        this.isWindows = process.platform === 'win32';
        this.mirrorSystem = mirrorSystem; // Mirror Intelligence System
        
        // Enhanced state management
        this.pendingActions = [];      // Actions waiting for approval
        this.executedActions = [];     // Actions that have been applied
        this.backups = new Map();      // File backups for rollback: path -> originalContent
        this.sessionId = Date.now().toString();
    }

    // Emit progress event to renderer
    emit(event, data) {
        if (this.eventEmitter) {
            this.eventEmitter(event, { sessionId: this.sessionId, ...data });
        }
    }

    // ===== FILE OPERATIONS =====
    
    async readFile(filePath) {
        const fullPath = path.join(this.workspacePath, filePath);
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            return { success: true, content, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async fileExists(filePath) {
        const fullPath = path.join(this.workspacePath, filePath);
        try {
            await fs.access(fullPath);
            return { success: true, exists: true };
        } catch {
            return { success: true, exists: false };
        }
    }

    async listDir(dirPath = '.') {
        const fullPath = path.join(this.workspacePath, dirPath);
        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            const items = entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                path: path.join(dirPath, entry.name).replace(/\\/g, '/')
            }));
            return { success: true, items };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async searchFiles(query, filePattern = '*') {
        const results = [];
        try {
            const cmd = this.isWindows
                ? `cd "${this.workspacePath}" && findstr /S /I /N "${query}" ${filePattern}`
                : `cd "${this.workspacePath}" && grep -rn "${query}" --include="${filePattern}"`;
            const { stdout } = await execAsync(cmd, { 
                shell: this.isWindows ? 'cmd.exe' : '/bin/bash',
                maxBuffer: 10 * 1024 * 1024 
            });
            const lines = stdout.split('\n').filter(l => l.trim());
            for (const line of lines.slice(0, 50)) {
                const match = line.match(/^(.+?):(\d+):(.+)$/);
                if (match) {
                    results.push({ file: match[1], line: parseInt(match[2]), content: match[3] });
                }
            }
            return { success: true, results };
        } catch (error) {
            return { success: false, error: error.message, results: [] };
        }
    }

    async runCommand(command) {
        try {
            const shell = this.isWindows ? 'cmd.exe' : '/bin/bash';
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.workspacePath,
                timeout: 30000,
                shell
            });
            return { success: true, stdout, stderr };
        } catch (error) {
            return { success: false, error: error.message, stdout: error.stdout, stderr: error.stderr };
        }
    }

    // ===== DIFF GENERATION =====

    generateDiff(oldContent, newContent, filePath) {
        const oldLines = (oldContent || '').split('\n');
        const newLines = (newContent || '').split('\n');
        const diff = [];
        
        // Simple line-by-line diff
        const maxLines = Math.max(oldLines.length, newLines.length);
        let changes = 0;
        let additions = 0;
        let deletions = 0;
        
        for (let i = 0; i < maxLines; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];
            
            if (oldLine === undefined) {
                diff.push({ type: 'add', line: i + 1, content: newLine });
                additions++;
            } else if (newLine === undefined) {
                diff.push({ type: 'remove', line: i + 1, content: oldLine });
                deletions++;
            } else if (oldLine !== newLine) {
                diff.push({ type: 'remove', line: i + 1, content: oldLine });
                diff.push({ type: 'add', line: i + 1, content: newLine });
                changes++;
            } else {
                // Context lines (unchanged) - only include a few around changes
                if (diff.length > 0 && diff[diff.length - 1].type !== 'context') {
                    diff.push({ type: 'context', line: i + 1, content: oldLine });
                }
            }
        }
        
        return {
            filePath,
            oldContent,
            newContent,
            diff: diff.slice(0, 100), // Limit diff size
            stats: { additions, deletions, changes },
            isNewFile: !oldContent,
            isDelete: !newContent
        };
    }

    // ===== PENDING ACTION SYSTEM =====

    async queueWriteFile(filePath, content, description = '') {
        const fullPath = path.join(this.workspacePath, filePath);
        let oldContent = null;
        
        try {
            oldContent = await fs.readFile(fullPath, 'utf-8');
        } catch {
            // File doesn't exist yet
        }
        
        const diffData = this.generateDiff(oldContent, content, filePath);
        
        const action = {
            id: `${this.sessionId}-${this.pendingActions.length}`,
            type: 'write_file',
            filePath,
            content,
            oldContent,
            description: description || `Update ${filePath}`,
            diff: diffData,
            status: 'pending', // pending, approved, rejected, applied
            timestamp: Date.now()
        };
        
        this.pendingActions.push(action);
        this.emit('action-queued', { action: this.sanitizeAction(action) });
        
        return { success: true, actionId: action.id, queued: true };
    }

    async queueCreateFile(filePath, content, description = '') {
        const action = {
            id: `${this.sessionId}-${this.pendingActions.length}`,
            type: 'create_file',
            filePath,
            content,
            oldContent: null,
            description: description || `Create ${filePath}`,
            diff: this.generateDiff(null, content, filePath),
            status: 'pending',
            timestamp: Date.now()
        };
        
        this.pendingActions.push(action);
        this.emit('action-queued', { action: this.sanitizeAction(action) });
        
        return { success: true, actionId: action.id, queued: true };
    }

    async queueCreateDirectory(dirPath, description = '') {
        const action = {
            id: `${this.sessionId}-${this.pendingActions.length}`,
            type: 'create_directory',
            dirPath,
            description: description || `Create folder ${dirPath}`,
            status: 'pending',
            timestamp: Date.now()
        };
        
        this.pendingActions.push(action);
        this.emit('action-queued', { action: this.sanitizeAction(action) });
        
        return { success: true, actionId: action.id, queued: true };
    }

    // Sanitize action for sending to renderer (remove large content)
    sanitizeAction(action) {
        return {
            ...action,
            content: action.content ? `${action.content.substring(0, 500)}${action.content.length > 500 ? '...' : ''}` : null,
            oldContent: action.oldContent ? `${action.oldContent.substring(0, 200)}...` : null
        };
    }

    // ===== APPROVAL SYSTEM =====

    async approveAction(actionId) {
        const action = this.pendingActions.find(a => a.id === actionId);
        if (!action) return { success: false, error: 'Action not found' };
        if (action.status !== 'pending') return { success: false, error: 'Action already processed' };
        
        action.status = 'approved';
        const result = await this.executeAction(action);
        
        if (result.success) {
            action.status = 'applied';
            this.executedActions.push(action);
        } else {
            action.status = 'failed';
            action.error = result.error;
        }
        
        this.emit('action-updated', { action: this.sanitizeAction(action) });
        return result;
    }

    async rejectAction(actionId) {
        const action = this.pendingActions.find(a => a.id === actionId);
        if (!action) return { success: false, error: 'Action not found' };
        
        action.status = 'rejected';
        this.emit('action-updated', { action: this.sanitizeAction(action) });
        return { success: true };
    }

    async approveAll() {
        const results = [];
        for (const action of this.pendingActions) {
            if (action.status === 'pending') {
                const result = await this.approveAction(action.id);
                results.push({ actionId: action.id, ...result });
            }
        }
        return { success: true, results };
    }

    async rejectAll() {
        for (const action of this.pendingActions) {
            if (action.status === 'pending') {
                action.status = 'rejected';
                this.emit('action-updated', { action: this.sanitizeAction(action) });
            }
        }
        return { success: true };
    }

    // ===== ACTION EXECUTION =====

    async executeAction(action) {
        const fullPath = path.join(this.workspacePath, action.filePath || action.dirPath);
        
        try {
            switch (action.type) {
                case 'write_file':
                case 'create_file':
                    // Backup existing file
                    if (action.oldContent !== null) {
                        this.backups.set(action.filePath, action.oldContent);
                    }
                    await fs.mkdir(path.dirname(fullPath), { recursive: true });
                    await fs.writeFile(fullPath, action.content, 'utf-8');
                    return { success: true, path: action.filePath };
                    
                case 'create_directory':
                    await fs.mkdir(fullPath, { recursive: true });
                    return { success: true, path: action.dirPath };
                    
                default:
                    return { success: false, error: `Unknown action type: ${action.type}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ===== ROLLBACK SYSTEM =====

    async rollback(actionId) {
        const action = this.executedActions.find(a => a.id === actionId);
        if (!action) return { success: false, error: 'Executed action not found' };
        
        const fullPath = path.join(this.workspacePath, action.filePath || action.dirPath);
        
        try {
            if (action.type === 'write_file' || action.type === 'create_file') {
                if (action.oldContent !== null) {
                    // Restore original content
                    await fs.writeFile(fullPath, action.oldContent, 'utf-8');
                } else {
                    // Delete the created file
                    await fs.unlink(fullPath);
                }
            } else if (action.type === 'create_directory') {
                // Only remove if empty
                try {
                    await fs.rmdir(fullPath);
                } catch {
                    // Directory not empty, skip
                }
            }
            
            action.status = 'rolled_back';
            this.emit('action-updated', { action: this.sanitizeAction(action) });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async rollbackAll() {
        // Rollback in reverse order
        const results = [];
        for (let i = this.executedActions.length - 1; i >= 0; i--) {
            const action = this.executedActions[i];
            if (action.status === 'applied') {
                const result = await this.rollback(action.id);
                results.push({ actionId: action.id, ...result });
            }
        }
        return { success: true, results };
    }

    // ===== TOOL DESCRIPTIONS FOR LLM =====

    getToolDescriptions() {
        return `You have access to these tools:

1. read_file(filePath) - Read a file's contents
2. write_file(filePath, content, description) - Write or update a file
3. create_file(filePath, content, description) - Create a NEW file
4. create_directory(dirPath, description) - Create a directory
5. list_directory(dirPath) - List files in a directory
6. search_files(query, pattern) - Search for text across files
7. run_command(command) - Execute a shell command
8. file_exists(filePath) - Check if a file exists

IMPORTANT: All write operations are QUEUED for user approval before execution!
The user will see a diff preview and can approve/reject each change.

Format tool calls as JSON:
{
  "tool": "write_file",
  "args": { "filePath": "src/index.js", "content": "...", "description": "Add main entry point" }
}

For multiple actions:
{
  "actions": [
    { "tool": "create_directory", "args": { "dirPath": "src/components", "description": "Create components folder" } },
    { "tool": "create_file", "args": { "filePath": "src/App.js", "content": "...", "description": "Main App component" } }
  ]
}`;
    }

    // ===== TOOL PARSING & EXECUTION =====

    parseToolCalls(response) {
        const toolCalls = [];
        
        // Format 1: JSON with actions array
        const actionsMatch = response.match(/\{[\s\S]*"actions"[\s\S]*\[[\s\S]*\][\s\S]*\}/);
        if (actionsMatch) {
            try {
                const parsed = JSON.parse(actionsMatch[0]);
                if (parsed.actions && Array.isArray(parsed.actions)) {
                    return parsed.actions;
                }
            } catch {}
        }
        
        // Format 2: Single JSON tool call
        const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.tool) {
                    return [parsed];
                }
            } catch {}
        }
        
        // Format 3: Qwen3-coder raw tool format - "call write_file with {"filePath": "test.js", "content": "..."}"
        const rawToolPattern = /call\s+(\w+)\s+with\s+(\{[\s\S]*?\})/gi;
        let match;
        while ((match = rawToolPattern.exec(response)) !== null) {
            try {
                const args = JSON.parse(match[2]);
                toolCalls.push({
                    tool: match[1],
                    args: args
                });
            } catch (e) {
                // Invalid JSON, skip
            }
        }
        
        // Format 4: Function-style without quotes: write_file({filePath: "test.js", content: "..."})
        const funcStylePattern = /(\w+)\s*\(\s*\{([^}]+)\}\s*\)/g;
        while ((match = funcStylePattern.exec(response)) !== null) {
            try {
                // Try to parse as JSON object
                const objStr = '{' + match[2] + '}';
                const args = JSON.parse(objStr);
                toolCalls.push({
                    tool: match[1],
                    args: args
                });
            } catch (e) {
                // Invalid, skip
            }
        }
        
        // Format 5: JSON function calling (OpenAI/Anthropic style)
        const jsonFuncPattern = /\{"tool":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]+\})\}/g;
        while ((match = jsonFuncPattern.exec(response)) !== null) {
            try {
                const args = JSON.parse(match[2]);
                toolCalls.push({
                    tool: match[1],
                    args: args
                });
            } catch (e) {
                // Invalid JSON, skip
            }
        }
        
        // Format 6: XML-style tool calls
        const xmlPattern = /<tool_call>([^<]+)<\/tool_call>\s*<arguments>(\{[^}]+\})<\/arguments>/g;
        while ((match = xmlPattern.exec(response)) !== null) {
            try {
                const args = JSON.parse(match[2]);
                toolCalls.push({
                    tool: match[1].trim(),
                    args: args
                });
            } catch (e) {
                // Invalid JSON, skip
            }
        }
        
        return toolCalls;
    }

    async executeTool(toolCall, queueWrites = true) {
        const { tool, args } = toolCall;
        
        switch (tool) {
            case 'read_file':
                return await this.readFile(args.filePath);
            case 'write_file':
                if (queueWrites) {
                    return await this.queueWriteFile(args.filePath, args.content, args.description);
                }
                return await this.directWriteFile(args.filePath, args.content);
            case 'create_file':
                if (queueWrites) {
                    return await this.queueCreateFile(args.filePath, args.content, args.description);
                }
                return await this.directCreateFile(args.filePath, args.content);
            case 'create_directory':
                if (queueWrites) {
                    return await this.queueCreateDirectory(args.dirPath, args.description);
                }
                return await this.directCreateDirectory(args.dirPath);
            case 'list_directory':
                return await this.listDir(args.dirPath || '.');
            case 'search_files':
                return await this.searchFiles(args.query, args.pattern);
            case 'run_command':
                return await this.runCommand(args.command);
            case 'file_exists':
                return await this.fileExists(args.filePath);
            default:
                return { success: false, error: `Unknown tool: ${tool}` };
        }
    }

    // Direct write methods (bypass queue for immediate execution)
    async directWriteFile(filePath, content) {
        const fullPath = path.join(this.workspacePath, filePath);
        try {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content, 'utf-8');
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async directCreateFile(filePath, content = '') {
        const fullPath = path.join(this.workspacePath, filePath);
        try {
            await fs.access(fullPath);
            return { success: false, error: 'File already exists' };
        } catch {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content, 'utf-8');
            return { success: true, path: filePath };
        }
    }

    async directCreateDirectory(dirPath) {
        const fullPath = path.join(this.workspacePath, dirPath);
        try {
            await fs.mkdir(fullPath, { recursive: true });
            return { success: true, path: dirPath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ===== INTENT CLASSIFICATION =====
    
    classifyIntent(userQuery) {
        const lowerQuery = (userQuery || '').toLowerCase();
        
        // Action-required patterns
        const actionPatterns = {
            fileOperations: /add|create|build|write|make|generate|modify|update|edit|delete|remove/i,
            execution: /open|run|execute|start|launch|install/i,
            systemCommands: /explorer|folder|directory|command|shell/i
        };
        
        const requiresAction = 
            actionPatterns.fileOperations.test(lowerQuery) ||
            actionPatterns.execution.test(lowerQuery) ||
            actionPatterns.systemCommands.test(lowerQuery);
        
        // Determine required tool type
        let requiredTool = null;
        if (actionPatterns.fileOperations.test(lowerQuery)) {
            requiredTool = 'write_file';
        } else if (actionPatterns.execution.test(lowerQuery)) {
            if (lowerQuery.match(/python|\.py|pip/i)) {
                requiredTool = 'run_python';
            } else {
                requiredTool = 'run_command';
            }
        }
        
        return {
            requiresAction,
            requiredTool,
            isFileOperation: actionPatterns.fileOperations.test(lowerQuery),
            isExecution: actionPatterns.execution.test(lowerQuery)
        };
    }

    // ===== MAIN AGENT LOOP =====

    async run(task, maxIterations = 10, autoApprove = false) {
        this.emit('agent-started', { task, maxIterations });
        
        // Get learned patterns if mirror system is available
        let patternGuidance = '';
        if (this.mirrorSystem && this.mirrorSystem.mirrorMemory) {
            try {
                const patterns = await this.mirrorSystem.mirrorMemory.getRelevantPatterns(task, 5);
                if (patterns.length > 0) {
                    patternGuidance = `\n--- Learned Patterns (from Opus 4.5 MAX) ---\n`;
                    for (const pattern of patterns) {
                        patternGuidance += `\n• ${pattern.type || 'pattern'}: ${pattern.description || 'N/A'}\n`;
                        if (pattern.confidence) {
                            patternGuidance += `  Confidence: ${(pattern.confidence * 100).toFixed(0)}%\n`;
                        }
                    }
                    patternGuidance += `\nApply these patterns when appropriate.\n`;
                }
            } catch (error) {
                console.error('Error getting patterns:', error);
            }
        }
        
        const systemPrompt = `🦖✨ AgentPrime - Autonomous Coding Agent

You are an autonomous coding agent with REAL filesystem access. Transform the user's request into working code.

TASK: "${task}"

🚨 HARD RULES - NO EXCEPTIONS:

1. **If user asks to add, create, modify, or update a file, you MUST create or edit a real file in the workspace.**
   - Outputting code in chat alone is a FAILURE.
   - The task is NOT complete until the file exists on disk.
   - Code blocks = explanation only. File edits = real action.

2. **Always use tools to modify the actual project on disk:**
   - Create files directly using write_file tool
   - Edit existing files using write_file tool
   - Do NOT ask the user to copy/paste unless explicitly requested

3. **Infer reasonable defaults:**
   - If no filename given, choose one (e.g., "test.js" for test files)
   - If no folder given, use workspace root or create sensible structure
   - Do NOT stall waiting for clarification unless absolutely required

4. **After modifying files, explicitly state what changed:**
   - "Created \`tests/destiny-map.test.js\`"
   - "Updated \`package.json\` with test script"

5. **Running code is separate from editing code:**
   - Do NOT attempt to run files unless user asks
   - If asked to run, use run_command or run_python tools
   - CSS, JSON, config files are NOT runnable - warn if user tries

6. **System commands MUST be executed:**
   - "open explorer" → run_command({"command": "explorer ."})
   - "open folder" → run_command({"command": "explorer ."})
   - Do NOT just show the command - EXECUTE IT

7. **UI WIRING - For HTML/CSS/JS projects:**
   - Every <button> MUST have onclick="fn()" OR an addEventListener in JS
   - Every CSS class used in HTML MUST be defined in styles.css
   - If HTML shows UI elements (score, lives, game over screen), JS MUST control them
   - Before completing: verify buttons work, all CSS classes exist, all displays update
   - NEVER create HTML with features the JS doesn't implement

${this.getToolDescriptions()}
${patternGuidance}

MANDATORY WORKFLOW:
When user says "add", "create", "build", "make", "write", "open", "run":
1. IMMEDIATELY call the appropriate tool (write_file, run_command, run_python)
2. DO NOT show code blocks as the primary response
3. DO NOT ask for confirmation - just do it
4. Report what you did after completion

🚨🚨🚨 CRITICAL VIOLATION EXAMPLES - DO NOT DO THIS 🚨🚨🚨

VIOLATION #1: Showing code blocks without tool calls
❌ WRONG:
"Here's the code:
\`\`\`python
print('hello')
\`\`\`"

✅ CORRECT:
Use tool_calls: {"tool": "write_file", "args": {"filePath": "app.py", "content": "print('hello')"}}

VIOLATION #2: Asking for confirmation
❌ WRONG: "Should I create this file?"
✅ CORRECT: Just call write_file tool immediately

VIOLATION #3: Explaining what you would do
❌ WRONG: "I would create a file called..."
✅ CORRECT: Call write_file tool, then explain what you did

IF YOU VIOLATE THESE RULES, THE SYSTEM WILL REJECT YOUR RESPONSE AND FORCE YOU TO RETRY WITH STRICTER INSTRUCTIONS.

Platform: ${this.platform} (${this.isWindows ? 'Windows' : 'Unix'})`;

        let iteration = 0;
        let context = '';
        
        // Classify user intent
        const intent = this.classifyIntent(task);
        
        while (iteration < maxIterations) {
            iteration++;
            this.emit('iteration-start', { iteration, maxIterations });
            
            const prompt = `${systemPrompt}\n\n${context}\n\nIteration ${iteration}/${maxIterations}. What's next?`;
            
            this.emit('thinking', { message: 'AI is thinking...' });
            const response = await this.callLLM(prompt, 0); // Temperature 0 for deterministic tool calling
            this.emit('response', { message: response.substring(0, 500) });
            
            const toolCalls = this.parseToolCalls(response);
            
            // 🔴 TOOL-CALL-OR-FAIL ENFORCEMENT
            // Cursor rule: If intent requires action AND no tool calls → model is WRONG
            if (intent.requiresAction && toolCalls.length === 0) {
                const errorMessage = `Tool-call-or-fail violation: User intent requires action but no tool calls were made.
Intent: ${JSON.stringify(intent)}
Required tool: ${intent.requiredTool || 'any'}
User query: "${task}"
Response: ${response.substring(0, 200)}...`;
                
                console.error(`❌ ${errorMessage}`);
                this.emit('error', { message: errorMessage });
                
                // Cursor THROWS - it doesn't politely continue
                throw new Error(errorMessage);
            }
            
            if (toolCalls.length === 0) {
                // No more actions, task complete (only OK if no action was required)
                this.emit('agent-complete', { 
                    message: 'Task planning complete!',
                    pendingActions: this.pendingActions.map(a => this.sanitizeAction(a))
                });
                
                return {
                    success: true,
                    message: response,
                    pendingActions: this.pendingActions,
                    executedActions: this.executedActions
                };
            }
            
            // Execute tools (writes are queued)
            const results = [];
            for (const toolCall of toolCalls) {
                this.emit('tool-call', { tool: toolCall.tool, args: toolCall.args });
                const result = await this.executeTool(toolCall, !autoApprove);
                results.push({ toolCall, result });
                
                // If auto-approve and it was queued, approve immediately
                if (autoApprove && result.queued) {
                    await this.approveAction(result.actionId);
                }
            }
            
            // Mirror system: Process feedback loop if available
            if (this.mirrorSystem && this.mirrorSystem.feedbackLoop && response) {
                try {
                    // Start or continue feedback loop for this iteration
                    const activeLoops = this.mirrorSystem.feedbackLoop.getAllActiveLoops();
                    if (activeLoops.length > 0) {
                        // Continue existing loop
                        const loop = activeLoops[0];
                        await this.mirrorSystem.feedbackLoop.processIteration(loop.loopId, response);
                    } else {
                        // Start new loop
                        await this.mirrorSystem.feedbackLoop.startLoop(task, response);
                    }
                } catch (mirrorError) {
                    console.error('Mirror feedback loop error:', mirrorError);
                }
            }
            
            context += `\n\nIteration ${iteration} results:\n${JSON.stringify(results, null, 2)}`;
        }
        
        // Complete feedback loop if active
        if (this.mirrorSystem && this.mirrorSystem.feedbackLoop) {
            try {
                const activeLoops = this.mirrorSystem.feedbackLoop.getAllActiveLoops();
                for (const loop of activeLoops) {
                    await this.mirrorSystem.feedbackLoop.completeLoop(loop.loopId);
                }
            } catch (mirrorError) {
                console.error('Error completing feedback loop:', mirrorError);
            }
        }
        
        this.emit('agent-complete', { 
            message: 'Max iterations reached',
            pendingActions: this.pendingActions.map(a => this.sanitizeAction(a))
        });
        
        return {
            success: true,
            message: 'Max iterations reached',
            pendingActions: this.pendingActions,
            executedActions: this.executedActions
        };
    }

    async callLLM(prompt, temperature = 0) {
        // Temperature 0 for deterministic tool calling (Qwen3-Coder works best with 0)
        const axios = require('axios');
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        try {
            const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
                model: this.ollamaModel,
                prompt,
                stream: false,
                options: { temperature, num_predict: 4096 }
            }, { headers, timeout: 300000 });

            return response.data.response || '';
        } catch (error) {
            throw new Error(`LLM call failed: ${error.message}`);
        }
    }

    // Get current state for UI
    getState() {
        return {
            sessionId: this.sessionId,
            pendingActions: this.pendingActions.map(a => this.sanitizeAction(a)),
            executedActions: this.executedActions.map(a => this.sanitizeAction(a)),
            canRollback: this.executedActions.some(a => a.status === 'applied')
        };
    }
}

module.exports = AgentMode;
