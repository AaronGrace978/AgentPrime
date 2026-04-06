/**
 * Project Runner Tool
 * Automatically detects and runs completed projects
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  getProjectRuntimeProfileSync,
  getProjectKindLabel,
  type ProjectKind,
} from '../project-runtime';
import { createLogger } from '../../core/logger';
import { getTelemetryService } from '../../core/telemetry-service';

const log = createLogger('ProjectRunner');

const execAsync = promisify(exec);

export interface ProjectInfo {
  type: 'node' | 'python' | 'html' | 'tauri' | 'unknown';
  kind: ProjectKind;
  displayName: string;
  hasPackageJson: boolean;
  hasRequirements: boolean;
  hasIndexHtml: boolean;
  name?: string;
  mainFile?: string;
  startCommand?: string;
  buildCommand?: string;
  installCommand?: string;
  requiresInstall: boolean;
  readinessSummary: string;
  pythonPath?: string;
  hasVirtualEnv?: boolean;
  virtualEnvPath?: string;
}

export class ProjectRunner {
  private static shouldInstallNodeDependencies(workspacePath: string, projectInfo: ProjectInfo): boolean {
    if (projectInfo.type !== 'node' && projectInfo.type !== 'tauri') {
      return false;
    }

    return projectInfo.requiresInstall;
  }

  /**
   * Detect project type and structure
   */
  static async detectProject(workspacePath: string): Promise<ProjectInfo> {
    const profile = getProjectRuntimeProfileSync(workspacePath);
    const info: ProjectInfo = {
      type: profile.type,
      kind: profile.kind,
      displayName: profile.displayName,
      hasPackageJson: profile.hasPackageJson,
      hasRequirements: profile.hasRequirements,
      hasIndexHtml: profile.hasIndexHtml,
      name: profile.packageJson?.name || getProjectKindLabel(profile.kind),
      mainFile: profile.type === 'python' ? profile.pythonEntrypoint : profile.nodeEntrypoint,
      startCommand: profile.run.command || undefined,
      buildCommand: profile.build.command || undefined,
      installCommand: profile.install.command || undefined,
      requiresInstall: profile.install.required,
      readinessSummary: profile.readiness.summary,
      hasVirtualEnv: profile.hasVirtualEnv,
      virtualEnvPath: profile.virtualEnvPath,
    };

    try {
      if (info.type === 'python') {
        info.pythonPath = await this.findPython();
        if (!info.hasVirtualEnv && info.virtualEnvPath) {
          info.hasVirtualEnv = true;
        }

        if (info.mainFile) {
          const pythonCmd =
            info.hasVirtualEnv && info.virtualEnvPath
              ? path.join(
                  info.virtualEnvPath,
                  process.platform === 'win32' ? 'Scripts' : 'bin',
                  process.platform === 'win32' ? 'python.exe' : 'python'
                )
              : info.pythonPath || 'python';

          info.startCommand = `${pythonCmd} ${info.mainFile}`;
        }
      }
    } catch (error) {
      log.error('[ProjectRunner] Error detecting project:', error);
    }
    
    return info;
  }
  
  /**
   * Install dependencies if needed
   */
  static async installDependencies(workspacePath: string, projectInfo: ProjectInfo): Promise<{ success: boolean; output: string }> {
    try {
      if (this.shouldInstallNodeDependencies(workspacePath, projectInfo) && projectInfo.installCommand) {
        log.info('[ProjectRunner] Installing npm dependencies...');
        
        // Import tool-path-finder to get proper npm command and environment
        // CRITICAL: getNodeEnv() ensures child processes can find node.exe
        const { resolveCommand, getNodeEnv } = require('../../core/tool-path-finder');
        const npmCommand = resolveCommand(projectInfo.installCommand);
        const env = getNodeEnv();
        
        log.info('[ProjectRunner] Running:', npmCommand);
        
        const { stdout, stderr } = await execAsync(npmCommand, {
          cwd: workspacePath,
          timeout: 180000, // 3 minutes
          env: env,
          maxBuffer: 10 * 1024 * 1024
        });
        return { success: true, output: stdout + stderr };
      }
      
      if (projectInfo.type === 'python' && projectInfo.requiresInstall) {
        log.info('[ProjectRunner] Installing Python dependencies...');
        
        // Use virtual environment pip if available
        let pipCmd = 'pip';
        if (projectInfo.hasVirtualEnv && projectInfo.virtualEnvPath) {
          const isWindows = process.platform === 'win32';
          pipCmd = path.join(projectInfo.virtualEnvPath, isWindows ? 'Scripts' : 'bin', isWindows ? 'pip.exe' : 'pip');
        } else {
          // Try to use python -m pip
          const pythonCmd = projectInfo.pythonPath || 'python';
          pipCmd = `${pythonCmd} -m pip`;
        }
        
        const installCommand = projectInfo.installCommand || 'pip install -r requirements.txt';
        const pipInstallCommand = installCommand.includes('pip install -r requirements.txt')
          ? `${pipCmd} install -r requirements.txt`
          : installCommand;
        const { stdout, stderr } = await execAsync(pipInstallCommand, {
          cwd: workspacePath,
          timeout: 120000
        });
        return { success: true, output: stdout + stderr };
      }
      
      return { success: true, output: 'No dependencies to install' };
    } catch (error: any) {
      log.error('[ProjectRunner] Dependency installation failed:', error);
      return { 
        success: false, 
        output: error.message || 'Installation failed' 
      };
    }
  }
  
  /**
   * Run the project
   */
  static async runProject(
    workspacePath: string,
    projectInfo: ProjectInfo,
    options: { probeOnly?: boolean; waitMs?: number } = {}
  ): Promise<{ success: boolean; output: string; port?: number; url?: string }> {
    const waitMs = options.waitMs ?? 3000;

    if (projectInfo.kind === 'static' && projectInfo.hasIndexHtml) {
      const indexHtmlPath = path.join(workspacePath, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) {
        return { success: false, output: 'index.html not found' };
      }

      const url = `file:///${indexHtmlPath.replace(/\\/g, '/')}`;
      return {
        success: true,
        output: `Static site ready at ${url}`,
        url,
      };
    }

    if (!projectInfo.startCommand) {
      return { success: false, output: 'No start command found' };
    }

    if (this.shouldInstallNodeDependencies(workspacePath, projectInfo)) {
      const nodeModulesPath = path.join(workspacePath, 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        log.info('[ProjectRunner] 📦 Dependencies not found, installing...');
        const installResult = await this.installDependencies(workspacePath, projectInfo);
        if (!installResult.success) {
          return {
            success: false,
            output: `Failed to install dependencies: ${installResult.output}`,
          };
        }
        log.info('[ProjectRunner] ✅ Dependencies installed successfully');
      }
    }

    const runtimeProfile = getProjectRuntimeProfileSync(workspacePath);
    let runtimeCommand = projectInfo.startCommand;
    let port = this.detectConfiguredPort(workspacePath, projectInfo);

    if (projectInfo.kind === 'vite' && runtimeCommand === 'npm run dev') {
      const preferredPort = options.probeOnly
        ? 45000 + Math.floor(Math.random() * 1000)
        : port || 5173;
      const availablePort = await this.findAvailablePort(preferredPort);
      if (availablePort) {
        port = availablePort;
        const viteScript = runtimeProfile.scripts.dev || 'vite';
        runtimeCommand = /--port\s+\d+/.test(viteScript)
          ? viteScript.replace(/--port\s+\d+/, `--port ${availablePort}`)
          : `${viteScript} --port ${availablePort}`;
      }
    }

    try {
      log.info(`[ProjectRunner] 🚀 Running: ${runtimeCommand}`);

      const env = this.getRuntimeEnv(projectInfo, workspacePath);
      const child = exec(runtimeCommand, {
        cwd: workspacePath,
        env,
      });

      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
        log.info(`[ProjectRunner] ${data.toString().trim()}`);
      });

      child.stderr?.on('data', (data) => {
        output += data.toString();
        log.error(`[ProjectRunner] ${data.toString().trim()}`);
      });

      await new Promise((resolve) => setTimeout(resolve, waitMs));

      const detectedUrl = this.detectRuntimeUrl(output, projectInfo, port);
      if (!port && detectedUrl?.port) {
        port = detectedUrl.port;
      }

      if (output.includes('EADDRINUSE') || output.includes('address already in use')) {
        log.info('[ProjectRunner] 🔧 Port conflict detected, finding available port...');

        if ((projectInfo.type === 'node' || projectInfo.kind === 'vite') && port) {
          const newPort = await this.findAvailablePort(port);
          if (newPort && newPort !== port) {
            log.info(`[ProjectRunner] 🔧 Switching from port ${port} to ${newPort}`);
            const rewired =
              projectInfo.kind === 'vite'
                ? true
                : await this.rewirePortConflict(workspacePath, projectInfo, port, newPort);
            try {
              await this.terminateChildProcess(child);
            } catch {
              // Ignore kill failures for already-exited children.
            }
            if (rewired) {
              const updatedStartCommand =
                projectInfo.kind === 'vite' && projectInfo.startCommand === 'npm run dev'
                  ? (/--port\s+\d+/.test(runtimeProfile.scripts.dev || '')
                      ? (runtimeProfile.scripts.dev || 'vite').replace(/--port\s+\d+/, `--port ${newPort}`)
                      : `${runtimeProfile.scripts.dev || 'vite'} --port ${newPort}`)
                  : projectInfo.startCommand?.replace(String(port), String(newPort));
              return this.runProject(workspacePath, {
                ...projectInfo,
                startCommand: updatedStartCommand,
              }, options);
            }
          }
        }

        return {
          success: false,
          output: `Port ${port} is in use. Please stop the conflicting process or change the project port.`,
        };
      }

      if (child.exitCode !== null) {
        const exitCode = child.exitCode;
        const succeeded = exitCode === 0;
        return {
          success: succeeded,
          output: output || (succeeded ? 'Process completed successfully' : 'Process exited immediately'),
          port,
          url: detectedUrl?.url,
        };
      }

      if (options.probeOnly) {
        try {
          await this.terminateChildProcess(child);
        } catch {
          // Ignore cleanup errors during probe mode.
        }
      }

      return {
        success: true,
        output: output || 'Project started successfully',
        port,
        url: detectedUrl?.url,
      };
    } catch (error: any) {
      log.error('[ProjectRunner] Run failed:', error);
      return {
        success: false,
        output: error.message || 'Failed to run project',
      };
    }
  }

  private static getRuntimeEnv(projectInfo: ProjectInfo, workspacePath: string): NodeJS.ProcessEnv {
    if (projectInfo.type === 'python') {
      return { ...process.env, PYTHONUNBUFFERED: '1' };
    }

    try {
      const { getNodeEnv } = require('../../core/tool-path-finder');
      const nodeEnv = { ...getNodeEnv(), NODE_ENV: 'development' };
      const nodeBinPath = path.join(workspacePath, 'node_modules', '.bin');
      const existingPath = nodeEnv.PATH || nodeEnv.Path || process.env.PATH || '';
      return {
        ...nodeEnv,
        PATH: fs.existsSync(nodeBinPath) ? `${nodeBinPath}${path.delimiter}${existingPath}` : existingPath,
      };
    } catch {
      return { ...process.env, NODE_ENV: 'development' };
    }
  }

  private static detectConfiguredPort(workspacePath: string, projectInfo: ProjectInfo): number | undefined {
    const commandPortMatch = projectInfo.startCommand?.match(/--port\s+(\d+)/);
    if (commandPortMatch) {
      return parseInt(commandPortMatch[1], 10);
    }

    const runtimeProfile = getProjectRuntimeProfileSync(workspacePath);
    const scriptSource =
      projectInfo.startCommand === 'npm run dev'
        ? runtimeProfile.scripts.dev
        : projectInfo.startCommand === 'npm start'
          ? runtimeProfile.scripts.start
          : undefined;
    const scriptPortMatch = scriptSource?.match(/--port\s+(\d+)/);
    if (scriptPortMatch) {
      return parseInt(scriptPortMatch[1], 10);
    }

    if (projectInfo.type !== 'node') {
      return undefined;
    }

    const serverFiles = ['server.js', 'index.js', 'app.js', projectInfo.mainFile].filter(Boolean);
    for (const file of serverFiles) {
      if (!file) {
        continue;
      }

      try {
        const content = fs.readFileSync(path.join(workspacePath, file), 'utf-8');
        const portMatch = content.match(/\.listen\((\d+)/) || content.match(/port[:\s=]+(\d+)/i);
        if (portMatch) {
          return parseInt(portMatch[1], 10);
        }
      } catch {
        // Ignore unreadable candidates.
      }
    }

    return projectInfo.kind === 'vite' ? 5173 : undefined;
  }

  private static detectRuntimeUrl(
    output: string,
    projectInfo: ProjectInfo,
    configuredPort?: number
  ): { url: string; port?: number } | null {
    const urlMatch = output.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/i);
    if (urlMatch) {
      const url = urlMatch[0];
      return { url, port: parseInt(urlMatch[1], 10) };
    }

    if (configuredPort && (projectInfo.kind === 'vite' || projectInfo.type === 'node')) {
      return {
        url: `http://localhost:${configuredPort}`,
        port: configuredPort,
      };
    }

    return null;
  }

  private static async rewirePortConflict(
    workspacePath: string,
    projectInfo: ProjectInfo,
    oldPort: number,
    newPort: number
  ): Promise<boolean> {
    const serverFiles = ['server.js', 'index.js', 'app.js', projectInfo.mainFile].filter(Boolean);
    for (const file of serverFiles) {
      if (!file) {
        continue;
      }

      try {
        const filePath = path.join(workspacePath, file);
        let content = fs.readFileSync(filePath, 'utf-8');
        content = content.replace(new RegExp(String(oldPort), 'g'), String(newPort));
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
      } catch {
        // Try the next file.
      }
    }

    return false;
  }

  private static async awaitChildExit(child: ReturnType<typeof exec>, timeoutMs: number): Promise<void> {
    if (child.exitCode !== null) {
      return;
    }

    await Promise.race([
      new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.once('close', () => resolve());
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  private static async terminateChildProcess(child: ReturnType<typeof exec>): Promise<void> {
    if (child.exitCode !== null) {
      return;
    }

    try {
      if (process.platform === 'win32' && child.pid) {
        await execAsync(`taskkill /PID ${child.pid} /T /F`, { timeout: 5000 });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore follow-up kill failures.
      }
    }

    await this.awaitChildExit(child, 5000);
  }
  
  static async runBuild(workspacePath: string, projectInfo: ProjectInfo): Promise<{ success: boolean; output: string }> {
    if (!projectInfo.buildCommand) {
      return { success: true, output: 'No build command configured' };
    }

    try {
      const command = projectInfo.buildCommand;
      log.info(`[ProjectRunner] 🏗️ Running build: ${command}`);
      const env = { ...this.getRuntimeEnv(projectInfo, workspacePath), NODE_ENV: 'production' };
      const shellCommand =
        command.startsWith('npm ')
          ? require('../../core/tool-path-finder').resolveCommand(command)
          : command;
      const { stdout, stderr } = await execAsync(shellCommand, {
        cwd: workspacePath,
        timeout: 300000,
        env,
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        success: true,
        output: `${stdout}${stderr}`.trim() || 'Build completed successfully',
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stderr || error.stdout || error.message || 'Build failed',
      };
    }
  }
  
  /**
   * Find an available port starting from the given port
   */
  static async findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number | null> {
    const net = require('net');
    
    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      const isAvailable = await new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
          server.once('close', () => resolve(true));
          server.close();
        });
        server.on('error', () => resolve(false));
      });
      
      if (isAvailable) {
        return port;
      }
    }
    
    return null;
  }
  
  /**
   * Validate project structure
   */
  static async validateProject(workspacePath: string, projectInfo: ProjectInfo): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      if ((projectInfo.type === 'node' || projectInfo.type === 'tauri') && projectInfo.hasPackageJson) {
        if (projectInfo.mainFile) {
          const mainPath = path.join(workspacePath, projectInfo.mainFile);
          if (!fs.existsSync(mainPath)) {
            issues.push(`Main file ${projectInfo.mainFile} not found`);
          }
        }

        if (!projectInfo.startCommand) {
          issues.push(`No run command found for ${projectInfo.displayName}`);
        }
      }
      
      if (projectInfo.type === 'python') {
        if (projectInfo.mainFile) {
          const mainPath = path.join(workspacePath, projectInfo.mainFile);
          if (!fs.existsSync(mainPath)) {
            issues.push(`Main file ${projectInfo.mainFile} not found`);
          }
        } else {
          issues.push('No Python entrypoint found');
        }
      }
      
      if (projectInfo.type === 'html' && projectInfo.hasIndexHtml) {
        const indexPath = path.join(workspacePath, 'index.html');
        if (!fs.existsSync(indexPath)) {
          issues.push('index.html not found');
        }
      } else if (projectInfo.type === 'html' && !projectInfo.hasIndexHtml) {
        issues.push('index.html not found');
      }

      if (projectInfo.kind === 'vite' && !projectInfo.buildCommand) {
        issues.push('Vite app is missing a build command');
      }
      
    } catch (error) {
      issues.push(`Validation error: ${error}`);
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Find Python installation
   */
  static async findPython(): Promise<string | undefined> {
    const isWindows = process.platform === 'win32';
    const pythonCommands = isWindows 
      ? ['python', 'py', 'python3']
      : ['python3', 'python'];
    
    for (const cmd of pythonCommands) {
      try {
        const { stdout, stderr } = await execAsync(`${cmd} --version`, { timeout: 5000 });
        const versionOutput = `${stdout}${stderr}`;
        if (versionOutput.includes('Python')) {
          log.info(`[ProjectRunner] ✅ Found Python: ${cmd} (${versionOutput.trim()})`);
          return cmd;
        }
      } catch (e) {
        // Try next command
      }
    }
    
    log.warn('[ProjectRunner] ⚠️ Python not found in PATH');
    return undefined;
  }
  
  /**
   * Create virtual environment for Python project
   */
  static async createVirtualEnv(workspacePath: string, pythonPath?: string): Promise<{ success: boolean; path?: string; output: string }> {
    const venvPath = path.join(workspacePath, 'venv');
    
    // Check if venv already exists
    if (fs.existsSync(venvPath)) {
      log.info('[ProjectRunner] Virtual environment already exists');
      return { success: true, path: venvPath, output: 'Virtual environment already exists' };
    }
    
    try {
      const pythonCmd = pythonPath || await this.findPython() || 'python';
      log.info(`[ProjectRunner] Creating virtual environment with ${pythonCmd}...`);
      
      const { stdout, stderr } = await execAsync(`${pythonCmd} -m venv venv`, {
        cwd: workspacePath,
        timeout: 30000
      });
      
      return { 
        success: true, 
        path: venvPath, 
        output: stdout + stderr || 'Virtual environment created' 
      };
    } catch (error: any) {
      log.error('[ProjectRunner] Failed to create virtual environment:', error);
      return { 
        success: false, 
        output: error.message || 'Failed to create virtual environment' 
      };
    }
  }
  
  /**
   * Create shell script for Unix-like systems to run Tauri project
   */
  static createTauriShellScript(workspacePath: string, projectInfo: ProjectInfo): { success: boolean; filePath?: string } {
    if (projectInfo.type !== 'tauri' || !projectInfo.startCommand) {
      return { success: false };
    }

    try {
      const shPath = path.join(workspacePath, 'dev.sh');

      const shContent = `#!/bin/bash
cd "$(dirname "$0")"
echo "========================================="
echo "  Tauri App - Development Mode"
echo "========================================="

# Check for Node.js
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check for Rust/Cargo
if ! command -v cargo &> /dev/null; then
    echo "[ERROR] cargo not found!"
    echo "Tauri requires Rust to be installed."
    echo "Please install Rust from https://rustup.rs/"
    exit 1
fi

echo "[*] Starting Tauri development server..."
echo "[*] This will start both the Vite dev server and Tauri app"
echo ""

# Run Tauri development
npm run tauri:dev

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Tauri development failed!"
    echo "Make sure you have:"
    echo "- Node.js installed and accessible"
    echo "- Rust installed and accessible"
    echo "- All npm dependencies installed (run: npm install)"
    exit 1
fi

echo ""
echo "[SUCCESS] Tauri development completed!"
`;

      fs.writeFileSync(shPath, shContent, 'utf-8');
      fs.chmodSync(shPath, '755'); // Make executable
      log.info(`[ProjectRunner] ✅ Created Tauri dev.sh for ${projectInfo.name}`);

      return { success: true, filePath: shPath };
    } catch (error: any) {
      log.error('[ProjectRunner] Failed to create Tauri shell script:', error);
      return { success: false };
    }
  }

  /**
   * Create .bat file for Windows to run Tauri project
   * Includes Node.js and Rust/Cargo auto-detection for Tauri development
   */
  static createTauriBatchFile(workspacePath: string, projectInfo: ProjectInfo): { success: boolean; filePath?: string } {
    if (projectInfo.type !== 'tauri' || !projectInfo.startCommand) {
      return { success: false };
    }

    try {
      const isWindows = process.platform === 'win32';
      if (!isWindows) {
        return this.createTauriShellScript(workspacePath, projectInfo);
      }

      const batPath = path.join(workspacePath, 'dev.bat');

      const batContent = `@echo off
cd /d "%~dp0"
echo ========================================
echo   Tauri App - Development Mode
echo ========================================

REM ============================================================
REM Node.js/npm Detection - Finds Node.js if not in PATH
REM ============================================================
set NODE_EXE=
set NPM_EXE=

REM Check if npm is already in PATH
where npm >nul 2>&1
if not errorlevel 1 (
    set "NPM_EXE=npm"
    set "NODE_EXE=node"
    goto :node_found
)

REM Priority: Check user's specific A:\\Nodejs location first
if exist "A:\\Nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\Nodejs\\node.exe"
    set "NPM_EXE=A:\\Nodejs\\npm.cmd"
    set "PATH=A:\\Nodejs;%PATH%"
    goto :node_found
)
if exist "A:\\nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\nodejs\\node.exe"
    set "NPM_EXE=A:\\nodejs\\npm.cmd"
    set "PATH=A:\\nodejs;%PATH%"
    goto :node_found
)

REM Standard installation locations
if exist "C:\\Program Files\\nodejs\\npm.cmd" (
    set "NODE_EXE=C:\\Program Files\\nodejs\\node.exe"
    set "NPM_EXE=C:\\Program Files\\nodejs\\npm.cmd"
    set "PATH=C:\\Program Files\\nodejs;%PATH%"
    goto :node_found
)
if exist "%ProgramFiles%\\nodejs\\npm.cmd" (
    set "NODE_EXE=%ProgramFiles%\\nodejs\\node.exe"
    set "NPM_EXE=%ProgramFiles%\\nodejs\\npm.cmd"
    set "PATH=%ProgramFiles%\\nodejs;%PATH%"
    goto :node_found
)
if exist "%LOCALAPPDATA%\\Programs\\nodejs\\npm.cmd" (
    set "NODE_EXE=%LOCALAPPDATA%\\Programs\\nodejs\\node.exe"
    set "NPM_EXE=%LOCALAPPDATA%\\Programs\\nodejs\\npm.cmd"
    set "PATH=%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"
    goto :node_found
)
if exist "%APPDATA%\\nvm\\current\\npm.cmd" (
    set "NODE_EXE=%APPDATA%\\nvm\\current\\node.exe"
    set "NPM_EXE=%APPDATA%\\nvm\\current\\npm.cmd"
    set "PATH=%APPDATA%\\nvm\\current;%PATH%"
    goto :node_found
)

REM Check other common drive letters (excluding A since we checked it first)
for %%d in (D E F G H) do (
    if exist "%%d:\\Program Files\\nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\Program Files\\nodejs\\node.exe"
        set "NPM_EXE=%%d:\\Program Files\\nodejs\\npm.cmd"
        set "PATH=%%d:\\Program Files\\nodejs;%PATH%"
        goto :node_found
    )
    if exist "%%d:\\nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\nodejs\\node.exe"
        set "NPM_EXE=%%d:\\nodejs\\npm.cmd"
        set "PATH=%%d:\\nodejs;%PATH%"
        goto :node_found
    )
    if exist "%%d:\\Nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\Nodejs\\node.exe"
        set "NPM_EXE=%%d:\\Nodejs\\npm.cmd"
        set "PATH=%%d:\\Nodejs;%PATH%"
        goto :node_found
    )
)

REM If still not found, show error
echo [ERROR] Node.js/npm not found!
echo.
echo Please install Node.js from https://nodejs.org/
echo Or add Node.js to your system PATH.
pause
exit /b 1

:node_found
REM Node.js found, check for Rust/Cargo

REM ============================================================
REM Rust/Cargo Detection - Required for Tauri
REM ============================================================
set CARGO_EXE=

REM Check if cargo is already in PATH
where cargo >nul 2>&1
if not errorlevel 1 (
    set "CARGO_EXE=cargo"
    goto :rust_found
)

REM Check common Rust installation locations
if exist "C:\\Program Files\\Rust\\bin\\cargo.exe" (
    set "CARGO_EXE=C:\\Program Files\\Rust\\bin\\cargo.exe"
    set "PATH=C:\\Program Files\\Rust\\bin;%PATH%"
    goto :rust_found
)
if exist "%USERPROFILE%\\.cargo\\bin\\cargo.exe" (
    set "CARGO_EXE=%USERPROFILE%\\.cargo\\bin\\cargo.exe"
    set "PATH=%USERPROFILE%\\.cargo\\bin;%PATH%"
    goto :rust_found
)

REM Check other common drive letters for Rust
for %%d in (A D E F G H) do (
    if exist "%%d:\\Program Files\\Rust\\bin\\cargo.exe" (
        set "CARGO_EXE=%%d:\\Program Files\\Rust\\bin\\cargo.exe"
        set "PATH=%%d:\\Program Files\\Rust\\bin;%PATH%"
        goto :rust_found
    )
    if exist "%%d:\\.cargo\\bin\\cargo.exe" (
        set "CARGO_EXE=%%d:\\.cargo\\bin\\cargo.exe"
        set "PATH=%%d:\\.cargo\\bin;%PATH%"
        goto :rust_found
    )
)

REM If still not found, show error
echo [ERROR] Rust/Cargo not found!
echo.
echo Tauri requires Rust to be installed.
echo Please install Rust from https://rustup.rs/
echo Or add Rust/Cargo to your system PATH.
pause
exit /b 1

:rust_found
REM Both Node.js and Rust found, start Tauri development

echo [*] Starting Tauri development server...
echo [*] This will start both the Vite dev server and Tauri app
echo.

REM Use detected npm or fallback to npm in PATH
if defined NPM_EXE (
    call "%NPM_EXE%" run tauri:dev
) else (
    call npm run tauri:dev
)

if errorlevel 1 (
    echo.
    echo [ERROR] Tauri development failed!
    echo Make sure you have:
    echo - Node.js installed and accessible
    echo - Rust installed and accessible
    echo - All npm dependencies installed (run: npm install)
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Tauri development completed!
pause
`;

      fs.writeFileSync(batPath, batContent, 'utf-8');
      log.info(`[ProjectRunner] ✅ Created Tauri dev.bat for ${projectInfo.name}`);

      return { success: true, filePath: batPath };
    } catch (error: any) {
      log.error('[ProjectRunner] Failed to create Tauri .bat file:', error);
      return { success: false };
    }
  }

  /**
   * Create .bat file for Windows to run Node.js project
   * Includes Node.js auto-detection for systems where node isn't in PATH
   */
  static createNodeBatchFile(workspacePath: string, projectInfo: ProjectInfo): { success: boolean; filePath?: string } {
    if (projectInfo.type !== 'node' || !projectInfo.startCommand) {
      return { success: false };
    }
    
    try {
      const isWindows = process.platform === 'win32';
      if (!isWindows) {
        return this.createNodeShellScript(workspacePath, projectInfo);
      }
      
      const batPath = path.join(workspacePath, 'run.bat');
      
      // Get the npm script to run (e.g., 'start', 'dev', 'build')
      const npmScriptMatch = projectInfo.startCommand.match(/npm\s+(?:run\s+)?(\w+)/);
      const npmScript = npmScriptMatch ? npmScriptMatch[1] : 'start';
      const installBlock = this.shouldInstallNodeDependencies(workspacePath, projectInfo)
        ? `REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    call "%NPM_EXE%" install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)
`
        : `REM No package dependencies declared; skipping npm install.
`;
      
      const batContent = `@echo off
cd /d "%~dp0"
echo ========================================
echo   Running: ${npmScript}
echo ========================================

REM ============================================================
REM Node.js/npm Detection - Finds Node.js if not in PATH
REM ============================================================
set NODE_EXE=
set NPM_EXE=

REM Check if npm is already in PATH and get its ACTUAL location
REM (Using just "npm" can cause issues with local node_modules shims)
for /f "tokens=*" %%i in ('where npm.cmd 2^>nul') do (
    set "NPM_EXE=%%i"
    goto :found_npm_in_path
)
goto :check_locations

:found_npm_in_path
REM Extract directory from npm path to find node.exe
for %%i in ("%NPM_EXE%") do set "NODE_DIR=%%~dpi"
if exist "%NODE_DIR%node.exe" (
    set "NODE_EXE=%NODE_DIR%node.exe"
    set "PATH=%NODE_DIR%;%PATH%"
    goto :node_found
)
REM Fallback if node.exe not found beside npm
set "NODE_EXE=node"
goto :node_found

:check_locations
REM Check common Node.js installation locations

REM Priority: Check user's specific A:\Nodejs location first
if exist "A:\\Nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\Nodejs\\node.exe"
    set "NPM_EXE=A:\\Nodejs\\npm.cmd"
    set "PATH=A:\\Nodejs;%PATH%"
    goto :node_found
)
if exist "A:\\nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\nodejs\\node.exe"
    set "NPM_EXE=A:\\nodejs\\npm.cmd"
    set "PATH=A:\\nodejs;%PATH%"
    goto :node_found
)

REM Standard installation locations
if exist "C:\\Program Files\\nodejs\\npm.cmd" (
    set "NODE_EXE=C:\\Program Files\\nodejs\\node.exe"
    set "NPM_EXE=C:\\Program Files\\nodejs\\npm.cmd"
    set "PATH=C:\\Program Files\\nodejs;%PATH%"
    goto :node_found
)
if exist "%ProgramFiles%\\nodejs\\npm.cmd" (
    set "NODE_EXE=%ProgramFiles%\\nodejs\\node.exe"
    set "NPM_EXE=%ProgramFiles%\\nodejs\\npm.cmd"
    set "PATH=%ProgramFiles%\\nodejs;%PATH%"
    goto :node_found
)
if exist "%LOCALAPPDATA%\\Programs\\nodejs\\npm.cmd" (
    set "NODE_EXE=%LOCALAPPDATA%\\Programs\\nodejs\\node.exe"
    set "NPM_EXE=%LOCALAPPDATA%\\Programs\\nodejs\\npm.cmd"
    set "PATH=%LOCALAPPDATA%\\Programs\\nodejs;%PATH%"
    goto :node_found
)
if exist "%APPDATA%\\nvm\\current\\npm.cmd" (
    set "NODE_EXE=%APPDATA%\\nvm\\current\\node.exe"
    set "NPM_EXE=%APPDATA%\\nvm\\current\\npm.cmd"
    set "PATH=%APPDATA%\\nvm\\current;%PATH%"
    goto :node_found
)

REM Check other common drive letters (excluding A since we checked it first)
for %%d in (D E F G H) do (
    if exist "%%d:\\Program Files\\nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\Program Files\\nodejs\\node.exe"
        set "NPM_EXE=%%d:\\Program Files\\nodejs\\npm.cmd"
        set "PATH=%%d:\\Program Files\\nodejs;%PATH%"
        goto :node_found
    )
    if exist "%%d:\\nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\nodejs\\node.exe"
        set "NPM_EXE=%%d:\\nodejs\\npm.cmd"
        set "PATH=%%d:\\nodejs;%PATH%"
        goto :node_found
    )
    if exist "%%d:\\Nodejs\\npm.cmd" (
        set "NODE_EXE=%%d:\\Nodejs\\node.exe"
        set "NPM_EXE=%%d:\\Nodejs\\npm.cmd"
        set "PATH=%%d:\\Nodejs;%PATH%"
        goto :node_found
    )
)

REM If still not found, show error
echo [ERROR] Node.js/npm not found!
echo.
echo Please install Node.js from https://nodejs.org/
echo Or add Node.js to your system PATH.
pause
exit /b 1

:node_found
echo Using Node.js: %NODE_EXE%
echo.

${installBlock}

REM Run the project
echo Starting project...
call "%NPM_EXE%" run ${npmScript}

pause
`;
      
      fs.writeFileSync(batPath, batContent, 'utf-8');
      log.info(`[ProjectRunner] ✅ Created run.bat for Node.js project`);
      
      return { success: true, filePath: batPath };
    } catch (error: any) {
      log.error('[ProjectRunner] Failed to create Node.js .bat file:', error);
      return { success: false };
    }
  }
  
  /**
   * Create shell script for Node.js projects on Unix
   */
  static createNodeShellScript(workspacePath: string, projectInfo: ProjectInfo): { success: boolean; filePath?: string } {
    if (projectInfo.type !== 'node' || !projectInfo.startCommand) {
      return { success: false };
    }
    
    try {
      const npmScriptMatch = projectInfo.startCommand.match(/npm\s+(?:run\s+)?(\w+)/);
      const npmScript = npmScriptMatch ? npmScriptMatch[1] : 'start';
      const installBlock = this.shouldInstallNodeDependencies(workspacePath, projectInfo)
        ? `# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install || { echo "Failed to install dependencies"; exit 1; }
    echo
fi
`
        : `# No package dependencies declared; skipping npm install.
`;
      
      const shPath = path.join(workspacePath, 'run.sh');
      const shContent = `#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo "  Running: ${npmScript}"
echo "========================================"

${installBlock}

# Run the project
echo "Starting project..."
npm run ${npmScript}
`;
      
      fs.writeFileSync(shPath, shContent, 'utf-8');
      try {
        fs.chmodSync(shPath, 0o755);
      } catch (e) {
        // Ignore chmod errors on Windows
      }
      
      log.info(`[ProjectRunner] ✅ Created run.sh for Node.js project`);
      return { success: true, filePath: shPath };
    } catch (error: any) {
      log.error('[ProjectRunner] Failed to create Node.js shell script:', error);
      return { success: false };
    }
  }
  
  /**
   * Create .bat file for Windows to run Python project
   */
  static createBatchFile(workspacePath: string, projectInfo: ProjectInfo): { success: boolean; filePath?: string } {
    if (projectInfo.type !== 'python' || !projectInfo.mainFile) {
      return { success: false };
    }
    
    try {
      const isWindows = process.platform === 'win32';
      if (!isWindows) {
        // Create .sh file for Unix instead
        return this.createShellScript(workspacePath, projectInfo);
      }
      
      const batPath = path.join(workspacePath, 'run.bat');
      const batContent: string[] = [];
      
      batContent.push('@echo off');
      batContent.push('echo Starting Python project...');
      batContent.push('');
      
      // Activate virtual environment if it exists
      if (projectInfo.hasVirtualEnv && projectInfo.virtualEnvPath) {
        const venvActivate = path.join(projectInfo.virtualEnvPath, 'Scripts', 'activate.bat');
        batContent.push(`call "${venvActivate}"`);
        batContent.push('');
      }
      
      // Install dependencies if requirements.txt exists
      if (projectInfo.hasRequirements) {
        const pipCmd = projectInfo.hasVirtualEnv 
          ? path.join(projectInfo.virtualEnvPath!, 'Scripts', 'pip.exe')
          : 'pip';
        batContent.push(`echo Installing dependencies...`);
        batContent.push(`"${pipCmd}" install -r requirements.txt`);
        batContent.push('');
      }
      
      // Run the main file
      const pythonCmd = projectInfo.hasVirtualEnv && projectInfo.virtualEnvPath
        ? path.join(projectInfo.virtualEnvPath, 'Scripts', 'python.exe')
        : projectInfo.pythonPath || 'python';
      
      batContent.push(`echo Running ${projectInfo.mainFile}...`);
      batContent.push(`"${pythonCmd}" ${projectInfo.mainFile}`);
      batContent.push('');
      batContent.push('pause');
      
      fs.writeFileSync(batPath, batContent.join('\r\n'), 'utf-8');
      log.info(`[ProjectRunner] ✅ Created run.bat`);
      
      return { success: true, filePath: batPath };
    } catch (error: any) {
      log.error('[ProjectRunner] Failed to create .bat file:', error);
      return { success: false };
    }
  }
  
  /**
   * Create shell script for Unix systems
   */
  static createShellScript(workspacePath: string, projectInfo: ProjectInfo): { success: boolean; filePath?: string } {
    if (projectInfo.type !== 'python' || !projectInfo.mainFile) {
      return { success: false };
    }
    
    try {
      const shPath = path.join(workspacePath, 'run.sh');
      const shContent: string[] = [];
      
      shContent.push('#!/bin/bash');
      shContent.push('echo "Starting Python project..."');
      shContent.push('');
      
      // Activate virtual environment if it exists
      if (projectInfo.hasVirtualEnv && projectInfo.virtualEnvPath) {
        const venvActivate = path.join(projectInfo.virtualEnvPath, 'bin', 'activate');
        shContent.push(`source "${venvActivate}"`);
        shContent.push('');
      }
      
      // Install dependencies if requirements.txt exists
      if (projectInfo.hasRequirements) {
        const pipCmd = projectInfo.hasVirtualEnv 
          ? path.join(projectInfo.virtualEnvPath!, 'bin', 'pip')
          : 'pip3';
        shContent.push('echo "Installing dependencies..."');
        shContent.push(`${pipCmd} install -r requirements.txt`);
        shContent.push('');
      }
      
      // Run the main file
      const pythonCmd = projectInfo.hasVirtualEnv && projectInfo.virtualEnvPath
        ? path.join(projectInfo.virtualEnvPath, 'bin', 'python')
        : projectInfo.pythonPath || 'python3';
      
      shContent.push(`echo "Running ${projectInfo.mainFile}..."`);
      shContent.push(`${pythonCmd} ${projectInfo.mainFile}`);
      
      fs.writeFileSync(shPath, shContent.join('\n'), 'utf-8');
      // Make executable
      try {
        fs.chmodSync(shPath, 0o755);
      } catch (e) {
        // Ignore on Windows
      }
      
      log.info(`[ProjectRunner] ✅ Created run.sh`);
      return { success: true, filePath: shPath };
    } catch (error: any) {
      log.error('[ProjectRunner] Failed to create shell script:', error);
      return { success: false };
    }
  }
  
  /**
   * Full workflow: detect, validate, install, run
   */
  static async autoRun(workspacePath: string): Promise<{
    success: boolean;
    projectInfo: ProjectInfo;
    validation: { valid: boolean; issues: string[] };
    installResult?: { success: boolean; output: string };
    buildResult?: { success: boolean; output: string };
    runResult?: { success: boolean; output: string; port?: number; url?: string };
  }> {
    log.info(`[ProjectRunner] 🔍 Detecting project in ${workspacePath}...`);
    const telemetry = getTelemetryService();
    const runPhase = async <T>(phase: string, operation: () => Promise<T>): Promise<T> => {
      const startedAt = Date.now();
      telemetry.track('generation_phase', { phase, status: 'start', workspacePath });
      try {
        const result = await operation();
        telemetry.track('generation_phase', {
          phase,
          status: 'success',
          workspacePath,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error: any) {
        telemetry.track('generation_phase', {
          phase,
          status: 'failure',
          workspacePath,
          durationMs: Date.now() - startedAt,
          error: error?.message || String(error),
        });
        throw error;
      }
    };
    
    const projectInfo = await runPhase('project_runner:detect', () => this.detectProject(workspacePath));
    log.info(`[ProjectRunner] Detected: ${projectInfo.displayName}`);
    
    // For Python projects: create virtual environment if needed
    if (projectInfo.type === 'python' && !projectInfo.hasVirtualEnv) {
      log.info('[ProjectRunner] Creating virtual environment...');
      const venvResult = await this.createVirtualEnv(workspacePath, projectInfo.pythonPath);
      if (venvResult.success && venvResult.path) {
        projectInfo.hasVirtualEnv = true;
        projectInfo.virtualEnvPath = venvResult.path;
        // Update start command to use venv
        if (projectInfo.mainFile) {
          const isWindows = process.platform === 'win32';
          const pythonExe = isWindows ? 'python.exe' : 'python';
          const venvPython = path.join(venvResult.path, isWindows ? 'Scripts' : 'bin', pythonExe);
          projectInfo.startCommand = `${venvPython} ${projectInfo.mainFile}`;
        }
      }
    }
    
    // Create .bat/.sh file for Python projects
    if (projectInfo.type === 'python') {
      const batResult = this.createBatchFile(workspacePath, projectInfo);
      if (batResult.success && batResult.filePath) {
        log.info(`[ProjectRunner] ✅ Created launcher: ${batResult.filePath}`);
      }
    }
    
    // Create .bat/.sh file for Tauri projects
    if (projectInfo.type === 'tauri' && projectInfo.startCommand) {
      const batResult = this.createTauriBatchFile(workspacePath, projectInfo);
      if (batResult.success && batResult.filePath) {
        log.info(`[ProjectRunner] ✅ Created Tauri dev launcher: ${batResult.filePath}`);
      }
    }

    // Create .bat/.sh file for Node.js projects (excluding Tauri)
    if (projectInfo.type === 'node' && projectInfo.startCommand) {
      const batResult = this.createNodeBatchFile(workspacePath, projectInfo);
      if (batResult.success && batResult.filePath) {
        log.info(`[ProjectRunner] ✅ Created Node.js launcher: ${batResult.filePath}`);
      }
    }
    
    const validation = await runPhase('project_runner:validate', () => this.validateProject(workspacePath, projectInfo));
    
    let installResult;
    if (projectInfo.requiresInstall) {
      installResult = await runPhase('project_runner:install', () => this.installDependencies(workspacePath, projectInfo));
    }

    let buildResult;
    if (projectInfo.buildCommand && (installResult?.success ?? true)) {
      buildResult = await runPhase('project_runner:build', () => this.runBuild(workspacePath, projectInfo));
    }
    
    let runResult;
    if ((projectInfo.startCommand || projectInfo.kind === 'static') && validation.valid && (buildResult?.success ?? true) && (installResult?.success ?? true)) {
      runResult = await runPhase('project_runner:run', () => this.runProject(workspacePath, projectInfo, { probeOnly: true }));
    }
    
    return {
      success: validation.valid && (installResult?.success ?? true) && (buildResult?.success ?? true) && (runResult?.success ?? false),
      projectInfo,
      validation,
      installResult,
      buildResult,
      runResult
    };
  }

  static async launchProject(workspacePath: string): Promise<{
    success: boolean;
    message: string;
    url?: string;
    error?: string;
    projectInfo?: ProjectInfo;
  }> {
    const projectInfo = await this.detectProject(workspacePath);

    if (projectInfo.type === 'unknown') {
      return {
        success: false,
        message: 'Could not detect project type',
        error: 'Could not detect project type',
        projectInfo,
      };
    }

    const validation = await this.validateProject(workspacePath, projectInfo);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.issues.join('; '),
        error: validation.issues.join('; '),
        projectInfo,
      };
    }

    if (projectInfo.requiresInstall) {
      const installResult = await this.installDependencies(workspacePath, projectInfo);
      if (!installResult.success) {
        return {
          success: false,
          message: installResult.output,
          error: installResult.output,
          projectInfo,
        };
      }
    }

    if (projectInfo.buildCommand) {
      const buildResult = await this.runBuild(workspacePath, projectInfo);
      if (!buildResult.success) {
        return {
          success: false,
          message: buildResult.output,
          error: buildResult.output,
          projectInfo,
        };
      }
    }

    const runResult = await this.runProject(workspacePath, projectInfo);
    if (!runResult.success) {
      return {
        success: false,
        message: runResult.output,
        error: runResult.output,
        url: runResult.url,
        projectInfo,
      };
    }

    if (projectInfo.kind === 'static' && runResult.url) {
      const { shell } = require('electron');
      await shell.openExternal(runResult.url);
      return {
        success: true,
        message: 'Opened static site in browser',
        url: runResult.url,
        projectInfo,
      };
    }

    if (runResult.url) {
      const { shell } = require('electron');
      setTimeout(() => {
        void shell.openExternal(runResult.url);
      }, 2000);
    }

    return {
      success: true,
      message: runResult.output,
      url: runResult.url,
      projectInfo,
    };
  }
}

