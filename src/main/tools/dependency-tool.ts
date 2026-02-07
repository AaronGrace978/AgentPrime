/**
 * Dependency Installation Tool - Install packages via npm, pip, etc.
 */

import { BaseTool } from './base-tool';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { resolveCommand, getNodeEnv, getPythonEnv, getToolPaths } from '../core/tool-path-finder';

interface InstallResult {
  success: boolean;
  packageManager: string;
  packages: string[];
  output: string;
  error?: string;
}

/**
 * NPM Install Tool
 */
export class NpmInstallTool extends BaseTool {
  constructor() {
    super(
      'npm_install',
      'Install npm packages. Can install specific packages or all dependencies from package.json.',
      {
        packages: {
          type: 'string',
          required: false,
          description: 'Space-separated list of packages to install (e.g., "axios lodash"). If empty, runs npm install for package.json'
        },
        dev: {
          type: 'boolean',
          required: false,
          description: 'Install as dev dependency (--save-dev). Default: false'
        },
        workingDir: {
          type: 'string',
          required: false,
          description: 'Working directory (default: current workspace)'
        }
      }
    );
  }

  async execute(args: { 
    packages?: string; 
    dev?: boolean; 
    workingDir?: string;
  }): Promise<InstallResult> {
    const { packages, dev = false, workingDir } = args;
    const cwd = workingDir || process.cwd();
    
    const packageList = packages ? packages.split(/\s+/).filter(p => p) : [];
    
    // Get npm command path and proper environment
    // CRITICAL: getNodeEnv() ensures child processes (like esbuild's postinstall) can find node.exe
    const toolPaths = getToolPaths();
    const command = toolPaths.npm || 'npm';
    const env = getNodeEnv();
    
    const npmArgs = ['install'];
    
    if (packageList.length > 0) {
      npmArgs.push(...packageList);
      if (dev) {
        npmArgs.push('--save-dev');
      }
    }

    console.log(`[NPM] Running: ${command} ${npmArgs.join(' ')} in ${cwd}`);
    console.log(`[NPM] PATH includes: ${(env.PATH || '').split(';').slice(0, 3).join('; ')}...`);

    return new Promise((resolve) => {
      const child = spawn(command, npmArgs, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        const success = code === 0;
        console.log(`[NPM] ${success ? '✅' : '❌'} Install ${success ? 'completed' : 'failed'}`);
        
        resolve({
          success,
          packageManager: 'npm',
          packages: packageList.length > 0 ? packageList : ['(all from package.json)'],
          output: stdout + stderr,
          error: success ? undefined : stderr || `Exit code: ${code}`
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          packageManager: 'npm',
          packages: packageList,
          output: '',
          error: error.message
        });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          packageManager: 'npm',
          packages: packageList,
          output: stdout + stderr,
          error: 'Installation timed out after 5 minutes'
        });
      }, 300000);
    });
  }
}

/**
 * Pip Install Tool
 */
export class PipInstallTool extends BaseTool {
  constructor() {
    super(
      'pip_install',
      'Install Python packages using pip.',
      {
        packages: {
          type: 'string',
          required: false,
          description: 'Space-separated list of packages to install (e.g., "requests flask"). If empty, installs from requirements.txt'
        },
        requirements: {
          type: 'string',
          required: false,
          description: 'Path to requirements.txt file (default: requirements.txt)'
        },
        workingDir: {
          type: 'string',
          required: false,
          description: 'Working directory (default: current workspace)'
        }
      }
    );
  }

  async execute(args: { 
    packages?: string; 
    requirements?: string;
    workingDir?: string;
  }): Promise<InstallResult> {
    const { packages, requirements = 'requirements.txt', workingDir } = args;
    const cwd = workingDir || process.cwd();
    
    const packageList = packages ? packages.split(/\s+/).filter(p => p) : [];
    
    // Get Python path and proper environment
    const toolPaths = getToolPaths();
    const env = getPythonEnv();
    
    // Use resolved Python path for pip, or fall back to 'pip'
    let command = 'pip';
    if (toolPaths.python && toolPaths.python !== 'python') {
      command = `"${toolPaths.python}" -m pip`;
    } else if (toolPaths.python3 && toolPaths.python3 !== 'python3') {
      command = `"${toolPaths.python3}" -m pip`;
    }
    
    const pipArgs = ['install'];
    
    if (packageList.length > 0) {
      pipArgs.push(...packageList);
    } else {
      // Install from requirements.txt
      const reqPath = path.join(cwd, requirements);
      if (fs.existsSync(reqPath)) {
        pipArgs.push('-r', requirements);
      } else {
        return {
          success: false,
          packageManager: 'pip',
          packages: [],
          output: '',
          error: `No packages specified and ${requirements} not found`
        };
      }
    }

    console.log(`[PIP] Running: ${command} ${pipArgs.join(' ')} in ${cwd}`);

    return new Promise((resolve) => {
      const child = spawn(command, pipArgs, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        const success = code === 0;
        console.log(`[PIP] ${success ? '✅' : '❌'} Install ${success ? 'completed' : 'failed'}`);
        
        resolve({
          success,
          packageManager: 'pip',
          packages: packageList.length > 0 ? packageList : [`(from ${requirements})`],
          output: stdout + stderr,
          error: success ? undefined : stderr || `Exit code: ${code}`
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          packageManager: 'pip',
          packages: packageList,
          output: '',
          error: error.message
        });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          packageManager: 'pip',
          packages: packageList,
          output: stdout + stderr,
          error: 'Installation timed out after 5 minutes'
        });
      }, 300000);
    });
  }
}

