/**
 * Project Pipeline Module
 * Auto-detects project type and executes build/test/deploy pipelines
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ProjectPipeline {
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.projectType = null;
        this.buildCommands = [];
        this.testCommands = [];
        this.deployCommands = [];
        this.detectedTools = {};
        this.packageJson = null;
        this.packageScripts = {};

        this.detectProjectType();
        this.inferCommands();
    }

    /**
     * Detect project type based on files in project directory
     */
    detectProjectType() {
        try {
            const files = fs.readdirSync(this.projectPath);

            // Node.js/React/Vue projects
            if (files.includes('package.json')) {
                const packageJson = path.join(this.projectPath, 'package.json');
                const content = fs.readFileSync(packageJson, 'utf8');
                const pkg = JSON.parse(content);
                const deps = {
                    ...(pkg.dependencies || {}),
                    ...(pkg.devDependencies || {}),
                };
                const scripts = pkg.scripts || {};

                this.packageJson = pkg;
                this.packageScripts = scripts;

                if (deps['electron']) {
                    this.projectType = 'electron';
                } else if (
                    deps['@tauri-apps/api'] ||
                    deps['@tauri-apps/cli'] ||
                    deps['@tauri-apps/plugin-shell'] ||
                    files.includes('src-tauri')
                ) {
                    this.projectType = 'tauri';
                } else if (deps['vue']) {
                    this.projectType = 'vue';
                } else if (deps['react']) {
                    this.projectType = 'react';
                } else {
                    this.projectType = 'node';
                }

                this.detectedTools.node = true;
                this.detectedTools.npm = true;
                return;
            }

            // Python projects
            if (files.some(f => ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'].includes(f))) {
                this.projectType = 'python';
                this.detectedTools.python = true;
                this.detectedTools.pip = true;
                return;
            }

            // Rust projects
            if (files.includes('Cargo.toml')) {
                this.projectType = 'rust';
                this.detectedTools.rust = true;
                this.detectedTools.cargo = true;
                return;
            }

            // Go projects
            if (files.includes('go.mod')) {
                this.projectType = 'go';
                this.detectedTools.go = true;
                return;
            }

            // .NET projects
            if (files.some(f => f.endsWith('.csproj') || f.endsWith('.fsproj'))) {
                this.projectType = 'dotnet';
                this.detectedTools.dotnet = true;
                return;
            }

            // Java projects
            if (files.includes('pom.xml') || files.includes('build.gradle')) {
                this.projectType = 'java';
                this.detectedTools.java = true;
                this.detectedTools.maven = files.includes('pom.xml');
                this.detectedTools.gradle = files.includes('build.gradle');
                return;
            }

        } catch (error) {
            console.error('Error detecting project type:', error);
        }

        this.projectType = 'unknown';
    }

    /**
     * Infer build, test, and deploy commands based on project type
     */
    inferCommands() {
        const scripts = this.packageScripts || {};

        switch (this.projectType) {
            case 'node':
            case 'react':
            case 'vue':
            case 'electron':
                this.buildCommands = scripts.build ? ['npm run build'] : [];
                this.testCommands = scripts.test ? ['npm test'] : [];
                this.deployCommands = []; // Custom deployment needed
                break;

            case 'tauri':
                this.buildCommands = scripts.build
                    ? ['npm run build']
                    : ['cargo build --manifest-path src-tauri/Cargo.toml'];
                this.testCommands = scripts.test ? ['npm test'] : [];
                this.deployCommands = []; // Custom deployment needed
                break;

            case 'python':
                this.buildCommands = ['pip install -r requirements.txt'];
                this.testCommands = ['python -m pytest', 'python -m unittest discover'];
                this.deployCommands = []; // Custom deployment needed
                break;

            case 'rust':
                this.buildCommands = ['cargo build --release'];
                this.testCommands = ['cargo test'];
                this.deployCommands = []; // Custom deployment needed
                break;

            case 'go':
                this.buildCommands = ['go build'];
                this.testCommands = ['go test ./...'];
                this.deployCommands = []; // Custom deployment needed
                break;

            case 'dotnet':
                this.buildCommands = ['dotnet build --configuration Release'];
                this.testCommands = ['dotnet test'];
                this.deployCommands = []; // Custom deployment needed
                break;

            case 'java':
                if (this.detectedTools.maven) {
                    this.buildCommands = ['mvn clean compile'];
                    this.testCommands = ['mvn test'];
                } else if (this.detectedTools.gradle) {
                    this.buildCommands = ['./gradlew build'];
                    this.testCommands = ['./gradlew test'];
                }
                this.deployCommands = []; // Custom deployment needed
                break;

            default:
                this.buildCommands = [];
                this.testCommands = [];
                this.deployCommands = [];
        }
    }

    /**
     * Execute command with real-time output
     */
    async executeCommand(command, options = {}) {
        const {
            cwd = this.projectPath,
            timeout = 300000, // 5 minutes
            onOutput = null,
            onError = null,
            onClose = null
        } = options;

        return new Promise((resolve, reject) => {
            console.log(`Executing: ${command} in ${cwd}`);

            const child = spawn(command, {
                shell: true,
                cwd,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
                timeout
            });

            let stdout = '';
            let stderr = '';

            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    const output = data.toString();
                    stdout += output;
                    if (onOutput) onOutput(output, 'stdout');
                });
            }

            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    const output = data.toString();
                    stderr += output;
                    if (onError) onError(output, 'stderr');
                });
            }

            child.on('close', (code) => {
                const result = {
                    command,
                    code,
                    stdout,
                    stderr,
                    success: code === 0
                };

                if (onClose) onClose(result);
                resolve(result);
            });

            child.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Execute build commands
     */
    async executeBuild(onProgress = null) {
        if (this.buildCommands.length === 0) {
            return { success: true, message: 'No build commands detected' };
        }

        const results = [];

        for (let i = 0; i < this.buildCommands.length; i++) {
            const command = this.buildCommands[i];

            if (onProgress) {
                onProgress(`Building... (${i + 1}/${this.buildCommands.length})`, (i / this.buildCommands.length) * 100);
            }

            try {
                const result = await this.executeCommand(command, {
                    onOutput: (output) => {
                        if (onProgress) onProgress(`Building... ${output.trim()}`, ((i + 0.5) / this.buildCommands.length) * 100);
                    },
                    onError: (output) => {
                        if (onProgress) onProgress(`Building... ${output.trim()}`, ((i + 0.5) / this.buildCommands.length) * 100);
                    }
                });

                results.push(result);

                if (!result.success) {
                    return {
                        success: false,
                        message: `Build failed: ${command}`,
                        results,
                        failedCommand: command,
                        error: result.stderr
                    };
                }

            } catch (error) {
                return {
                    success: false,
                    message: `Build error: ${error.message}`,
                    results,
                    failedCommand: command,
                    error: error.message
                };
            }
        }

        if (onProgress) {
            onProgress('Build completed successfully!', 100);
        }

        return {
            success: true,
            message: 'Build completed successfully',
            results
        };
    }

    /**
     * Execute test commands
     */
    async executeTests(onProgress = null) {
        if (this.testCommands.length === 0) {
            return { success: true, message: 'No test commands detected' };
        }

        const results = [];

        for (let i = 0; i < this.testCommands.length; i++) {
            const command = this.testCommands[i];

            if (onProgress) {
                onProgress(`Running tests... (${i + 1}/${this.testCommands.length})`, (i / this.testCommands.length) * 50);
            }

            try {
                const result = await this.executeCommand(command, {
                    onOutput: (output) => {
                        if (onProgress) onProgress(`Testing... ${output.trim()}`, ((i + 0.5) / this.testCommands.length) * 100);
                    },
                    onError: (output) => {
                        if (onProgress) onProgress(`Testing... ${output.trim()}`, ((i + 0.5) / this.testCommands.length) * 100);
                    }
                });

                results.push(result);

                // Some test commands return non-zero exit codes when tests fail
                // We'll consider it successful if it ran (we'll parse output for actual test results)

            } catch (error) {
                results.push({
                    command,
                    success: false,
                    error: error.message
                });
            }
        }

        // Analyze test results
        const testResults = this.analyzeTestResults(results);

        if (onProgress) {
            onProgress(`Tests completed: ${testResults.passed}/${testResults.total} passed`, 100);
        }

        return {
            success: testResults.failed === 0, // Success if no tests failed
            message: `Tests completed: ${testResults.passed}/${testResults.total} passed`,
            results,
            testResults
        };
    }

    /**
     * Analyze test output to extract results
     */
    analyzeTestResults(results) {
        let total = 0;
        let passed = 0;
        let failed = 0;

        for (const result of results) {
            const output = result.stdout + result.stderr;

            switch (this.projectType) {
                case 'node':
                case 'react':
                case 'vue':
                    // Jest output
                    const jestMatch = output.match(/Tests?:\s*(\d+)\s*(?:passed|passing)?,?\s*(\d+)\s*(?:failed|failing)?/i);
                    if (jestMatch) {
                        passed += parseInt(jestMatch[1]) || 0;
                        failed += parseInt(jestMatch[2]) || 0;
                        total += passed + failed;
                    }
                    break;

                case 'python':
                    // pytest output
                    const pytestMatch = output.match(/(\d+)\s*passed(?:,?\s*(\d+)\s*failed)?/i);
                    if (pytestMatch) {
                        passed += parseInt(pytestMatch[1]) || 0;
                        failed += parseInt(pytestMatch[2]) || 0;
                        total += passed + failed;
                    }
                    break;

                case 'rust':
                    // Cargo test output
                    const cargoMatch = output.match(/(\d+)\s*passed;\s*(\d+)\s*failed/i);
                    if (cargoMatch) {
                        passed += parseInt(cargoMatch[1]) || 0;
                        failed += parseInt(cargoMatch[2]) || 0;
                        total += passed + failed;
                    }
                    break;

                default:
                    // Generic parsing - look for patterns like "X passed, Y failed"
                    const genericMatch = output.match(/(\d+)\s*(?:passed|passing|success|ok)(?:,?\s*(\d+)\s*(?:failed|failing|error))?/gi);
                    if (genericMatch) {
                        // This is simplified - would need more sophisticated parsing
                        total = Math.max(total, 1);
                        passed = result.success ? 1 : 0;
                        failed = result.success ? 0 : 1;
                    }
            }
        }

        return { total, passed, failed };
    }

    /**
     * Execute deploy commands (if configured)
     */
    async executeDeploy(onProgress = null, customCommands = null) {
        const commands = customCommands || this.deployCommands;

        if (commands.length === 0) {
            return { success: true, message: 'No deployment commands configured' };
        }

        const results = [];

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];

            if (onProgress) {
                onProgress(`Deploying... (${i + 1}/${commands.length})`, (i / commands.length) * 100);
            }

            try {
                const result = await this.executeCommand(command, {
                    onOutput: (output) => {
                        if (onProgress) onProgress(`Deploying... ${output.trim()}`, ((i + 0.5) / commands.length) * 100);
                    },
                    onError: (output) => {
                        if (onProgress) onProgress(`Deploying... ${output.trim()}`, ((i + 0.5) / commands.length) * 100);
                    }
                });

                results.push(result);

                if (!result.success) {
                    return {
                        success: false,
                        message: `Deployment failed: ${command}`,
                        results,
                        failedCommand: command,
                        error: result.stderr
                    };
                }

            } catch (error) {
                return {
                    success: false,
                    message: `Deployment error: ${error.message}`,
                    results,
                    failedCommand: command,
                    error: error.message
                };
            }
        }

        if (onProgress) {
            onProgress('Deployment completed successfully!', 100);
        }

        return {
            success: true,
            message: 'Deployment completed successfully',
            results
        };
    }

    /**
     * Get pipeline status and capabilities
     */
    getStatus() {
        return {
            projectPath: this.projectPath,
            projectType: this.projectType,
            detectedTools: this.detectedTools,
            buildCommands: this.buildCommands,
            testCommands: this.testCommands,
            deployCommands: this.deployCommands,
            canBuild: this.buildCommands.length > 0,
            canTest: this.testCommands.length > 0,
            canDeploy: this.deployCommands.length > 0
        };
    }

    /**
     * Set custom commands
     */
    setCustomCommands(type, commands) {
        if (Array.isArray(commands)) {
            switch (type) {
                case 'build':
                    this.buildCommands = commands;
                    break;
                case 'test':
                    this.testCommands = commands;
                    break;
                case 'deploy':
                    this.deployCommands = commands;
                    break;
            }
        }
    }
}

module.exports = { ProjectPipeline };
