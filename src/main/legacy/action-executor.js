/**
 * Action Executor - Executes actions from AI chat commands
 * Makes AgentPrime work like Cursor - you tell it to do something, it does it!
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ActionExecutor {
    constructor(workspacePath) {
        this.workspacePath = workspacePath;
    }

    /**
     * Clean filename - remove invalid characters and normalize
     */
    cleanFileName(fileName) {
        if (!fileName) return null;
        
        // Remove common invalid characters for filenames
        let cleaned = fileName
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid chars
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .replace(/_{2,}/g, '_') // Remove multiple underscores
            .trim();
        
        // If it looks like a question or sentence, it's probably not a filename
        if (cleaned.includes('?') || cleaned.length > 50 || cleaned.split(' ').length > 5) {
            return null;
        }
        
        // Ensure it has an extension if it looks like a file request
        if (!cleaned.includes('.') && (cleaned.includes('bat') || cleaned.includes('file'))) {
            cleaned = 'run.bat';
        }
        
        return cleaned || null;
    }

    /**
     * Detect if a message contains action commands
     */
    detectAction(message) {
        const lowerMessage = message.toLowerCase();
        
        // Action patterns - more precise
        const patterns = {
            // Match: "create file named X" or "create X.bat" or "create a .bat file"
            createFile: /create\s+(?:a\s+)?(?:file\s+)?(?:named\s+)?['"]?([a-zA-Z0-9_\-\.]+\.(?:bat|js|ts|py|html|css|json|md|txt|xml|yaml|yml))['"]?/i,
            createBat: /create\s+(?:a\s+)?\.bat\s+(?:file\s+)?(?:named\s+)?['"]?([a-zA-Z0-9_\-]+\.bat)?['"]?|make\s+(?:a\s+)?\.bat\s+(?:file\s+)?(?:named\s+)?['"]?([a-zA-Z0-9_\-]+\.bat)?['"]?/i,
            writeFile: /write\s+(?:to\s+)?(?:file\s+)?['"]?([a-zA-Z0-9_\-\.\/]+\.(?:bat|js|ts|py|html|css|json|md|txt))['"]?|save\s+(?:to\s+)?(?:file\s+)?['"]?([a-zA-Z0-9_\-\.\/]+\.(?:bat|js|ts|py|html|css|json|md|txt))['"]?/i,
            runCommand: /run\s+(?:command\s+)?['"]([^'"]+)['"]|execute\s+['"]([^'"]+)['"]/i,
            installPackage: /install\s+(?:package\s+)?['"]?([a-zA-Z0-9_\-@\/]+)['"]?|npm\s+install\s+['"]?([a-zA-Z0-9_\-@\/]+)['"]?/i
        };

        // Check for .bat file creation (most common)
        if (lowerMessage.includes('.bat') || lowerMessage.includes('bat file')) {
            const batMatch = message.match(patterns.createBat);
            let fileName = null;
            if (batMatch) {
                fileName = this.cleanFileName(batMatch[1] || batMatch[2]);
            }
            // If no explicit name, use default
            if (!fileName) {
                fileName = 'run.bat';
            }
            return {
                type: 'createFile',
                fileName: fileName,
                action: 'createFile'
            };
        }

        // Check for other file creation
        if (patterns.createFile.test(message)) {
            const match = message.match(patterns.createFile);
            const fileName = this.cleanFileName(match[1] || match[2]);
            if (fileName) {
                return {
                    type: 'createFile',
                    fileName: fileName,
                    action: 'createFile'
                };
            }
        }

        // Check for write/save
        if (patterns.writeFile.test(message)) {
            const match = message.match(patterns.writeFile);
            const fileName = this.cleanFileName(match[1] || match[2]);
            if (fileName) {
                return {
                    type: 'writeFile',
                    fileName: fileName,
                    action: 'writeFile'
                };
            }
        }

        // Check for command execution
        if (patterns.runCommand.test(message)) {
            const match = message.match(patterns.runCommand);
            const command = match[1] || match[2];
            return {
                type: 'runCommand',
                command: command,
                action: 'runCommand'
            };
        }

        // Check for package installation
        if (patterns.installPackage.test(message)) {
            const match = message.match(patterns.installPackage);
            const packageName = match[1] || match[2];
            return {
                type: 'installPackage',
                packageName: packageName,
                action: 'installPackage'
            };
        }

        return null;
    }

    /**
     * Execute an action based on AI response
     */
    async executeAction(action, content, workspacePath) {
        this.workspacePath = workspacePath || this.workspacePath;
        
        if (!this.workspacePath) {
            return { success: false, error: 'No workspace open' };
        }

        try {
            switch (action.type) {
                case 'createFile':
                    return await this.createFile(action.fileName, content);
                case 'writeFile':
                    return await this.writeToFile(action.fileName, content);
                case 'runCommand':
                    return await this.runCommand(action.command);
                case 'installPackage':
                    return await this.installPackage(action.packageName);
                default:
                    return { success: false, error: 'Unknown action type' };
            }
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Create a new file
     */
    async createFile(fileName, content = '') {
        const filePath = path.join(this.workspacePath, fileName);
        const dir = path.dirname(filePath);
        
        // Ensure directory exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(filePath, content, 'utf-8');
        
        return {
            success: true,
            filePath: fileName,
            message: `✅ Created file: ${fileName}`
        };
    }

    /**
     * Write content to a file
     */
    async writeToFile(fileName, content) {
        const filePath = path.join(this.workspacePath, fileName);
        const dir = path.dirname(filePath);
        
        // Ensure directory exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(filePath, content, 'utf-8');
        
        return {
            success: true,
            filePath: fileName,
            message: `✅ Wrote to file: ${fileName}`
        };
    }

    /**
     * Run a terminal command
     */
    async runCommand(command) {
        return new Promise((resolve) => {
            exec(command, { cwd: this.workspacePath }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        error: error.message,
                        output: stderr
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout,
                        message: `✅ Command executed: ${command}`
                    });
                }
            });
        });
    }

    /**
     * Install npm package
     */
    async installPackage(packageName) {
        const command = `npm install ${packageName}`;
        return await this.runCommand(command);
    }

    /**
     * Extract code blocks from AI response
     */
    extractCodeBlocks(text) {
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        const blocks = [];
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            blocks.push({
                language: match[1] || 'text',
                code: match[2].trim()
            });
        }

        return blocks;
    }

    /**
     * Parse AI response for actions and execute them
     */
    async parseAndExecute(message, aiResponse, workspacePath) {
        this.workspacePath = workspacePath || this.workspacePath;
        
        // First, try to detect action from user message
        let detectedAction = this.detectAction(message);
        
        // Extract code blocks from AI response
        const codeBlocks = this.extractCodeBlocks(aiResponse);
        
        // If we detected an action and have code, execute it
        if (detectedAction && codeBlocks.length > 0) {
            const code = codeBlocks[0].code;
            
            // Determine file name - prioritize detected, then infer from code/AI response
            let fileName = detectedAction.fileName;
            
            // Try to extract filename from AI response text
            if (!fileName || !this.cleanFileName(fileName)) {
                const fileNameMatch = aiResponse.match(/(?:file|save|create|named)\s+(?:as\s+)?['"]?([a-zA-Z0-9_\-\.]+\.(?:bat|js|ts|py|html|css|json|md|txt))['"]?/i);
                if (fileNameMatch) {
                    fileName = this.cleanFileName(fileNameMatch[1]);
                }
            }
            
            // If still no filename, infer from code content
            if (!fileName || !this.cleanFileName(fileName)) {
                if (code.includes('@echo off') || code.includes('REM') || code.includes('echo ') || code.includes('pause')) {
                    fileName = 'run.bat';
                } else if (codeBlocks[0].language) {
                    const ext = codeBlocks[0].language === 'javascript' ? 'js' :
                               codeBlocks[0].language === 'typescript' ? 'ts' :
                               codeBlocks[0].language === 'python' ? 'py' :
                               codeBlocks[0].language === 'html' ? 'html' :
                               codeBlocks[0].language === 'css' ? 'css' :
                               codeBlocks[0].language === 'json' ? 'json' :
                               codeBlocks[0].language === 'markdown' ? 'md' :
                               codeBlocks[0].language === 'batch' ? 'bat' :
                               codeBlocks[0].language;
                    fileName = `untitled.${ext}`;
                } else {
                    fileName = 'untitled.txt';
                }
            }
            
            // Clean the filename one more time
            fileName = this.cleanFileName(fileName) || 'untitled.bat';
            
            // Update action with cleaned filename
            detectedAction.fileName = fileName;
            
            // Execute the action
            const result = await this.executeAction(detectedAction, code, workspacePath);
            return {
                executed: true,
                action: detectedAction,
                result: result,
                fileName: fileName
            };
        }
        
        // Check if AI response contains action instructions
        const actionKeywords = ['create file', 'write to', 'save as', 'run command', 'execute'];
        const hasActionKeyword = actionKeywords.some(keyword => 
            aiResponse.toLowerCase().includes(keyword)
        );
        
        if (hasActionKeyword && codeBlocks.length > 0) {
            // Try to infer file name from context
            const fileNameMatch = aiResponse.match(/(?:file|save|create|named)\s+(?:as\s+)?['"]?([a-zA-Z0-9_\-\.]+\.(?:bat|js|ts|py|html|css|json|md|txt))['"]?/i);
            let fileName = fileNameMatch ? this.cleanFileName(fileNameMatch[1]) : null;
            
            // If no filename found, infer from code
            if (!fileName) {
                const code = codeBlocks[0].code;
                if (code.includes('@echo off') || code.includes('REM')) {
                    fileName = 'run.bat';
                } else if (codeBlocks[0].language) {
                    const ext = codeBlocks[0].language === 'javascript' ? 'js' :
                               codeBlocks[0].language === 'typescript' ? 'ts' :
                               codeBlocks[0].language === 'python' ? 'py' :
                               codeBlocks[0].language === 'html' ? 'html' :
                               codeBlocks[0].language === 'css' ? 'css' :
                               codeBlocks[0].language === 'json' ? 'json' :
                               codeBlocks[0].language === 'markdown' ? 'md' :
                               codeBlocks[0].language === 'batch' ? 'bat' :
                               codeBlocks[0].language;
                    fileName = `untitled.${ext}`;
                } else {
                    fileName = 'untitled.txt';
                }
            }
            
            fileName = this.cleanFileName(fileName) || 'untitled.bat';
            
            const result = await this.createFile(fileName, codeBlocks[0].code);
            return {
                executed: true,
                action: { type: 'createFile', fileName: fileName },
                result: result,
                fileName: fileName
            };
        }
        
        return { executed: false };
    }
}

module.exports = ActionExecutor;
