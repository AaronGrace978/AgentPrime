/**
 * System Scanner Module
 * Scans the user's system for Python environments, project directories, and development tools
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class SystemScanner {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cached result or execute function
   */
  getCached(key, fn) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const result = fn();
    this.cache.set(key, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Execute command and return result or null if failed
   */
  async execCommand(command, timeout = 5000) {
    return new Promise((resolve) => {
      try {
        const result = execSync(command, {
          timeout,
          encoding: 'utf8',
          windowsHide: true
        });
        resolve(result.trim());
      } catch (error) {
        resolve(null);
      }
    });
  }

  /**
   * Check if a command exists in PATH
   */
  async commandExists(command) {
    const result = await this.execCommand(`where ${command}`);
    return result !== null;
  }

  /**
   * Get Python version from executable
   */
  async getPythonVersion(executable) {
    try {
      const result = await this.execCommand(`"${executable}" --version`);
      if (result) {
        // Extract version from "Python X.Y.Z" format
        const match = result.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/);
        return match ? match[1] : result;
      }
    } catch (error) {
      // Try with timeout for slow commands
      return new Promise((resolve) => {
        const child = spawn(executable, ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });

        let output = '';
        child.stdout?.on('data', (data) => output += data.toString());
        child.stderr?.on('data', (data) => output += data.toString());

        child.on('close', () => {
          const match = output.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/);
          resolve(match ? match[1] : output.trim() || null);
        });

        child.on('error', () => resolve(null));

        setTimeout(() => {
          child.kill();
          resolve(null);
        }, 3000);
      });
    }
    return null;
  }

  /**
   * Scan for Python environments
   */
  async scanPythonEnvironments() {
    return this.getCached('python-envs', async () => {
      const environments = [];

      // Method 1: Check PATH for common Python commands
      const pathCommands = ['python', 'python3', 'py'];

      for (const cmd of pathCommands) {
        if (await this.commandExists(cmd)) {
          const version = await this.getPythonVersion(cmd);
          if (version) {
            environments.push({
              executable: cmd,
              version,
              type: 'system',
              priority: cmd === 'python' ? 10 : cmd === 'python3' ? 9 : 8
            });
          }
        }
      }

      // Method 2: Scan common installation paths
      const scanPaths = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python'),
        path.join(process.env.PROGRAMFILES || '', 'Python'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Python'),
        'C:\\Python'
      ];

      for (const scanPath of scanPaths) {
        if (fs.existsSync(scanPath)) {
          try {
            const items = fs.readdirSync(scanPath);
            for (const item of items) {
              const fullPath = path.join(scanPath, item);
              if (fs.statSync(fullPath).isDirectory() && item.toLowerCase().includes('python')) {
                const pythonExe = path.join(fullPath, 'python.exe');
                if (fs.existsSync(pythonExe)) {
                  const version = await this.getPythonVersion(pythonExe);
                  if (version) {
                    environments.push({
                      executable: pythonExe,
                      version,
                      type: 'user',
                      priority: 7
                    });
                  }
                }
              }
            }
          } catch (error) {
            // Skip directories we can't read
          }
        }
      }

      // Method 3: Check for virtual environments in common locations
      const venvPaths = [
        path.join(require('os').homedir(), 'venvs'),
        path.join(require('os').homedir(), 'virtualenvs'),
        path.join(require('os').homedir(), '.virtualenvs')
      ];

      for (const venvPath of venvPaths) {
        if (fs.existsSync(venvPath)) {
          try {
            const items = fs.readdirSync(venvPath);
            for (const item of items) {
              const venvDir = path.join(venvPath, item);
              if (fs.statSync(venvDir).isDirectory()) {
                const pythonExe = path.join(venvDir, 'Scripts', 'python.exe');
                if (fs.existsSync(pythonExe)) {
                  const version = await this.getPythonVersion(pythonExe);
                  if (version) {
                    environments.push({
                      executable: pythonExe,
                      version,
                      type: 'virtualenv',
                      priority: 6
                    });
                  }
                }
              }
            }
          } catch (error) {
            // Skip directories we can't read
          }
        }
      }

      // Sort by priority (highest first)
      return environments.sort((a, b) => b.priority - a.priority);
    });
  }

  /**
   * Scan for existing projects in common directories
   */
  async scanProjects(scanDirectories) {
    const defaultScanDirs = [
      'C:\\Projects',
      path.join(require('os').homedir(), 'Projects'),
      path.join(require('os').homedir(), 'Documents', 'Projects'),
      path.join(require('os').homedir(), 'Desktop', 'Projects'),
      'D:\\Projects',
      'E:\\Projects'
    ];

    const dirsToScan = scanDirectories || defaultScanDirs;
    const projects = [];

    for (const scanDir of dirsToScan) {
      if (!fs.existsSync(scanDir)) continue;

      try {
        const items = fs.readdirSync(scanDir);
        for (const item of items) {
          const fullPath = path.join(scanDir, item);
          if (!fs.statSync(fullPath).isDirectory()) continue;

          const projectType = this.detectProjectType(fullPath);
          if (projectType !== 'unknown') {
            const stats = fs.statSync(fullPath);
            projects.push({
              path: fullPath,
              type: projectType,
              name: item,
              lastModified: stats.mtime
            });
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    // Sort by last modified (most recent first)
    return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  /**
   * Detect project type based on files present
   */
  detectProjectType(projectPath) {
    try {
      const files = fs.readdirSync(projectPath);

      // Node.js/React/Vue projects
      if (files.includes('package.json')) {
        const packageJson = path.join(projectPath, 'package.json');
        if (fs.existsSync(packageJson)) {
          const content = fs.readFileSync(packageJson, 'utf8');
          const pkg = JSON.parse(content);

          if (pkg.dependencies?.['electron']) return 'electron';
          if (pkg.dependencies?.['tauri']) return 'tauri';
          if (pkg.dependencies?.['vue']) return 'vue';
          if (pkg.dependencies?.['react']) return 'react';
          return 'node';
        }
      }

      // Python projects
      if (files.some(f => ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'].includes(f))) {
        return 'python';
      }

      // Rust projects
      if (files.includes('Cargo.toml')) {
        return 'rust';
      }

      // Go projects
      if (files.includes('go.mod')) {
        return 'go';
      }

    } catch (error) {
      // Can't read directory
    }

    return 'unknown';
  }

  /**
   * Scan for development tools
   */
  async scanTools() {
    return this.getCached('tools', async () => {
      const tools = {};

      // Node.js
      if (await this.commandExists('node')) {
        const nodeVersion = await this.execCommand('node --version');
        if (nodeVersion) {
          tools.node = { version: nodeVersion.replace('v', '') };

          // npm
          const npmVersion = await this.execCommand('npm --version');
          if (npmVersion) {
            tools.node.npm = npmVersion;
          }
        }
      }

      // Python (already scanned above, but get primary version)
      const pythonEnvs = await this.scanPythonEnvironments();
      if (pythonEnvs.length > 0) {
        const primaryPython = pythonEnvs[0];
        tools.python = { version: primaryPython.version };

        // pip
        const pipVersion = await this.execCommand(`"${primaryPython.executable}" -m pip --version`);
        if (pipVersion) {
          const match = pipVersion.match(/pip\s+(\d+\.\d+(?:\.\d+)?)/);
          if (match) {
            tools.python.pip = match[1];
          }
        }
      }

      // Git
      if (await this.commandExists('git')) {
        const gitVersion = await this.execCommand('git --version');
        if (gitVersion) {
          const match = gitVersion.match(/git\s+version\s+(\d+\.\d+(?:\.\d+)?)/);
          if (match) {
            tools.git = { version: match[1] };
          }
        }
      }

      // Rust
      if (await this.commandExists('rustc')) {
        const rustVersion = await this.execCommand('rustc --version');
        if (rustVersion) {
          const match = rustVersion.match(/rustc\s+(\d+\.\d+(?:\.\d+)?)/);
          if (match) {
            tools.rust = { version: match[1] };
          }
        }
      }

      // Go
      if (await this.commandExists('go')) {
        const goVersion = await this.execCommand('go version');
        if (goVersion) {
          const match = goVersion.match(/go\s+version\s+go(\d+\.\d+(?:\.\d+)?)/);
          if (match) {
            tools.go = { version: match[1] };
          }
        }
      }

      return tools;
    });
  }

  /**
   * Perform complete system scan
   */
  async performFullScan(scanDirectories) {
    const startTime = Date.now();

    const [python, projects, tools] = await Promise.all([
      this.scanPythonEnvironments(),
      this.scanProjects(scanDirectories),
      this.scanTools()
    ]);

    return {
      python,
      projects,
      tools,
      scanTime: Date.now() - startTime
    };
  }

  /**
   * Clear scan cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get recommended Python environment
   */
  getRecommendedPython() {
    const envs = this.cache.get('python-envs')?.data;
    return envs?.[0] || null;
  }
}

module.exports = { SystemScanner };
