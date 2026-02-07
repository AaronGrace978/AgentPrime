/**
 * Backend Manager
 * Automatically starts and manages the Python FastAPI backend server
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { app } from 'electron';

const BRAIN_URL = process.env.BRAIN_URL || 'http://127.0.0.1:8000';
const BACKEND_CHECK_INTERVAL = 2000; // Check every 2 seconds
const BACKEND_START_TIMEOUT = 30000; // 30 seconds to start

let backendProcess: ChildProcess | null = null;
let isChecking = false;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Check if the backend is running by making a health check request
 */
async function isBackendRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(`${BRAIN_URL}/api/status`);
    const options = {
      hostname: url.hostname,
      port: url.port || 8000,
      path: url.pathname,
      method: 'GET',
      timeout: 2000
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.setTimeout(2000);
    req.end();
  });
}

/**
 * Get the backend directory path
 */
function getBackendPath(): string {
  const appRoot = app.isPackaged
    ? path.dirname(process.execPath)
    : path.join(__dirname, '../..');
  return path.join(appRoot, 'backend');
}

/**
 * Start the Python backend server
 */
async function startBackend(): Promise<boolean> {
  if (backendProcess) {
    console.log('[BackendManager] Backend already running');
    return true;
  }

  const backendPath = getBackendPath();
  const runPyPath = path.join(backendPath, 'run.py');
  const venvPythonPath = path.join(backendPath, 'venv', 'Scripts', 'python.exe'); // Windows
  const venvPythonPathUnix = path.join(backendPath, 'venv', 'bin', 'python'); // Unix

  // Check if backend directory exists
  if (!fs.existsSync(backendPath)) {
    console.warn(`[BackendManager] Backend directory not found: ${backendPath}`);
    return false;
  }

  // Check if run.py exists
  if (!fs.existsSync(runPyPath)) {
    console.warn(`[BackendManager] run.py not found: ${runPyPath}`);
    return false;
  }

  // Determine Python executable - Check multiple locations for cross-machine compatibility
  // Supports both laptop (E:\, A:\) and desktop (C:\, G:\, etc.) configurations
  let pythonCmd: string = process.platform === 'win32' ? 'python' : 'python3';
  if (process.platform === 'win32') {
    const username = process.env.USERNAME || process.env.USER || 'User';
    const localAppData = process.env.LOCALAPPDATA || path.join('C:', 'Users', username, 'AppData', 'Local');
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    
    // Common Python installation locations to check (in order of preference)
    const pythonLocations = [
      // Standard Windows Python installations (Python 3.13, 3.12, 3.11, etc.)
      path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
      path.join(programFiles, 'Python313', 'python.exe'),
      path.join(programFiles, 'Python312', 'python.exe'),
      path.join(programFiles, 'Python311', 'python.exe'),
      path.join(programFiles, 'Python310', 'python.exe'),
      // Desktop locations (common)
      path.join('C:', 'Python', 'python.exe'),
      path.join('C:', 'python.exe'),
      path.join('G:', 'Python', 'python.exe'),
      path.join('G:', 'python.exe'),
      // Laptop locations (preserved for compatibility)
      path.join('E:', 'Python', 'python.exe'),
      path.join('E:', 'python.exe'),
      path.join('A:', 'Python', 'python.exe'),
      path.join('A:', 'python.exe'),
      // Other common drives
      path.join('D:', 'Python', 'python.exe'),
      path.join('D:', 'python.exe'),
      path.join('F:', 'Python', 'python.exe'),
      path.join('F:', 'python.exe'),
    ];
    
    // Check each location
    let found = false;
    for (const pythonPath of pythonLocations) {
      if (fs.existsSync(pythonPath)) {
        pythonCmd = pythonPath;
        found = true;
        console.log(`[BackendManager] Found Python at: ${pythonPath}`);
        break;
      }
    }
    
    // If not found in specific locations, try venv or PATH
    if (!found) {
      if (fs.existsSync(venvPythonPath)) {
        pythonCmd = venvPythonPath;
        console.log(`[BackendManager] Using venv Python: ${venvPythonPath}`);
      } else {
        // Try to verify 'python' works from PATH
        pythonCmd = 'python'; // Fallback to PATH
        console.log(`[BackendManager] Using Python from PATH: ${pythonCmd}`);
      }
    }
  } else {
    if (fs.existsSync(venvPythonPathUnix)) {
      pythonCmd = venvPythonPathUnix;
    } else {
      pythonCmd = 'python3';
    }
  }

  console.log(`[BackendManager] 🚀 Starting Python backend...`);
  console.log(`[BackendManager]   Python: ${pythonCmd}`);
  console.log(`[BackendManager]   Script: ${runPyPath}`);
  console.log(`[BackendManager]   CWD: ${backendPath}`);

  try {
    // Set environment variables
    const env = {
      ...process.env,
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || '',  // No API key for local Ollama
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5-coder:14b',  // Local model
      WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || ''
    };

    // Spawn the backend process
    backendProcess = spawn(pythonCmd, [runPyPath], {
      cwd: backendPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    // Handle stdout
    backendProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[Backend] ${output}`);
      }
    });

    // Handle stderr
    backendProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (output && !output.includes('INFO:') && !output.includes('WARNING:')) {
        console.error(`[Backend] ${output}`);
      }
    });

    // Handle process exit
    backendProcess.on('exit', (code, signal) => {
      console.log(`[BackendManager] Backend process exited (code: ${code}, signal: ${signal})`);
      backendProcess = null;
      
      // Restart if it crashed (but not if we're shutting down)
      if (code !== 0 && code !== null) {
        console.log('[BackendManager] Backend crashed, will attempt restart...');
        setTimeout(() => {
          if (!backendProcess) {
            startBackend().catch(console.error);
          }
        }, 5000);
      }
    });

    // Handle process error
    backendProcess.on('error', (error) => {
      console.error(`[BackendManager] Failed to start backend: ${error.message}`);
      backendProcess = null;
    });

    // Wait a bit and check if it started successfully
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const isRunning = await isBackendRunning();
    if (isRunning) {
      console.log('[BackendManager] ✅ Backend started successfully');
      return true;
    } else {
      console.warn('[BackendManager] ⚠️  Backend process started but not responding yet');
      // Give it more time
      await new Promise(resolve => setTimeout(resolve, 5000));
      const stillRunning = await isBackendRunning();
      if (stillRunning) {
        console.log('[BackendManager] ✅ Backend is now responding');
        return true;
      }
      return false;
    }
  } catch (error: any) {
    console.error(`[BackendManager] ❌ Error starting backend: ${error.message}`);
    backendProcess = null;
    return false;
  }
}

/**
 * Stop the backend server
 */
export function stopBackend(): void {
  if (backendProcess) {
    console.log('[BackendManager] Stopping backend...');
    backendProcess.kill();
    backendProcess = null;
  }
  
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

/**
 * Initialize backend manager - starts monitoring and auto-starts backend if needed
 */
export async function initializeBackendManager(): Promise<void> {
  console.log('[BackendManager] Initializing...');
  
  // Check if backend is already running
  const isRunning = await isBackendRunning();
  if (isRunning) {
    console.log('[BackendManager] ✅ Backend is already running');
    return;
  }

  // Start the backend
  const started = await startBackend();
  if (!started) {
    console.warn('[BackendManager] ⚠️  Failed to start backend automatically');
    console.warn('[BackendManager]    You can start it manually: cd backend && python run.py');
  }

  // Start periodic health checks
  checkInterval = setInterval(async () => {
    if (isChecking) return;
    isChecking = true;

    try {
      const running = await isBackendRunning();
      if (!running && !backendProcess) {
        // Backend is down and we're not starting it, try to restart
        console.log('[BackendManager] Backend is down, attempting restart...');
        await startBackend();
      }
    } catch (error) {
      // Ignore errors during health check
    } finally {
      isChecking = false;
    }
  }, BACKEND_CHECK_INTERVAL);
}

/**
 * Cleanup on app quit
 */
app.on('before-quit', () => {
  stopBackend();
});