/**
 * Package Manager Detection Tool
 */
export class DetectPackageManagerTool extends BaseTool {
  constructor() {
    super(
      'detect_package_manager',
      'Detect what package manager(s) a project uses based on lock files and config.',
      {
        workingDir: {
          type: 'string',
          required: false,
          description: 'Directory to check (default: current workspace)'
        }
      }
    );
  }

  async execute(args: { workingDir?: string }): Promise<{
    detected: string[];
    files: Record<string, boolean>;
    recommended: string;
  }> {
    const cwd = args.workingDir || process.cwd();
    
    const files: Record<string, boolean> = {
      'package.json': fs.existsSync(path.join(cwd, 'package.json')),
      'package-lock.json': fs.existsSync(path.join(cwd, 'package-lock.json')),
      'yarn.lock': fs.existsSync(path.join(cwd, 'yarn.lock')),
      'pnpm-lock.yaml': fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')),
      'bun.lockb': fs.existsSync(path.join(cwd, 'bun.lockb')),
      'requirements.txt': fs.existsSync(path.join(cwd, 'requirements.txt')),
      'Pipfile': fs.existsSync(path.join(cwd, 'Pipfile')),
      'pyproject.toml': fs.existsSync(path.join(cwd, 'pyproject.toml')),
      'Cargo.toml': fs.existsSync(path.join(cwd, 'Cargo.toml')),
      'go.mod': fs.existsSync(path.join(cwd, 'go.mod')),
      'Gemfile': fs.existsSync(path.join(cwd, 'Gemfile')),
      'composer.json': fs.existsSync(path.join(cwd, 'composer.json'))
    };

    const detected: string[] = [];
    
    if (files['package-lock.json']) detected.push('npm');
    else if (files['yarn.lock']) detected.push('yarn');
    else if (files['pnpm-lock.yaml']) detected.push('pnpm');
    else if (files['bun.lockb']) detected.push('bun');
    else if (files['package.json']) detected.push('npm'); // Default for JS
    
    if (files['Pipfile']) detected.push('pipenv');
    else if (files['pyproject.toml']) detected.push('poetry');
    else if (files['requirements.txt']) detected.push('pip');
    
    if (files['Cargo.toml']) detected.push('cargo');
    if (files['go.mod']) detected.push('go');
    if (files['Gemfile']) detected.push('bundler');
    if (files['composer.json']) detected.push('composer');

    const recommended = detected[0] || 'unknown';

    console.log(`[PackageManager] Detected: ${detected.join(', ') || 'none'}`);

    return { detected, files, recommended };
  }
}

/**
 * Add Dependency to Package.json Tool
 */
export class AddDependencyTool extends BaseTool {
  constructor() {
    super(
      'add_dependency',
      'Add a dependency to package.json without installing. Useful for planning.',
      {
        name: {
          type: 'string',
          required: true,
          description: 'Package name'
        },
        version: {
          type: 'string',
          required: false,
          description: 'Version constraint (default: "latest")'
        },
        dev: {
          type: 'boolean',
          required: false,
          description: 'Add as dev dependency'
        },
        workingDir: {
          type: 'string',
          required: false,
          description: 'Working directory'
        }
      }
    );
  }

  async execute(args: {
    name: string;
    version?: string;
    dev?: boolean;
    workingDir?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { name, version = 'latest', dev = false, workingDir } = args;
    const cwd = workingDir || process.cwd();
    const pkgPath = path.join(cwd, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      return { success: false, message: 'package.json not found' };
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const depKey = dev ? 'devDependencies' : 'dependencies';
      
      if (!pkg[depKey]) {
        pkg[depKey] = {};
      }
      
      pkg[depKey][name] = version.startsWith('^') || version.startsWith('~') ? version : `^${version}`;
      
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      
      console.log(`[Dependency] Added ${name}@${version} to ${depKey}`);
      return { 
        success: true, 
        message: `Added ${name}@${version} to ${depKey}. Run npm install to install.` 
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}

