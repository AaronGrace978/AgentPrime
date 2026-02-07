/**
 * AgentPrime - Natural Language to Code Execution Engine
 * Turn words into ACTUAL CODE that executes immediately!
 * 
 * This is the CRAZY ENGINE that makes the terminal understand natural language
 * and turns it into executable code/commands!
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { sanitizeFolderName } = require('../security/ipcValidation');

const execAsync = promisify(exec);

class NaturalLanguageExecutor {
    constructor(workspacePath, codebaseIndexer = null) {
        this.workspacePath = workspacePath;
        this.codebaseIndexer = codebaseIndexer;
        this.executionHistory = [];
    }

    /**
     * Main entry point - interpret natural language and execute
     */
    async execute(naturalLanguageCommand) {
        const command = naturalLanguageCommand.trim();
        
        // Quick check - if it's a regular shell command, just run it
        if (this.isShellCommand(command)) {
            return await this.executeShellCommand(command);
        }

        // Parse the natural language command
        const parsed = this.parseCommand(command);
        
        if (!parsed) {
            return {
                success: false,
                error: `Couldn't understand: "${command}". Try: "create file test.js", "run npm install", "write hello to file.txt", etc.`
            };
        }

        // Execute based on parsed intent
        try {
            switch (parsed.intent) {
                case 'create_file':
                    return await this.createFile(parsed);
                
                case 'write_file':
                    return await this.writeFile(parsed);
                
                case 'run_command':
                    return await this.runCommand(parsed);
                
                case 'install_package':
                    return await this.installPackage(parsed);
                
                case 'create_component':
                    return await this.createComponent(parsed);
                
                case 'modify_file':
                    return await this.modifyFile(parsed);
                
                case 'delete_file':
                    return await this.deleteFile(parsed);
                
                case 'create_folder':
                    return await this.createFolder(parsed);
                
                case 'run_script':
                    return await this.runScript(parsed);
                
                case 'generate_code':
                    return await this.generateCode(parsed);
                
                case 'conversational_request':
                    // This should be handled by the conversational AI, not here
                    return {
                        success: false,
                        error: "This is a conversational request. Try addressing AgentPrime directly, like 'AgentPrime, build me something cool'"
                    };
                
                default:
                    return {
                        success: false,
                        error: `Unknown command type: ${parsed.intent}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if it's a regular shell command (starts with common commands)
     */
    isShellCommand(command) {
        const shellCommands = ['cd', 'ls', 'dir', 'pwd', 'echo', 'cat', 'type', 'mkdir', 'rm', 'del', 'cp', 'copy', 'mv', 'move', 'git', 'npm', 'node', 'python', 'python3', 'pip', 'npx'];
        const firstWord = command.split(' ')[0].toLowerCase();
        return shellCommands.includes(firstWord) || command.startsWith('./') || command.startsWith('\\');
    }

    /**
     * Execute regular shell command
     */
    async executeShellCommand(command) {
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.workspacePath,
                maxBuffer: 10 * 1024 * 1024 // 10MB
            });
            
            return {
                success: true,
                output: stdout || stderr || 'Command executed',
                command
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command
            };
        }
    }

    /**
     * Parse natural language command into structured intent
     */
    parseCommand(command) {
        const lower = command.toLowerCase();
        
        // CREATE FILE patterns
        if (this.matchesPattern(lower, ['create', 'make', 'new'], ['file', 'file named', 'file called'])) {
            const fileMatch = command.match(/(?:create|make|new)\s+(?:a\s+)?(?:file\s+)?(?:named\s+|called\s+)?['"]?([^\s'"]+\.[a-zA-Z0-9]+)['"]?/i);
            if (fileMatch) {
                return {
                    intent: 'create_file',
                    fileName: fileMatch[1],
                    content: this.extractContent(command)
                };
            }
        }

        // WRITE TO FILE patterns
        if (this.matchesPattern(lower, ['write', 'save', 'put'], ['to', 'in', 'file'])) {
            const fileMatch = command.match(/(?:write|save|put)\s+(?:['"]([^'"]+)['"]\s+)?(?:to|in|into)\s+(?:file\s+)?['"]?([^\s'"]+\.[a-zA-Z0-9]+)['"]?/i);
            if (fileMatch) {
                return {
                    intent: 'write_file',
                    fileName: fileMatch[2] || fileMatch[1],
                    content: fileMatch[1] || this.extractContent(command)
                };
            }
        }

        // RUN COMMAND patterns
        if (this.matchesPattern(lower, ['run', 'execute', 'do'], ['command', 'script', 'code'])) {
            const cmdMatch = command.match(/(?:run|execute|do)\s+(?:command\s+)?['"]([^'"]+)['"]/i);
            if (cmdMatch) {
                return {
                    intent: 'run_command',
                    command: cmdMatch[1]
                };
            }
        }

        // INSTALL PACKAGE patterns
        if (this.matchesPattern(lower, ['install', 'add'], ['package', 'npm', 'pip'])) {
            const pkgMatch = command.match(/(?:install|add)\s+(?:package\s+)?['"]?([a-zA-Z0-9_\-@\/\.]+)['"]?/i);
            if (pkgMatch) {
                return {
                    intent: 'install_package',
                    packageName: pkgMatch[1],
                    manager: lower.includes('pip') ? 'pip' : 'npm'
                };
            }
        }

        // CREATE COMPONENT patterns (React, Vue, etc.)
        if (this.matchesPattern(lower, ['create', 'make', 'new'], ['component', 'react component', 'vue component'])) {
            const compMatch = command.match(/(?:create|make|new)\s+(?:a\s+)?(?:react\s+|vue\s+)?component\s+(?:named\s+|called\s+)?['"]?([A-Z][a-zA-Z0-9]+)['"]?/i);
            if (compMatch) {
                return {
                    intent: 'create_component',
                    componentName: compMatch[1],
                    type: lower.includes('vue') ? 'vue' : 'react'
                };
            }
        }

        // MODIFY FILE patterns
        if (this.matchesPattern(lower, ['modify', 'edit', 'change', 'update'], ['file'])) {
            const fileMatch = command.match(/(?:modify|edit|change|update)\s+(?:file\s+)?['"]?([^\s'"]+\.[a-zA-Z0-9]+)['"]?/i);
            if (fileMatch) {
                return {
                    intent: 'modify_file',
                    fileName: fileMatch[1],
                    modification: this.extractContent(command)
                };
            }
        }

        // DELETE FILE patterns
        if (this.matchesPattern(lower, ['delete', 'remove', 'rm'], ['file'])) {
            const fileMatch = command.match(/(?:delete|remove|rm)\s+(?:file\s+)?['"]?([^\s'"]+\.[a-zA-Z0-9]+)['"]?/i);
            if (fileMatch) {
                return {
                    intent: 'delete_file',
                    fileName: fileMatch[1]
                };
            }
        }

        // CREATE FOLDER patterns
        if (this.matchesPattern(lower, ['create', 'make', 'new'], ['folder', 'directory', 'dir'])) {
            const folderMatch = command.match(/(?:create|make|new)\s+(?:a\s+)?(?:folder|directory|dir)\s+(?:named\s+|called\s+)?['"]?([^\s'"]+)['"]?/i);
            if (folderMatch) {
                return {
                    intent: 'create_folder',
                    folderName: folderMatch[1]
                };
            }
        }

        // RUN SCRIPT patterns
        if (this.matchesPattern(lower, ['run', 'execute'], ['script'])) {
            const scriptMatch = command.match(/(?:run|execute)\s+script\s+['"]?([^\s'"]+)['"]?/i);
            if (scriptMatch) {
                return {
                    intent: 'run_script',
                    scriptPath: scriptMatch[1]
                };
            }
        }

        // GENERATE CODE patterns (AI-powered)
        if (this.matchesPattern(lower, ['generate', 'create', 'make'], ['code', 'function', 'class'])) {
            return {
                intent: 'generate_code',
                request: command,
                target: this.extractTarget(command)
            };
        }

        // BUILD/MAKE SOMETHING patterns (conversational requests)
        if (this.matchesPattern(lower, ['build', 'make', 'create', 'generate'], ['me', 'something', 'cool', 'awesome', 'nice'])) {
            return {
                intent: 'conversational_request',
                request: command,
                type: 'build_request'
            };
        }

        return null;
    }

    /**
     * Check if command matches pattern keywords
     */
    matchesPattern(lower, verbs, objects) {
        for (const verb of verbs) {
            for (const obj of objects) {
                if (lower.includes(verb) && lower.includes(obj)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Extract content from command (text in quotes or after keywords)
     */
    extractContent(command) {
        // Try to find quoted content
        const quotedMatch = command.match(/['"]([^'"]+)['"]/);
        if (quotedMatch) return quotedMatch[1];

        // Try to find content after "with" or "containing"
        const withMatch = command.match(/(?:with|containing|content)\s+(.+?)(?:\s+to\s+|\s+in\s+|$)/i);
        if (withMatch) return withMatch[1].trim();

        return '';
    }

    /**
     * Extract target file/path from command
     */
    extractTarget(command) {
        const fileMatch = command.match(/([a-zA-Z0-9_\-\.\/]+\.(?:js|ts|tsx|jsx|py|html|css|json|md|txt))/i);
        return fileMatch ? fileMatch[1] : null;
    }

    /**
     * CREATE FILE - Generate and create a file
     */
    async createFile(parsed) {
        const filePath = path.join(this.workspacePath, parsed.fileName);
        
        // Generate content based on file type
        let content = parsed.content || this.generateFileContent(parsed.fileName);
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        
        this.executionHistory.push({
            type: 'create_file',
            file: parsed.fileName,
            timestamp: Date.now()
        });

        return {
            success: true,
            message: `✅ Created file: ${parsed.fileName}`,
            file: parsed.fileName,
            content
        };
    }

    /**
     * Generate file content based on file type
     */
    generateFileContent(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        
        const templates = {
            '.js': `// ${fileName}\n\nconsole.log('Hello, World!');\n`,
            '.ts': `// ${fileName}\n\nexport default function main() {\n    console.log('Hello, World!');\n}\n`,
            '.py': `# ${fileName}\n\nif __name__ == '__main__':\n    print('Hello, World!')\n`,
            '.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <title>${path.basename(fileName, '.html')}</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>\n`,
            '.css': `/* ${fileName} */\n\nbody {\n    margin: 0;\n    padding: 0;\n}\n`,
            '.json': `{\n    "name": "${path.basename(fileName, '.json')}",\n    "version": "1.0.0"\n}\n`,
            '.md': `# ${path.basename(fileName, '.md')}\n\n## Description\n\n`,
            '.txt': `${path.basename(fileName, '.txt')}\n\n`,
            '.bat': `@echo off\nREM ${fileName}\necho Hello, World!\npause\n`,
            '.sh': `#!/bin/bash\n# ${fileName}\n\necho "Hello, World!"\n`
        };

        return templates[ext] || `// ${fileName}\n\n`;
    }

    /**
     * WRITE FILE - Write content to a file
     */
    async writeFile(parsed) {
        const filePath = path.join(this.workspacePath, parsed.fileName);
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const content = parsed.content || '';
        fs.writeFileSync(filePath, content, 'utf-8');

        this.executionHistory.push({
            type: 'write_file',
            file: parsed.fileName,
            timestamp: Date.now()
        });

        return {
            success: true,
            message: `✅ Wrote to file: ${parsed.fileName}`,
            file: parsed.fileName
        };
    }

    /**
     * RUN COMMAND - Execute a command
     */
    async runCommand(parsed) {
        return await this.executeShellCommand(parsed.command);
    }

    /**
     * INSTALL PACKAGE - Install npm/pip package
     */
    async installPackage(parsed) {
        const manager = parsed.manager || 'npm';
        const command = manager === 'pip' 
            ? `pip install ${parsed.packageName}`
            : `npm install ${parsed.packageName}`;

        return await this.executeShellCommand(command);
    }

    /**
     * CREATE COMPONENT - Generate React/Vue component
     */
    async createComponent(parsed) {
        const ext = parsed.type === 'vue' ? '.vue' : '.tsx';
        const fileName = `${parsed.componentName}${ext}`;
        const filePath = path.join(this.workspacePath, fileName);

        let content;
        if (parsed.type === 'vue') {
            content = `<template>\n  <div class="${parsed.componentName.toLowerCase()}">\n    <h1>${parsed.componentName}</h1>\n  </div>\n</template>\n\n<script setup lang="ts">\n// ${parsed.componentName}\n</script>\n\n<style scoped>\n.${parsed.componentName.toLowerCase()} {\n  \n}\n</style>\n`;
        } else {
            content = `import React from 'react';\n\ninterface ${parsed.componentName}Props {\n  // Add props here\n}\n\nexport const ${parsed.componentName}: React.FC<${parsed.componentName}Props> = () => {\n  return (\n    <div>\n      <h1>${parsed.componentName}</h1>\n    </div>\n  );\n};\n\nexport default ${parsed.componentName};\n`;
        }

        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');

        return {
            success: true,
            message: `✅ Created ${parsed.type} component: ${fileName}`,
            file: fileName
        };
    }

    /**
     * MODIFY FILE - Modify existing file
     */
    async modifyFile(parsed) {
        const filePath = path.join(this.workspacePath, parsed.fileName);
        
        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                error: `File not found: ${parsed.fileName}`
            };
        }

        // For now, append modification (could be enhanced with AI)
        const existing = fs.readFileSync(filePath, 'utf-8');
        const modified = existing + '\n\n// Modified: ' + parsed.modification;
        
        fs.writeFileSync(filePath, modified, 'utf-8');

        return {
            success: true,
            message: `✅ Modified file: ${parsed.fileName}`
        };
    }

    /**
     * DELETE FILE
     */
    async deleteFile(parsed) {
        const filePath = path.join(this.workspacePath, parsed.fileName);
        
        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                error: `File not found: ${parsed.fileName}`
            };
        }

        fs.unlinkSync(filePath);

        return {
            success: true,
            message: `✅ Deleted file: ${parsed.fileName}`
        };
    }

    /**
     * CREATE FOLDER
     */
    async createFolder(parsed) {
        // Sanitize folder name to prevent invalid characters and trailing spaces
        const sanitizedName = sanitizeFolderName(parsed.folderName);
        
        if (!sanitizedName || sanitizedName === 'untitled') {
            return {
                success: false,
                error: `Invalid folder name: "${parsed.folderName}"`
            };
        }
        
        const folderPath = path.join(this.workspacePath, sanitizedName);
        
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        return {
            success: true,
            message: `✅ Created folder: ${sanitizedName}`
        };
    }

    /**
     * RUN SCRIPT
     */
    async runScript(parsed) {
        const scriptPath = path.join(this.workspacePath, parsed.scriptPath);
        
        if (!fs.existsSync(scriptPath)) {
            return {
                success: false,
                error: `Script not found: ${parsed.scriptPath}`
            };
        }

        const ext = path.extname(scriptPath).toLowerCase();
        let command;
        
        if (ext === '.js' || ext === '.mjs') {
            command = `node ${parsed.scriptPath}`;
        } else if (ext === '.py') {
            command = `python ${parsed.scriptPath}`;
        } else if (ext === '.bat' || ext === '.cmd') {
            command = parsed.scriptPath;
        } else if (ext === '.sh') {
            command = `bash ${parsed.scriptPath}`;
        } else {
            command = parsed.scriptPath;
        }

        return await this.executeShellCommand(command);
    }

    /**
     * GENERATE CODE - Use AI to generate code (if codebase indexer available)
     */
    async generateCode(parsed) {
        // This would integrate with AI to generate code
        // For now, return a placeholder
        return {
            success: false,
            error: 'AI code generation coming soon! Use "create file" for now.',
            suggestion: `Try: "create file ${parsed.target || 'code.js'}"`
        };
    }
}

module.exports = NaturalLanguageExecutor;

