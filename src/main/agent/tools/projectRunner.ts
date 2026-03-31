/**
 * Project Runner Tool
 * Automatically detects and runs completed projects
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProjectInfo {
  type: 'node' | 'python' | 'html' | 'tauri' | 'unknown';
  hasPackageJson: boolean;
  hasRequirements: boolean;
  hasIndexHtml: boolean;
  name?: string;
  mainFile?: string;
  startCommand?: string;
  pythonPath?: string;
  hasVirtualEnv?: boolean;
  virtualEnvPath?: string;
}

export class ProjectRunner {
  private static isBundlerProject(workspacePath: string, packageJson: any): boolean {
    if (fs.existsSync(path.join(workspacePath, 'vite.config.ts')) || fs.existsSync(path.join(workspacePath, 'vite.config.js'))) {
      return true;
    }

    const deps = {
      ...(packageJson?.dependencies || {}),
      ...(packageJson?.devDependencies || {})
    };

    return Boolean(deps.vite || deps.webpack || deps.parcel || deps.next || deps['@vitejs/plugin-react']);
  }

  /**
   * Detect project type and structure
   */
  static async detectProject(workspacePath: string): Promise<ProjectInfo> {
    const info: ProjectInfo = {
      type: 'unknown',
      hasPackageJson: false,
      hasRequirements: false,
      hasIndexHtml: false
    };

    try {
      const files = fs.readdirSync(workspacePath);
      
      // Check for Node.js project
      if (files.includes('package.json')) {
        info.hasPackageJson = true;

        try {
          const packageJson = JSON.parse(
            fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8')
          );

          // Check for Tauri project (has @tauri-apps dependencies and src-tauri directory)
          const hasTauriDeps = packageJson.dependencies?.['@tauri-apps/api'] ||
                              packageJson.devDependencies?.['@tauri-apps/api'] ||
                              packageJson.devDependencies?.['@tauri-apps/cli'];
          const hasTauriDir = files.includes('src-tauri');

          if (hasTauriDeps && hasTauriDir) {
            info.type = 'tauri';
            info.name = packageJson.name || 'Tauri App';
            // For Tauri, prefer tauri:dev over regular dev
            if (packageJson.scripts?.['tauri:dev']) {
              info.startCommand = `npm run tauri:dev`;
            } else if (packageJson.scripts?.dev) {
              info.startCommand = `npm run dev`;
            } else if (packageJson.scripts?.start) {
              info.startCommand = `npm start`;
            }
          } else {
            info.type = 'node';
            info.name = packageJson.name || 'Node.js App';
            const bundlerProject = this.isBundlerProject(workspacePath, packageJson);
            // Get start command for regular Node.js projects
            if (bundlerProject && packageJson.scripts?.dev) {
              info.startCommand = `npm run dev`;
            } else if (packageJson.scripts?.start) {
              info.startCommand = `npm start`;
            } else if (packageJson.scripts?.dev) {
              info.startCommand = `npm run dev`;
            } else if (packageJson.main) {
              info.mainFile = packageJson.main;
              info.startCommand = `node ${packageJson.main}`;
            } else if (files.includes('server.js')) {
              info.mainFile = 'server.js';
              info.startCommand = 'node server.js';
            } else if (files.includes('index.js')) {
              info.mainFile = 'index.js';
              info.startCommand = 'node index.js';
            }
          }
        } catch (e) {
          console.warn('[ProjectRunner] Failed to parse package.json:', e);
        }
      }
      
      // Check for Python project
      const hasPyFiles = files.some(f => f.endsWith('.py'));
      if (files.includes('requirements.txt') || files.includes('main.py') || files.includes('app.py') || hasPyFiles) {
        info.hasRequirements = files.includes('requirements.txt');
        if (info.type === 'unknown') {
          info.type = 'python';
        }
        
        // Detect Python installation
        info.pythonPath = await this.findPython();
        
        // Check for virtual environment (directories only — .env files are dotenv, not venvs)
        const venvCandidates = ['venv', '.venv', 'env'];
        for (const candidate of venvCandidates) {
          const candidatePath = path.join(workspacePath, candidate);
          try {
            if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
              const hasActivate = fs.existsSync(path.join(candidatePath, 'Scripts', 'activate')) ||
                                  fs.existsSync(path.join(candidatePath, 'bin', 'activate'));
              if (hasActivate) {
                info.hasVirtualEnv = true;
                info.virtualEnvPath = candidatePath;
                break;
              }
            }
          } catch { /* stat failed — skip */ }
        }
        
        // Find main Python file
        const pyFiles = files.filter(f => f.endsWith('.py'));
        if (files.includes('main.py')) {
          info.mainFile = 'main.py';
        } else if (files.includes('app.py')) {
          info.mainFile = 'app.py';
        } else if (pyFiles.length > 0) {
          info.mainFile = pyFiles[0];
        }
        
        // Set start command with virtual environment if available
        if (info.mainFile) {
          if (info.hasVirtualEnv && info.virtualEnvPath) {
            const isWindows = process.platform === 'win32';
            const activateScript = isWindows ? 'activate.bat' : 'activate';
            const pythonExe = isWindows ? 'python.exe' : 'python';
            const venvPython = path.join(info.virtualEnvPath, 'Scripts', pythonExe);
            info.startCommand = `${venvPython} ${info.mainFile}`;
          } else {
            const pythonCmd = info.pythonPath || 'python';
            info.startCommand = `${pythonCmd} ${info.mainFile}`;
          }
        }
      }
      
      // Check for HTML project
      if (files.includes('index.html')) {
        info.hasIndexHtml = true;
        if (info.type === 'unknown') {
          info.type = 'html';
        }
      }
      
    } catch (error) {
      console.error('[ProjectRunner] Error detecting project:', error);
    }
    
    return info;
  }
  
  /**
   * Install dependencies if needed
   */
  static async installDependencies(workspacePath: string, projectInfo: ProjectInfo): Promise<{ success: boolean; output: string }> {
    try {
      if (projectInfo.type === 'node' && projectInfo.hasPackageJson) {
        console.log('[ProjectRunner] Installing npm dependencies...');
        
        // Import tool-path-finder to get proper npm command and environment
        // CRITICAL: getNodeEnv() ensures child processes can find node.exe
        const { resolveCommand, getNodeEnv } = require('../../core/tool-path-finder');
        const npmCommand = resolveCommand('npm install');
        const env = getNodeEnv();
        
        console.log('[ProjectRunner] Running:', npmCommand);
        
        const { stdout, stderr } = await execAsync(npmCommand, {
          cwd: workspacePath,
          timeout: 180000, // 3 minutes
          env: env,
          maxBuffer: 10 * 1024 * 1024
        });
        return { success: true, output: stdout + stderr };
      }
      
      if (projectInfo.type === 'python' && projectInfo.hasRequirements) {
        console.log('[ProjectRunner] Installing Python dependencies...');
        
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
        
        const { stdout, stderr } = await execAsync(`${pipCmd} install -r requirements.txt`, {
          cwd: workspacePath,
          timeout: 120000
        });
        return { success: true, output: stdout + stderr };
      }
      
      return { success: true, output: 'No dependencies to install' };
    } catch (error: any) {
      console.error('[ProjectRunner] Dependency installation failed:', error);
      return { 
        success: false, 
        output: error.message || 'Installation failed' 
      };
    }
  }
  
  /**
   * Run the project
   */
  static async runProject(workspacePath: string, projectInfo: ProjectInfo): Promise<{ success: boolean; output: string; port?: number }> {
    if (!projectInfo.startCommand) {
      return { success: false, output: 'No start command found' };
    }
    
    // Check if dependencies need to be installed first
    if (projectInfo.type === 'node' && projectInfo.hasPackageJson) {
      const nodeModulesPath = path.join(workspacePath, 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        console.log('[ProjectRunner] 📦 Dependencies not found, installing...');
        const installResult = await this.installDependencies(workspacePath, projectInfo);
        if (!installResult.success) {
          return { 
            success: false, 
            output: `Failed to install dependencies: ${installResult.output}\n\nPlease run 'npm install' manually in the project directory.` 
          };
        }
        console.log('[ProjectRunner] ✅ Dependencies installed successfully');
      }
    }
    
    // For Node.js servers, try to detect port (also used for port-conflict recovery in catch blocks)
    let port: number | undefined;

    try {
      console.log(`[ProjectRunner] 🚀 Running: ${projectInfo.startCommand}`);
      
      // For Node.js servers, try to detect port
      if (projectInfo.type === 'node') {
        // Try to extract port from common patterns
        try {
          const serverFiles = ['server.js', 'index.js', 'app.js', projectInfo.mainFile].filter(Boolean);
          for (const file of serverFiles) {
            if (file) {
              const content = fs.readFileSync(path.join(workspacePath, file), 'utf-8');
              const portMatch = content.match(/\.listen\((\d+)/) || content.match(/port[:\s=]+(\d+)/i);
              if (portMatch) {
                port = parseInt(portMatch[1]);
                break;
              }
            }
          }
        } catch (e) {
          // Ignore
        }
      }
      
      // Start the project in background
      // CRITICAL: Use getNodeEnv() to ensure npm scripts can find node and binaries in node_modules/.bin
      const { getNodeEnv } = require('../../core/tool-path-finder');
      const nodeEnv = getNodeEnv();
      
      const child = exec(projectInfo.startCommand, {
        cwd: workspacePath,
        env: { ...nodeEnv, NODE_ENV: 'development' }
      });
      
      // Collect output
      let output = '';
      child.stdout?.on('data', (data) => {
        output += data.toString();
        console.log(`[ProjectRunner] ${data.toString().trim()}`);
      });
      
      child.stderr?.on('data', (data) => {
        output += data.toString();
        console.error(`[ProjectRunner] ${data.toString().trim()}`);
      });
      
      // Wait a bit to see if it starts successfully
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check for EADDRINUSE error in output
      if (output.includes('EADDRINUSE') || output.includes('address already in use')) {
        console.log('[ProjectRunner] 🔧 Port conflict detected, finding available port...');
        
        // Try to auto-fix port conflict
        if (projectInfo.type === 'node' && port) {
          const newPort = await this.findAvailablePort(port);
          if (newPort && newPort !== port) {
            console.log(`[ProjectRunner] 🔧 Switching from port ${port} to ${newPort}`);
            
            // Update server file with new port
            const serverFiles = ['server.js', 'index.js', 'app.js', projectInfo.mainFile].filter(Boolean);
            for (const file of serverFiles) {
              if (file) {
                try {
                  const filePath = path.join(workspacePath, file);
                  let content = fs.readFileSync(filePath, 'utf-8');
                  
                  // Replace port in various formats
                  content = content.replace(
                    new RegExp(`(PORT|port)[\\s:=]+${port}`, 'g'),
                    `$1 = ${newPort}`
                  );
                  content = content.replace(
                    new RegExp(`\\.listen\\(${port}`, 'g'),
                    `.listen(${newPort}`
                  );
                  content = content.replace(
                    new RegExp(`:${port}`, 'g'),
                    `:${newPort}`
                  );
                  
                  fs.writeFileSync(filePath, content, 'utf-8');
                  console.log(`[ProjectRunner] ✅ Updated ${file} with port ${newPort}`);
                  
                  // Kill the failed process
                  try { child.kill(); } catch (e) {}
                  
                  // Retry with new port
                  return await this.runProject(workspacePath, { ...projectInfo, startCommand: projectInfo.startCommand?.replace(String(port), String(newPort)) });
                } catch (e) {
                  console.warn(`[ProjectRunner] Failed to update ${file}:`, e);
                }
              }
            }
          }
        }
        
        return { 
          success: false, 
          output: `Port ${port} is in use. Please stop the process using that port or change the port in your server file.` 
        };
      }
      
      // Check if process is still running
      if (child.killed || child.exitCode !== null) {
        return { 
          success: false, 
          output: output || 'Process exited immediately' 
        };
      }
      
      return { 
        success: true, 
        output: output || 'Project started successfully',
        port 
      };
      
    } catch (error: any) {
      console.error('[ProjectRunner] Run failed:', error);
      
      // Check if it's a port conflict error
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('EADDRINUSE') || errorMsg.includes('address already in use')) {
        if (projectInfo.type === 'node' && port) {
          const newPort = await this.findAvailablePort(port);
          if (newPort && newPort !== port) {
            console.log(`[ProjectRunner] 🔧 Auto-fixing port conflict: ${port} → ${newPort}`);
            // Recursively retry with new port (will update file in recursive call)
            const serverFiles = ['server.js', 'index.js', 'app.js', projectInfo.mainFile].filter(Boolean);
            for (const file of serverFiles) {
              if (file) {
                try {
                  const filePath = path.join(workspacePath, file);
                  let content = fs.readFileSync(filePath, 'utf-8');
                  content = content.replace(new RegExp(String(port), 'g'), String(newPort));
                  fs.writeFileSync(filePath, content, 'utf-8');
                  return await this.runProject(workspacePath, { ...projectInfo, startCommand: projectInfo.startCommand?.replace(String(port), String(newPort)) });
                } catch (e) {
                  // Continue to next file
                }
              }
            }
          }
        }
      }
      
      return { 
        success: false, 
        output: error.message || 'Failed to run project' 
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
      if (projectInfo.type === 'node' && projectInfo.hasPackageJson) {
        // Check if main file exists
        if (projectInfo.mainFile) {
          const mainPath = path.join(workspacePath, projectInfo.mainFile);
          if (!fs.existsSync(mainPath)) {
            issues.push(`Main file ${projectInfo.mainFile} not found`);
          }
        }
        
        // Check for node_modules (dependencies installed)
        if (!fs.existsSync(path.join(workspacePath, 'node_modules'))) {
          issues.push('Dependencies not installed (run npm install)');
        }
      }
      
      if (projectInfo.type === 'python') {
        if (projectInfo.mainFile) {
          const mainPath = path.join(workspacePath, projectInfo.mainFile);
          if (!fs.existsSync(mainPath)) {
            issues.push(`Main file ${projectInfo.mainFile} not found`);
          }
        }
      }
      
      if (projectInfo.type === 'html' && projectInfo.hasIndexHtml) {
        const indexPath = path.join(workspacePath, 'index.html');
        if (!fs.existsSync(indexPath)) {
          issues.push('index.html not found');
        }
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
        const { stdout } = await execAsync(`${cmd} --version`, { timeout: 5000 });
        if (stdout.includes('Python')) {
          console.log(`[ProjectRunner] ✅ Found Python: ${cmd} (${stdout.trim()})`);
          return cmd;
        }
      } catch (e) {
        // Try next command
      }
    }
    
    console.warn('[ProjectRunner] ⚠️ Python not found in PATH');
    return undefined;
  }
  
  /**
   * Create virtual environment for Python project
   */
  static async createVirtualEnv(workspacePath: string, pythonPath?: string): Promise<{ success: boolean; path?: string; output: string }> {
    const venvPath = path.join(workspacePath, 'venv');
    
    // Check if venv already exists
    if (fs.existsSync(venvPath)) {
      console.log('[ProjectRunner] Virtual environment already exists');
      return { success: true, path: venvPath, output: 'Virtual environment already exists' };
    }
    
    try {
      const pythonCmd = pythonPath || await this.findPython() || 'python';
      console.log(`[ProjectRunner] Creating virtual environment with ${pythonCmd}...`);
      
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
      console.error('[ProjectRunner] Failed to create virtual environment:', error);
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
      console.log(`[ProjectRunner] ✅ Created Tauri dev.sh for ${projectInfo.name}`);

      return { success: true, filePath: shPath };
    } catch (error: any) {
      console.error('[ProjectRunner] Failed to create Tauri shell script:', error);
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
      console.log(`[ProjectRunner] ✅ Created Tauri dev.bat for ${projectInfo.name}`);

      return { success: true, filePath: batPath };
    } catch (error: any) {
      console.error('[ProjectRunner] Failed to create Tauri .bat file:', error);
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

REM Install dependencies if node_modules doesn't exist
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

REM Run the project
echo Starting project...
call "%NPM_EXE%" run ${npmScript}

pause
`;
      
      fs.writeFileSync(batPath, batContent, 'utf-8');
      console.log(`[ProjectRunner] ✅ Created run.bat for Node.js project`);
      
      return { success: true, filePath: batPath };
    } catch (error: any) {
      console.error('[ProjectRunner] Failed to create Node.js .bat file:', error);
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
      
      const shPath = path.join(workspacePath, 'run.sh');
      const shContent = `#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo "  Running: ${npmScript}"
echo "========================================"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install || { echo "Failed to install dependencies"; exit 1; }
    echo
fi

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
      
      console.log(`[ProjectRunner] ✅ Created run.sh for Node.js project`);
      return { success: true, filePath: shPath };
    } catch (error: any) {
      console.error('[ProjectRunner] Failed to create Node.js shell script:', error);
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
      console.log(`[ProjectRunner] ✅ Created run.bat`);
      
      return { success: true, filePath: batPath };
    } catch (error: any) {
      console.error('[ProjectRunner] Failed to create .bat file:', error);
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
      
      console.log(`[ProjectRunner] ✅ Created run.sh`);
      return { success: true, filePath: shPath };
    } catch (error: any) {
      console.error('[ProjectRunner] Failed to create shell script:', error);
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
    runResult?: { success: boolean; output: string; port?: number };
  }> {
    console.log(`[ProjectRunner] 🔍 Detecting project in ${workspacePath}...`);
    
    const projectInfo = await this.detectProject(workspacePath);
    console.log(`[ProjectRunner] Detected: ${projectInfo.type} project`);
    
    // For Python projects: create virtual environment if needed
    if (projectInfo.type === 'python' && !projectInfo.hasVirtualEnv) {
      console.log('[ProjectRunner] Creating virtual environment...');
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
        console.log(`[ProjectRunner] ✅ Created launcher: ${batResult.filePath}`);
      }
    }
    
    // Create .bat/.sh file for Tauri projects
    if (projectInfo.type === 'tauri' && projectInfo.startCommand) {
      const batResult = this.createTauriBatchFile(workspacePath, projectInfo);
      if (batResult.success && batResult.filePath) {
        console.log(`[ProjectRunner] ✅ Created Tauri dev launcher: ${batResult.filePath}`);
      }
    }

    // Create .bat/.sh file for Node.js projects (excluding Tauri)
    if (projectInfo.type === 'node' && projectInfo.startCommand) {
      const batResult = this.createNodeBatchFile(workspacePath, projectInfo);
      if (batResult.success && batResult.filePath) {
        console.log(`[ProjectRunner] ✅ Created Node.js launcher: ${batResult.filePath}`);
      }
    }
    
    const validation = await this.validateProject(workspacePath, projectInfo);
    
    let installResult;
    if (projectInfo.type !== 'unknown' && projectInfo.type !== 'html') {
      installResult = await this.installDependencies(workspacePath, projectInfo);
    }
    
    let runResult;
    if (projectInfo.startCommand && validation.valid) {
      runResult = await this.runProject(workspacePath, projectInfo);
    }
    
    return {
      success: validation.valid && (runResult?.success ?? false),
      projectInfo,
      validation,
      installResult,
      runResult
    };
  }
}

