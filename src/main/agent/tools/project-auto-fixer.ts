
/**
 * Project Auto-Fixer
 * Automatically fixes common issues in created projects:
 * - Missing dependencies in package.json
 * - Wrong file extensions (main.ts vs main.tsx)
 * - Missing HTML root elements
 * - Incorrect import paths
 * - Missing TypeScript config files
 * - Node.js path detection in batch files
 */

import * as fs from 'fs';
import * as path from 'path';
import { getToolPaths, resolveCommand } from '../../core/tool-path-finder';
import { ProjectRunner, ProjectInfo } from './projectRunner';

export interface FixResult {
  success: boolean;
  fixes: string[];
  errors: string[];
}

export class ProjectAutoFixer {
  /**
   * Safely read a file, returning null for OneDrive placeholder files
   * (Files On-Demand stubs that haven't been downloaded locally).
   * OneDrive placeholders cause errno -4094 (UNKNOWN) on read syscall.
   */
  private static safeReadFileSync(filePath: string, encoding: 'utf-8'): string | null;
  private static safeReadFileSync(filePath: string): Buffer | null;
  private static safeReadFileSync(filePath: string, encoding?: 'utf-8'): string | Buffer | null {
    try {
      if (encoding) {
        return fs.readFileSync(filePath, encoding);
      }
      return fs.readFileSync(filePath);
    } catch (error: any) {
      if (error?.code === 'UNKNOWN' && error?.errno === -4094 && error?.syscall === 'read') {
        console.warn(`[ProjectAutoFixer] ⚠️ Skipping OneDrive placeholder: ${path.basename(filePath)}`);
        return null;
      }
      throw error; // Re-throw non-OneDrive errors
    }
  }

  /**
   * Run all auto-fixes on a project
   */
  static async fixProject(workspacePath: string): Promise<FixResult> {
    const fixes: string[] = [];
    const errors: string[] = [];

    console.log('[ProjectAutoFixer] 🔧 Starting auto-fix...');

    try {
      // Detect project type first
      const projectInfo = await ProjectRunner.detectProject(workspacePath);
      console.log(`[ProjectAutoFixer] Detected project type: ${projectInfo.type}`);

      // Fix based on project type (node includes React, Vite, etc.)
      if (projectInfo.type === 'node') {
        await this.fixNodeProject(workspacePath, projectInfo, fixes, errors);
      }

      // Fix Tauri v2 projects
      if (projectInfo.type === 'tauri') {
        await this.fixTauriProject(workspacePath, projectInfo, fixes, errors);
      }

      // Fix Python projects
      if (projectInfo.type === 'python') {
        await this.fixPythonProject(workspacePath, projectInfo, fixes, errors);
      }

      // Fix Electron projects (detect by package.json)
      if (await this.isElectronProject(workspacePath)) {
        await this.fixElectronProject(workspacePath, fixes, errors);
      }

      // Fix React-specific issues
      await this.fixReactProject(workspacePath, fixes, errors);

      // Always fix batch files to include Node.js detection
      this.fixBatchFiles(workspacePath, fixes, errors);

      // Fix common file issues
      this.fixFileIssues(workspacePath, fixes, errors);

      // Fix HTML entry points
      this.fixHtmlEntryPoints(workspacePath, fixes, errors);

      // Fix TypeScript config
      this.fixTypeScriptConfig(workspacePath, fixes, errors);

      // Fix generic issues that apply to all projects
      await this.fixGenericIssues(workspacePath, fixes, errors);

      console.log(`[ProjectAutoFixer] ✅ Fixed ${fixes.length} issue(s)`);
      if (errors.length > 0) {
        console.warn(`[ProjectAutoFixer] ⚠️ ${errors.length} error(s) during fixing`);
      }

      return {
        success: errors.length === 0,
        fixes,
        errors
      };
    } catch (error: any) {
      console.error('[ProjectAutoFixer] Error during auto-fix:', error);
      errors.push(error.message);
      return {
        success: false,
        fixes,
        errors
      };
    }
  }

  /**
   * Fix Node.js project issues
   */
  private static async fixNodeProject(
    workspacePath: string,
    projectInfo: ProjectInfo,
    fixes: string[],
    errors: string[]
  ): Promise<void> {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      let modified = false;

      // Check for missing common dependencies
      const commonDeps: Record<string, string> = {};
      const commonDevDeps: Record<string, string> = {};

      // Check if React is used
      const hasReact = this.hasReactFiles(workspacePath);
      if (hasReact && !packageJson.dependencies?.react) {
        commonDeps.react = '^18.2.0';
        commonDeps['react-dom'] = '^18.2.0';
        fixes.push('Added missing React dependencies');
        modified = true;
      }

      // Check if TypeScript is used
      const hasTypeScript = this.hasTypeScriptFiles(workspacePath);
      if (hasTypeScript && !packageJson.devDependencies?.typescript) {
        commonDevDeps.typescript = '^5.2.0';
        fixes.push('Added missing TypeScript dependency');
        modified = true;
      }

      // Check if Vite is used
      const hasVite = fs.existsSync(path.join(workspacePath, 'vite.config.ts')) ||
                      fs.existsSync(path.join(workspacePath, 'vite.config.js'));
      if (hasVite) {
        if (!packageJson.devDependencies?.vite) {
          commonDevDeps.vite = '^5.0.0';
          fixes.push('Added missing Vite dependency');
          modified = true;
        }
        if (hasReact && !packageJson.devDependencies?.['@vitejs/plugin-react']) {
          commonDevDeps['@vitejs/plugin-react'] = '^4.2.0';
          fixes.push('Added missing Vite React plugin');
          modified = true;
        }
      }

      // Check if Three.js is used
      if (this.hasThreeJsFiles(workspacePath) && !packageJson.dependencies?.three) {
        commonDeps.three = '^0.158.0';
        if (hasTypeScript && !packageJson.devDependencies?.['@types/three']) {
          commonDevDeps['@types/three'] = '^0.158.0';
        }
        fixes.push('Added missing Three.js dependency');
        modified = true;
      }

      // Add React types if React is used
      if (hasReact && hasTypeScript) {
        if (!packageJson.devDependencies?.['@types/react']) {
          commonDevDeps['@types/react'] = '^18.2.0';
          commonDevDeps['@types/react-dom'] = '^18.2.0';
          fixes.push('Added missing React TypeScript types');
          modified = true;
        }
      }

      // Update package.json
      if (modified) {
        if (!packageJson.dependencies) packageJson.dependencies = {};
        if (!packageJson.devDependencies) packageJson.devDependencies = {};
        
        Object.assign(packageJson.dependencies, commonDeps);
        Object.assign(packageJson.devDependencies, commonDevDeps);

        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        fixes.push('Updated package.json with missing dependencies');
      }

      // Check for corrupted or incomplete node_modules
      const nodeModulesPath = path.join(workspacePath, 'node_modules');
      const nodeModulesBinPath = path.join(nodeModulesPath, '.bin');
      let needsInstall = !fs.existsSync(nodeModulesPath);
      let wasCorrupted = false;
      
      if (fs.existsSync(nodeModulesPath)) {
        // Check if node_modules is corrupted/incomplete
        // Signs of corruption:
        // 1. No .bin folder (npm creates this for executables)
        // 2. Very few packages (less than expected from package.json)
        // 3. Missing key dependencies
        try {
          const deps = Object.keys(packageJson.dependencies || {});
          const devDeps = Object.keys(packageJson.devDependencies || {});
          const expectedCount = deps.length + devDeps.length;
          
          // Count actual installed packages
          const installedPackages = fs.readdirSync(nodeModulesPath)
            .filter(f => !f.startsWith('.') && fs.statSync(path.join(nodeModulesPath, f)).isDirectory());
          
          // If we expect 5+ packages but have less than 3, or missing .bin, it's likely corrupted
          const hasBinFolder = fs.existsSync(nodeModulesBinPath);
          const hasVeryFewPackages = expectedCount >= 5 && installedPackages.length < 3;
          const missingBinWithDevDeps = devDeps.length > 0 && !hasBinFolder;
          
          if (hasVeryFewPackages || missingBinWithDevDeps) {
            console.log(`[ProjectAutoFixer] ⚠️ Detected corrupted node_modules (${installedPackages.length} packages, expected ~${expectedCount})`);
            fixes.push(`Detected corrupted node_modules (${installedPackages.length}/${expectedCount} packages)`);
            
            // Clean up corrupted node_modules
            try {
              fs.rmSync(nodeModulesPath, { recursive: true, force: true });
              const lockPath = path.join(workspacePath, 'package-lock.json');
              if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
              }
              fixes.push('Cleaned up corrupted node_modules');
              needsInstall = true;
              wasCorrupted = true;
            } catch (cleanError: any) {
              errors.push(`Failed to clean corrupted node_modules: ${cleanError.message}`);
            }
          }
        } catch (checkError) {
          // Ignore check errors, just try to install
        }
      }
      
      // Install dependencies if needed
      if (needsInstall || modified) {
        fixes.push(wasCorrupted ? 'Reinstalling dependencies...' : 'Installing dependencies...');
        try {
          // Import getNodeEnv which provides proper PATH for npm child processes
          const { getNodeEnv } = require('../../core/tool-path-finder');
          const npmCommand = resolveCommand('npm install');
          
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          // CRITICAL: Use getNodeEnv() to ensure child processes can find node.exe
          // This fixes the "'node' is not recognized" error in npm postinstall scripts
          const env = getNodeEnv();

          console.log('[ProjectAutoFixer] Running:', npmCommand);
          
          await execAsync(npmCommand, {
            cwd: workspacePath,
            timeout: 180000, // 3 minutes
            env,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
          });
          fixes.push('✅ Dependencies installed successfully');
        } catch (error: any) {
          // If install fails, try cleaning and retrying once
          if (!wasCorrupted && fs.existsSync(nodeModulesPath)) {
            console.log('[ProjectAutoFixer] Install failed, trying clean reinstall...');
            try {
              fs.rmSync(nodeModulesPath, { recursive: true, force: true });
              const lockPath = path.join(workspacePath, 'package-lock.json');
              if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
              
              const { getNodeEnv } = require('../../core/tool-path-finder');
              const { exec } = require('child_process');
              const { promisify } = require('util');
              const execAsync = promisify(exec);
              const env = getNodeEnv();
              const npmCommand = resolveCommand('npm install');
              
              await execAsync(npmCommand, {
                cwd: workspacePath,
                timeout: 180000,
                env,
                maxBuffer: 10 * 1024 * 1024
              });
              fixes.push('✅ Dependencies installed successfully (after cleanup)');
            } catch (retryError: any) {
              errors.push(`Failed to install dependencies: ${retryError.message}`);
            }
          } else {
            errors.push(`Failed to install dependencies: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      errors.push(`Error fixing Node project: ${error.message}`);
    }
  }

  /**
   * Fix Python project issues
   */
  private static async fixPythonProject(
    workspacePath: string,
    projectInfo: ProjectInfo,
    fixes: string[],
    errors: string[]
  ): Promise<void> {
    console.log('[ProjectAutoFixer] 🐍 Fixing Python project...');

    try {
      // Fix missing __init__.py in package directories
      const srcDir = path.join(workspacePath, 'src');
      const appDir = path.join(workspacePath, 'app');
      
      for (const dir of [srcDir, appDir]) {
        if (fs.existsSync(dir)) {
          const initPath = path.join(dir, '__init__.py');
          if (!fs.existsSync(initPath)) {
            fs.writeFileSync(initPath, '# Package initialization\n', 'utf-8');
            fixes.push(`Added missing __init__.py in ${path.basename(dir)}/`);
          }
          // Also check subdirectories
          const subdirs = fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('__'))
            .map(d => path.join(dir, d.name));
          for (const subdir of subdirs) {
            const subInitPath = path.join(subdir, '__init__.py');
            if (!fs.existsSync(subInitPath)) {
              fs.writeFileSync(subInitPath, '# Package initialization\n', 'utf-8');
              fixes.push(`Added missing __init__.py in ${path.relative(workspacePath, subdir)}/`);
            }
          }
        }
      }

      // Fix requirements.txt - add common missing packages
      const reqPath = path.join(workspacePath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        let reqContent = fs.readFileSync(reqPath, 'utf-8');
        const mainPyPath = path.join(workspacePath, 'main.py');
        
        if (fs.existsSync(mainPyPath)) {
          const mainContent = fs.readFileSync(mainPyPath, 'utf-8');
          
          // Check for FastAPI imports without dependency
          if (mainContent.includes('from fastapi') && !reqContent.toLowerCase().includes('fastapi')) {
            reqContent += '\nfastapi>=0.104.0\nuvicorn>=0.24.0\n';
            fs.writeFileSync(reqPath, reqContent, 'utf-8');
            fixes.push('Added missing FastAPI and uvicorn to requirements.txt');
          }
          
          // Check for Flask imports
          if (mainContent.includes('from flask') && !reqContent.toLowerCase().includes('flask')) {
            reqContent += '\nflask>=3.0.0\n';
            fs.writeFileSync(reqPath, reqContent, 'utf-8');
            fixes.push('Added missing Flask to requirements.txt');
          }
          
          // Check for requests imports
          if (mainContent.includes('import requests') && !reqContent.toLowerCase().includes('requests')) {
            reqContent += '\nrequests>=2.31.0\n';
            fs.writeFileSync(reqPath, reqContent, 'utf-8');
            fixes.push('Added missing requests to requirements.txt');
          }
        }
      } else {
        // Create requirements.txt if missing
        const pyFiles = this.findPythonFiles(workspacePath);
        if (pyFiles.length > 0) {
          fs.writeFileSync(reqPath, '# Python dependencies\n', 'utf-8');
          fixes.push('Created missing requirements.txt');
        }
      }

      // Fix common Python syntax issues
      const pyFiles = this.findPythonFiles(workspacePath);
      for (const pyFile of pyFiles) {
        try {
          let content = fs.readFileSync(pyFile, 'utf-8');
          let modified = false;

          // Fix mixed tabs and spaces (convert to spaces)
          if (content.includes('\t')) {
            content = content.replace(/\t/g, '    ');
            modified = true;
            fixes.push(`Fixed tab indentation in ${path.basename(pyFile)}`);
          }

          // Fix Windows line endings
          if (content.includes('\r\n')) {
            content = content.replace(/\r\n/g, '\n');
            modified = true;
          }

          if (modified) {
            fs.writeFileSync(pyFile, content, 'utf-8');
          }
        } catch (e) {
          // Ignore file read errors
        }
      }

      console.log(`[ProjectAutoFixer] 🐍 Python fixes applied: ${fixes.length}`);
    } catch (error: any) {
      errors.push(`Error fixing Python project: ${error.message}`);
    }
  }

  /**
   * Find Python files in workspace
   */
  private static findPythonFiles(workspacePath: string): string[] {
    const pyFiles: string[] = [];
    const scan = (dir: string, depth: number = 0) => {
      if (depth > 3) return; // Don't go too deep
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'venv' || 
              entry.name === '__pycache__' || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile() && entry.name.endsWith('.py')) {
            pyFiles.push(fullPath);
          } else if (entry.isDirectory()) {
            scan(fullPath, depth + 1);
          }
        }
      } catch (e) {}
    };
    scan(workspacePath);
    return pyFiles;
  }

  /**
   * Check if project is Electron-based
   */
  private static async isElectronProject(workspacePath: string): Promise<boolean> {
    const pkgPath = path.join(workspacePath, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return !!(pkg.dependencies?.electron || pkg.devDependencies?.electron);
    } catch {
      return false;
    }
  }

  /**
   * Fix Electron project security and configuration issues
   */
  private static async fixElectronProject(
    workspacePath: string,
    fixes: string[],
    errors: string[]
  ): Promise<void> {
    console.log('[ProjectAutoFixer] ⚡ Fixing Electron project...');

    try {
      // Find main process files
      const mainFiles = ['main.js', 'main.ts', 'src/main.js', 'src/main.ts', 
                         'src/main/main.js', 'src/main/main.ts', 'electron/main.js', 'electron/main.ts'];
      
      for (const mainFile of mainFiles) {
        const mainPath = path.join(workspacePath, mainFile);
        if (fs.existsSync(mainPath)) {
          let content = fs.readFileSync(mainPath, 'utf-8');
          let modified = false;

          // Fix dangerous nodeIntegration: true
          if (content.includes('nodeIntegration: true') && !content.includes('contextIsolation: true')) {
            content = content.replace(
              /nodeIntegration:\s*true/g,
              'nodeIntegration: false'
            );
            fixes.push('Fixed Electron security: disabled nodeIntegration');
            modified = true;
          }

          // Add contextIsolation if missing in webPreferences
          if (content.includes('webPreferences:') && !content.includes('contextIsolation')) {
            content = content.replace(
              /webPreferences:\s*\{/g,
              'webPreferences: {\n      contextIsolation: true,'
            );
            fixes.push('Added contextIsolation: true for Electron security');
            modified = true;
          }

          // Add sandbox if missing
          if (content.includes('webPreferences:') && !content.includes('sandbox')) {
            content = content.replace(
              /webPreferences:\s*\{/g,
              'webPreferences: {\n      sandbox: true,'
            );
            fixes.push('Added sandbox: true for Electron security');
            modified = true;
          }

          if (modified) {
            fs.writeFileSync(mainPath, content, 'utf-8');
          }
        }
      }

      console.log(`[ProjectAutoFixer] ⚡ Electron fixes applied`);
    } catch (error: any) {
      errors.push(`Error fixing Electron project: ${error.message}`);
    }
  }

  /**
   * Fix generic issues that apply to all projects
   */
  private static async fixGenericIssues(
    workspacePath: string,
    fixes: string[],
    errors: string[]
  ): Promise<void> {
    try {
      // 1. Fix .gitignore - ensure it exists and has common entries
      const gitignorePath = path.join(workspacePath, '.gitignore');
      if (!fs.existsSync(gitignorePath)) {
        const gitignore = `# Dependencies
node_modules/
venv/
__pycache__/
*.pyc

# Build outputs
dist/
build/
target/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
*.local

# Logs
*.log
npm-debug.log*
`;
        fs.writeFileSync(gitignorePath, gitignore, 'utf-8');
        fixes.push('Created .gitignore with common patterns');
      }

      // 2. Fix files with wrong line endings (CRLF -> LF for scripts)
      const scriptExts = ['.sh', '.py', '.js', '.ts', '.jsx', '.tsx'];
      const files = fs.readdirSync(workspacePath, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && scriptExts.some(ext => file.name.endsWith(ext))) {
          const filePath = path.join(workspacePath, file.name);
          try {
            const content = this.safeReadFileSync(filePath, 'utf-8');
            if (content === null) continue; // OneDrive placeholder
            if (content.includes('\r\n')) {
              fs.writeFileSync(filePath, content.replace(/\r\n/g, '\n'), 'utf-8');
              fixes.push(`Fixed line endings in ${file.name}`);
            }
          } catch (e) {}
        }
      }

      // 3. Fix empty files (add placeholder content)
      const emptyFilePatterns = ['index.html', 'main.js', 'main.ts', 'App.tsx', 'App.jsx'];
      for (const pattern of emptyFilePatterns) {
        const srcPath = path.join(workspacePath, 'src', pattern);
        const rootPath = path.join(workspacePath, pattern);
        for (const filePath of [srcPath, rootPath]) {
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.size === 0) {
              // File is empty - this is a problem
              if (pattern === 'index.html') {
                fs.writeFileSync(filePath, '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>\n');
              } else if (pattern.endsWith('.tsx') || pattern.endsWith('.jsx')) {
                fs.writeFileSync(filePath, 'export default function App() {\n  return <div>Hello World</div>;\n}\n');
              } else if (pattern.endsWith('.ts') || pattern.endsWith('.js')) {
                fs.writeFileSync(filePath, 'console.log("Hello World");\n');
              }
              fixes.push(`Fixed empty file: ${pattern}`);
            }
          }
        }
      }

      // 4. Fix missing src directory
      const srcDir = path.join(workspacePath, 'src');
      const hasJsFiles = fs.readdirSync(workspacePath).some(f => 
        f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx')
      );
      if (!fs.existsSync(srcDir) && hasJsFiles) {
        // Has JS/TS files in root but no src directory - this is fine, just note it
      }

      // 5. Fix package.json missing scripts
      const pkgPath = path.join(workspacePath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          let modified = false;

          // Ensure scripts object exists
          if (!pkg.scripts) {
            pkg.scripts = {};
            modified = true;
          }

          // Add start script if missing
          if (!pkg.scripts.start && !pkg.scripts.dev) {
            if (pkg.dependencies?.express || pkg.dependencies?.fastify) {
              pkg.scripts.start = 'node index.js';
              fixes.push('Added missing "start" script for Node.js server');
              modified = true;
            }
          }

          if (modified) {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
          }
        } catch (e) {}
      }

    } catch (error: any) {
      errors.push(`Error in generic fixes: ${error.message}`);
    }
  }

  /**
   * Fix React-specific issues
   */
  private static async fixReactProject(
    workspacePath: string,
    fixes: string[],
    errors: string[]
  ): Promise<void> {
    // Only run if React is detected
    if (!this.hasReactFiles(workspacePath)) return;

    try {
      // CRITICAL FIX: Create missing index.html for Vite projects
      // This is the #1 cause of React project failures
      const indexHtmlPath = path.join(workspacePath, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) {
        // Determine the entry point file
        let entryPoint = '/src/main.tsx';
        if (fs.existsSync(path.join(workspacePath, 'src', 'main.jsx'))) {
          entryPoint = '/src/main.jsx';
        } else if (fs.existsSync(path.join(workspacePath, 'src', 'index.tsx'))) {
          entryPoint = '/src/index.tsx';
        } else if (fs.existsSync(path.join(workspacePath, 'src', 'index.jsx'))) {
          entryPoint = '/src/index.jsx';
        }
        
        // Get project name from package.json if available
        let appTitle = 'React App';
        const pkgJsonPath = path.join(workspacePath, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            if (pkg.name) {
              appTitle = pkg.name.split('-').map((w: string) => 
                w.charAt(0).toUpperCase() + w.slice(1)
              ).join(' ');
            }
          } catch (e) {}
        }
        
        const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appTitle}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${entryPoint}"></script>
  </body>
</html>
`;
        fs.writeFileSync(indexHtmlPath, indexHtmlContent, 'utf-8');
        fixes.push('CRITICAL: Created missing index.html for Vite (project would not start without this!)');
        console.log('[ProjectAutoFixer] ✅ Created missing index.html for React/Vite project');
      }

      // Fix tsconfig.json missing jsx option
      const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        try {
          let tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8');
          const tsconfig = JSON.parse(tsconfigContent);
          let modified = false;

          if (!tsconfig.compilerOptions) {
            tsconfig.compilerOptions = {};
            modified = true;
          }

          // CRITICAL: Add jsx option if missing
          if (!tsconfig.compilerOptions.jsx) {
            tsconfig.compilerOptions.jsx = 'react-jsx';
            fixes.push('CRITICAL: Added missing "jsx": "react-jsx" to tsconfig.json');
            modified = true;
          }

          // Fix wrong jsx option (preserve doesn't work with Vite)
          if (tsconfig.compilerOptions.jsx === 'preserve') {
            tsconfig.compilerOptions.jsx = 'react-jsx';
            fixes.push('Fixed tsconfig.json: jsx "preserve" -> "react-jsx" (required for Vite)');
            modified = true;
          }

          if (modified) {
            fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');
          }
        } catch (e) {
          errors.push(`Error fixing tsconfig.json: ${e}`);
        }
      }

      // Fix main.tsx / index.tsx entry points
      const entryFiles = ['src/main.tsx', 'src/index.tsx', 'src/main.jsx', 'src/index.jsx'];
      
      for (const entryFile of entryFiles) {
        const entryPath = path.join(workspacePath, entryFile);
        if (fs.existsSync(entryPath)) {
          let content = fs.readFileSync(entryPath, 'utf-8');
          let modified = false;

          // Fix old ReactDOM.render usage (should use createRoot for React 18+)
          if (content.includes('ReactDOM.render(') && !content.includes('createRoot')) {
            content = content.replace(
              /import\s+ReactDOM\s+from\s+['"]react-dom['"]/,
              "import ReactDOM from 'react-dom/client'"
            );
            content = content.replace(
              /ReactDOM\.render\(\s*(<[^>]+>|[\w]+)\s*,\s*document\.getElementById\(['"](\w+)['"]\)\s*\)/,
              "ReactDOM.createRoot(document.getElementById('$2')!).render($1)"
            );
            fixes.push('Updated React 18+ createRoot usage');
            modified = true;
          }

          // Add StrictMode if missing
          if (!content.includes('StrictMode') && content.includes('createRoot')) {
            // Try to wrap the render call with StrictMode
            if (!content.includes('React.StrictMode') && !content.includes('<StrictMode>')) {
              content = content.replace(
                /\.render\(\s*\n?\s*(<App\s*\/>)/,
                '.render(\n  <React.StrictMode>\n    $1\n  </React.StrictMode>'
              );
              fixes.push('Added React.StrictMode wrapper');
              modified = true;
            }
          }

          if (modified) {
            fs.writeFileSync(entryPath, content, 'utf-8');
          }
        }
      }

      // Fix package.json scripts for React projects
      const pkgPath = path.join(workspacePath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          let modified = false;

          // Add missing dev script
          if (!pkg.scripts?.dev && pkg.devDependencies?.vite) {
            pkg.scripts = pkg.scripts || {};
            pkg.scripts.dev = 'vite';
            fixes.push('Added missing "dev" script');
            modified = true;
          }

          // Add missing build script
          if (!pkg.scripts?.build && pkg.devDependencies?.vite) {
            pkg.scripts = pkg.scripts || {};
            pkg.scripts.build = 'tsc && vite build';
            fixes.push('Added missing "build" script');
            modified = true;
          }

          if (modified) {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
          }
        } catch (e) {}
      }
    } catch (error: any) {
      errors.push(`Error fixing React project: ${error.message}`);
    }
  }

  /**
   * Fix Tauri v2 project issues
   * - Updates deprecated v1 config to v2 format
   * - Fixes CSP security
   * - Updates dependencies to latest versions
   * - Adds missing files (.gitignore, icons/)
   */
  private static async fixTauriProject(
    workspacePath: string,
    projectInfo: ProjectInfo,
    fixes: string[],
    errors: string[]
  ): Promise<void> {
    console.log('[ProjectAutoFixer] 🦀 Fixing Tauri v2 project...');

    // Fix tauri.conf.json
    const tauriConfigPath = path.join(workspacePath, 'src-tauri', 'tauri.conf.json');
    if (fs.existsSync(tauriConfigPath)) {
      try {
        let config = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf-8'));
        let modified = false;

        // Fix v1 -> v2 config format
        if (config.build?.devPath) {
          config.build.devUrl = config.build.devPath;
          delete config.build.devPath;
          fixes.push('Fixed tauri.conf.json: devPath -> devUrl (v2 format)');
          modified = true;
        }

        if (config.build?.distDir) {
          config.build.frontendDist = config.build.distDir;
          delete config.build.distDir;
          fixes.push('Fixed tauri.conf.json: distDir -> frontendDist (v2 format)');
          modified = true;
        }

        // Fix devUrl - must be http://localhost:PORT, not a file path
        if (config.build?.devUrl && !config.build.devUrl.startsWith('http')) {
          config.build.devUrl = 'http://localhost:1420';
          fixes.push('Fixed devUrl: must be http://localhost URL, not file path');
          modified = true;
        }

        // Fix v1 nested "package" object - v2 uses flat productName/version
        if (config.package) {
          if (config.package.productName && !config.productName) {
            config.productName = config.package.productName;
          }
          if (config.package.version && !config.version) {
            config.version = config.package.version;
          }
          delete config.package;
          fixes.push('Migrated package.productName/version to root level (v2 format)');
          modified = true;
        }

        // Remove deprecated withGlobalTauri (NOT valid in Tauri v2)
        if (config.build && 'withGlobalTauri' in config.build) {
          delete config.build.withGlobalTauri;
          fixes.push('Removed deprecated withGlobalTauri from tauri.conf.json (not valid in v2)');
          modified = true;
        }

        // Remove deprecated v1 nested "tauri" object and flatten to v2 format
        if (config.tauri) {
          // Migrate tauri.windows -> app.windows
          if (config.tauri.windows && !config.app?.windows) {
            config.app = config.app || {};
            config.app.windows = config.tauri.windows;
            fixes.push('Migrated tauri.windows -> app.windows (v2 format)');
            modified = true;
          }
          // Migrate tauri.security -> app.security (if not already in root security)
          if (config.tauri.security && !config.app?.security && !config.security) {
            config.app = config.app || {};
            config.app.security = config.tauri.security;
            fixes.push('Migrated tauri.security -> app.security (v2 format)');
            modified = true;
          }
          // Migrate tauri.bundle -> bundle
          if (config.tauri.bundle && !config.bundle) {
            config.bundle = config.tauri.bundle;
            fixes.push('Migrated tauri.bundle -> bundle (v2 format)');
            modified = true;
          }
          // Remove the deprecated tauri object after migration
          delete config.tauri;
          fixes.push('Removed deprecated nested "tauri" object (v2 uses flat structure)');
          modified = true;
        }

        // Remove deprecated allowlist (v1 permission system)
        if (config.tauri?.allowlist || config.allowlist) {
          delete config.tauri?.allowlist;
          delete config.allowlist;
          fixes.push('Removed deprecated allowlist (v2 uses capabilities system)');
          modified = true;
        }

        // Fix missing beforeDevCommand/beforeBuildCommand
        if (!config.build?.beforeDevCommand) {
          config.build = config.build || {};
          config.build.beforeDevCommand = 'npm run dev';
          fixes.push('Added missing beforeDevCommand to tauri.conf.json');
          modified = true;
        }

        if (!config.build?.beforeBuildCommand) {
          config.build = config.build || {};
          config.build.beforeBuildCommand = 'npm run build';
          fixes.push('Added missing beforeBuildCommand to tauri.conf.json');
          modified = true;
        }

        // Fix null CSP security
        if (config.tauri?.security?.csp === null || config.security?.csp === null) {
          const properCsp = "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https: wss: ws:; object-src 'none';";
          if (config.tauri?.security) {
            config.tauri.security.csp = properCsp;
          } else if (config.security) {
            config.security.csp = properCsp;
          } else {
            config.security = { csp: properCsp };
          }
          fixes.push('Fixed null CSP - added proper Content Security Policy');
          modified = true;
        }

        // Add $schema if missing
        if (!config.$schema) {
          config.$schema = '../node_modules/@tauri-apps/cli/schema.json';
          fixes.push('Added $schema reference to tauri.conf.json');
          modified = true;
        }

        // Ensure bundle.icon array has correct paths (we'll generate icons later)
        if (!config.bundle) {
          config.bundle = { active: true, targets: 'all', icon: [] };
          modified = true;
        }
        if (!config.bundle.icon || config.bundle.icon.length === 0) {
          config.bundle.icon = [
            'icons/32x32.png',
            'icons/128x128.png', 
            'icons/128x128@2x.png',
            'icons/icon.ico'
          ];
          fixes.push('Added icon paths to bundle config');
          modified = true;
        }

        if (modified) {
          fs.writeFileSync(tauriConfigPath, JSON.stringify(config, null, 2), 'utf-8');
        }
      } catch (error: any) {
        errors.push(`Error fixing tauri.conf.json: ${error.message}`);
      }
    }

    // Fix Cargo.toml - replace deprecated features and versions
    const cargoTomlPath = path.join(workspacePath, 'src-tauri', 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      try {
        let cargoContent = fs.readFileSync(cargoTomlPath, 'utf-8');
        let cargoModified = false;
        
        // Replace deprecated api-all with devtools only
        if (cargoContent.includes('api-all')) {
          cargoContent = cargoContent.replace(
            /features\s*=\s*\[\s*["']api-all["'][^\]]*\]/g,
            'features = ["devtools"]'
          );
          fixes.push('Fixed Cargo.toml: replaced deprecated api-all feature');
          cargoModified = true;
        }

        // Remove deprecated shell-open feature (Tauri v2 uses plugins)
        if (cargoContent.includes('"shell-open"') || cargoContent.includes("'shell-open'")) {
          cargoContent = cargoContent.replace(/,?\s*["']shell-open["']\s*,?/g, ', ');
          // Clean up any resulting double commas or leading/trailing commas in feature arrays
          cargoContent = cargoContent.replace(/\[\s*,/g, '[');
          cargoContent = cargoContent.replace(/,\s*\]/g, ']');
          cargoContent = cargoContent.replace(/,\s*,/g, ',');
          fixes.push('Removed deprecated shell-open feature (use tauri-plugin-shell instead)');
          cargoModified = true;
        }

        // Remove deprecated protocol-asset feature (not valid in v2)
        if (cargoContent.includes('"protocol-asset"') || cargoContent.includes("'protocol-asset'")) {
          cargoContent = cargoContent.replace(/,?\s*["']protocol-asset["']\s*,?/g, ', ');
          cargoContent = cargoContent.replace(/\[\s*,/g, '[');
          cargoContent = cargoContent.replace(/,\s*\]/g, ']');
          cargoContent = cargoContent.replace(/,\s*,/g, ',');
          fixes.push('Removed deprecated protocol-asset feature');
          cargoModified = true;
        }

        // Add tauri-plugin-shell if not present
        if (!cargoContent.includes('tauri-plugin-shell')) {
          // Add after tauri dependency
          cargoContent = cargoContent.replace(
            /(tauri\s*=\s*\{[^}]+\})/,
            '$1\ntauri-plugin-shell = "2"'
          );
          fixes.push('Added tauri-plugin-shell dependency');
          cargoModified = true;
        }

        // Update version format to use semver range (2 instead of 2.0.0 for better compat)
        if (cargoContent.includes('version = "2.0.0"') || cargoContent.includes("version = '2.0.0'")) {
          cargoContent = cargoContent.replace(/version\s*=\s*["']2\.0\.0["']/g, 'version = "2"');
          fixes.push('Updated Tauri version to use semver range for better compatibility');
          cargoModified = true;
        }

        // Fix Tauri v1/v2 version mismatch - if tauri-plugin-shell v2 is used, tauri must be v2
        if (cargoContent.includes('tauri-plugin-shell = "2"') || cargoContent.includes("tauri-plugin-shell = '2'")) {
          // Check if tauri is still on v1.x
          if (cargoContent.match(/tauri\s*=\s*\{\s*version\s*=\s*["']1\./)) {
            cargoContent = cargoContent.replace(
              /tauri\s*=\s*\{\s*version\s*=\s*["']1\.[^"']+["']/g,
              'tauri = { version = "2"'
            );
            fixes.push('Fixed Tauri version mismatch: upgraded tauri to v2 (required for tauri-plugin-shell v2)');
            cargoModified = true;
          }
          if (cargoContent.match(/tauri-build\s*=\s*\{\s*version\s*=\s*["']1\./)) {
            cargoContent = cargoContent.replace(
              /tauri-build\s*=\s*\{\s*version\s*=\s*["']1\.[^"']+["']/g,
              'tauri-build = { version = "2"'
            );
            fixes.push('Fixed tauri-build version mismatch: upgraded to v2');
            cargoModified = true;
          }
        }

        if (cargoModified) {
          fs.writeFileSync(cargoTomlPath, cargoContent, 'utf-8');
        }
      } catch (error: any) {
        errors.push(`Error fixing Cargo.toml: ${error.message}`);
      }
    }

    // Fix package.json dependencies
    const packageJsonPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        let modified = false;

        // Add missing @tauri-apps/plugin-shell
        if (!packageJson.dependencies?.['@tauri-apps/plugin-shell']) {
          packageJson.dependencies = packageJson.dependencies || {};
          packageJson.dependencies['@tauri-apps/plugin-shell'] = '^2.0.0';
          fixes.push('Added missing @tauri-apps/plugin-shell dependency');
          modified = true;
        }

        // Update outdated versions
        const versionFixes: Record<string, string> = {
          '@tauri-apps/api': '^2.0.0',
          '@tauri-apps/cli': '^2.0.0',
          'react': '^18.3.1',
          'react-dom': '^18.3.1',
          'typescript': '^5.6.2',
          'vite': '^5.4.6'
        };

        for (const [pkg, version] of Object.entries(versionFixes)) {
          if (packageJson.dependencies?.[pkg] && packageJson.dependencies[pkg] !== version) {
            const oldVersion = packageJson.dependencies[pkg];
            if (this.isOlderVersion(oldVersion, version)) {
              packageJson.dependencies[pkg] = version;
              fixes.push(`Updated ${pkg}: ${oldVersion} -> ${version}`);
              modified = true;
            }
          }
          if (packageJson.devDependencies?.[pkg] && packageJson.devDependencies[pkg] !== version) {
            const oldVersion = packageJson.devDependencies[pkg];
            if (this.isOlderVersion(oldVersion, version)) {
              packageJson.devDependencies[pkg] = version;
              fixes.push(`Updated ${pkg}: ${oldVersion} -> ${version}`);
              modified = true;
            }
          }
        }

        if (modified) {
          fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
        }
      } catch (error: any) {
        errors.push(`Error fixing package.json: ${error.message}`);
      }
    }

    // Fix index.html script reference typos
    const indexHtmlPath = path.join(workspacePath, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      try {
        const rawHtml = this.safeReadFileSync(indexHtmlPath, 'utf-8');
        if (rawHtml !== null) {
          let htmlContent = rawHtml;
          let htmlModified = false;
          
          // Fix .tsxx typo (common AI generation error)
          if (htmlContent.includes('.tsxx')) {
            htmlContent = htmlContent.replace(/\.tsxx/g, '.tsx');
            fixes.push('Fixed index.html: .tsxx -> .tsx typo');
            htmlModified = true;
          }

          // Fix .jsx typo -> .tsx for TypeScript projects
          if (htmlContent.includes('main.jsx') && fs.existsSync(path.join(workspacePath, 'src', 'main.tsx'))) {
            htmlContent = htmlContent.replace(/main\.jsx/g, 'main.tsx');
            fixes.push('Fixed index.html: main.jsx -> main.tsx');
            htmlModified = true;
          }

          if (htmlModified) {
            fs.writeFileSync(indexHtmlPath, htmlContent, 'utf-8');
          }
        }
      } catch (error: any) {
        errors.push(`Error fixing index.html: ${error.message}`);
      }
    }

    // Fix Rust main.rs - deprecated sysinfo::SystemExt and missing plugin init
    const mainRsPath = path.join(workspacePath, 'src-tauri', 'src', 'main.rs');
    if (fs.existsSync(mainRsPath)) {
      try {
        let rustContent = fs.readFileSync(mainRsPath, 'utf-8');
        let rustModified = false;

        // Remove deprecated SystemExt import (removed in sysinfo 0.30+)
        if (rustContent.includes('SystemExt')) {
          rustContent = rustContent.replace(/,\s*SystemExt/g, '');
          rustContent = rustContent.replace(/SystemExt,\s*/g, '');
          rustContent = rustContent.replace(/use sysinfo::\{([^}]*),?\s*SystemExt\s*,?([^}]*)\}/g, 'use sysinfo::{$1$2}');
          rustContent = rustContent.replace(/use sysinfo::SystemExt;?\n?/g, '');
          // Clean up empty imports
          rustContent = rustContent.replace(/use sysinfo::\{\s*,/g, 'use sysinfo::{');
          rustContent = rustContent.replace(/,\s*\}/g, '}');
          fixes.push('Removed deprecated sysinfo::SystemExt import (not needed in sysinfo 0.30+)');
          rustModified = true;
        }

        // Fix cpu_arch() call (no longer returns Option in newer sysinfo)
        if (rustContent.includes('cpu_arch().unwrap_or')) {
          rustContent = rustContent.replace(/cpu_arch\(\)\.unwrap_or_else\(\|\|\s*["'][^"']*["']\.to_string\(\)\)/g, 'cpu_arch()');
          rustContent = rustContent.replace(/cpu_arch\(\)\.unwrap_or\([^)]+\)/g, 'cpu_arch()');
          fixes.push('Fixed cpu_arch() call for newer sysinfo API');
          rustModified = true;
        }

        // Add missing tauri_plugin_shell::init() if tauri-plugin-shell is a dependency
        if (rustContent.includes('tauri::Builder') && !rustContent.includes('tauri_plugin_shell::init()')) {
          // Check if Cargo.toml has tauri-plugin-shell
          if (fs.existsSync(cargoTomlPath)) {
            const cargoCheck = fs.readFileSync(cargoTomlPath, 'utf-8');
            if (cargoCheck.includes('tauri-plugin-shell')) {
              // Add .plugin(tauri_plugin_shell::init()) after .default()
              rustContent = rustContent.replace(
                /tauri::Builder::default\(\)\s*\n(\s*)\.invoke_handler/,
                'tauri::Builder::default()\n$1.plugin(tauri_plugin_shell::init())\n$1.invoke_handler'
              );
              // Also try alternate pattern with .setup
              rustContent = rustContent.replace(
                /tauri::Builder::default\(\)\s*\n(\s*)\.setup/,
                'tauri::Builder::default()\n$1.plugin(tauri_plugin_shell::init())\n$1.setup'
              );
              // Also try alternate pattern with .run
              rustContent = rustContent.replace(
                /tauri::Builder::default\(\)\s*\n(\s*)\.run/,
                'tauri::Builder::default()\n$1.plugin(tauri_plugin_shell::init())\n$1.run'
              );
              fixes.push('Added missing .plugin(tauri_plugin_shell::init()) call');
              rustModified = true;
            }
          }
        }

        // Fix Tauri v1 API -> v2 API: get_window -> get_webview_window
        if (rustContent.includes('.get_window(') || rustContent.includes('get_window(')) {
          rustContent = rustContent.replace(/\.get_window\(/g, '.get_webview_window(');
          rustContent = rustContent.replace(/app\.get_window\(/g, 'app.get_webview_window(');
          fixes.push('Fixed Rust API: get_window -> get_webview_window (v2 API)');
          rustModified = true;
        }

        // Fix Tauri v1 window.maximize().unwrap() -> safer pattern
        if (rustContent.includes('window.maximize().unwrap()')) {
          rustContent = rustContent.replace(
            /window\.maximize\(\)\.unwrap\(\)/g,
            'let _ = window.maximize()'
          );
          fixes.push('Fixed window.maximize() to use safer pattern');
          rustModified = true;
        }

        if (rustModified) {
          fs.writeFileSync(mainRsPath, rustContent, 'utf-8');
        }
      } catch (error: any) {
        errors.push(`Error fixing main.rs: ${error.message}`);
      }
    }

    // Fix tauri-build devtools feature (doesn't exist)
    if (fs.existsSync(cargoTomlPath)) {
      try {
        let cargoContent = fs.readFileSync(cargoTomlPath, 'utf-8');
        // tauri-build doesn't have devtools feature
        if (cargoContent.includes('tauri-build') && cargoContent.includes('features = ["devtools"]')) {
          cargoContent = cargoContent.replace(
            /tauri-build\s*=\s*\{\s*version\s*=\s*["'][^"']+["']\s*,\s*features\s*=\s*\["devtools"\]\s*\}/g,
            (match) => match.replace('features = ["devtools"]', 'features = []')
          );
          fs.writeFileSync(cargoTomlPath, cargoContent, 'utf-8');
          fixes.push('Removed invalid devtools feature from tauri-build (not a valid feature)');
        }
      } catch (error: any) {
        // Already handled above
      }
    }

    // Fix Vite config to use correct port for Tauri (1420)
    const viteConfigPaths = [
      path.join(workspacePath, 'vite.config.js'),
      path.join(workspacePath, 'vite.config.ts')
    ];
    for (const viteConfigPath of viteConfigPaths) {
      if (fs.existsSync(viteConfigPath)) {
        try {
          let viteContent = fs.readFileSync(viteConfigPath, 'utf-8');
          // Check if port is not 1420 (standard Tauri port)
          const portMatch = viteContent.match(/port:\s*(\d+)/);
          if (portMatch && portMatch[1] !== '1420') {
            viteContent = viteContent.replace(/port:\s*\d+/, 'port: 1420');
            fs.writeFileSync(viteConfigPath, viteContent, 'utf-8');
            fixes.push(`Fixed Vite port: ${portMatch[1]} -> 1420 (standard Tauri port)`);
          }
          // Add port config if missing
          if (!viteContent.includes('port:') && viteContent.includes('server:')) {
            viteContent = viteContent.replace(
              /server:\s*\{/,
              'server: {\n    port: 1420,'
            );
            fs.writeFileSync(viteConfigPath, viteContent, 'utf-8');
            fixes.push('Added port: 1420 to Vite server config');
          }
        } catch (error: any) {
          errors.push(`Error fixing vite config: ${error.message}`);
        }
      }
    }

    // Add .gitignore if missing
    const gitignorePath = path.join(workspacePath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const gitignoreContent = `# Dependencies
node_modules/

# Build outputs
dist/
target/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Environment
.env
.env.*
`;
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
      fixes.push('Added missing .gitignore file');
    }

    // Create src-tauri/icons directory with actual icon files (Tauri REQUIRES these)
    const srcTauriIconsPath = path.join(workspacePath, 'src-tauri', 'icons');

    // First, remove any placeholder text files masquerading as icons
    if (fs.existsSync(srcTauriIconsPath)) {
      try {
        const iconFiles = fs.readdirSync(srcTauriIconsPath);
        for (const iconFile of iconFiles) {
          const iconPath = path.join(srcTauriIconsPath, iconFile);
          if (iconFile.endsWith('.ico') || iconFile.endsWith('.png') || iconFile.endsWith('.icns')) {
            const stat = fs.statSync(iconPath);
            // Real icons are binary and typically > 100 bytes
            // Placeholder text files are small and start with text
            if (stat.size < 100) {
              const content = this.safeReadFileSync(iconPath);
              if (content === null) continue; // OneDrive placeholder
              // Check if it's text (starts with # or ASCII)
              if (content[0] === 0x23 || (content[0] >= 0x20 && content[0] <= 0x7E)) {
                // This is a placeholder text file, remove it
                fs.unlinkSync(iconPath);
                fixes.push(`Removed placeholder text file masquerading as icon: ${iconFile}`);
              }
            }
          }
        }
      } catch (error: any) {
        errors.push(`Error checking icon files: ${error.message}`);
      }
    }
    const iconIcoPath = path.join(srcTauriIconsPath, 'icon.ico');
    
    // Check if icons directory exists AND has valid icon.ico
    const needsIcons = !fs.existsSync(srcTauriIconsPath) || 
                       !fs.existsSync(iconIcoPath) ||
                       fs.statSync(iconIcoPath).size < 100; // Too small = placeholder
    
    if (needsIcons) {
      fs.mkdirSync(srcTauriIconsPath, { recursive: true });
      
      // Generate minimal valid ICO file (16x16 purple square)
      const icoBuffer = this.generateMinimalIco();
      fs.writeFileSync(iconIcoPath, icoBuffer);
      
      // Generate minimal valid PNG files
      const png32 = this.generateMinimalPng(32);
      const png128 = this.generateMinimalPng(128);
      const png256 = this.generateMinimalPng(256);
      
      fs.writeFileSync(path.join(srcTauriIconsPath, '32x32.png'), png32);
      fs.writeFileSync(path.join(srcTauriIconsPath, '128x128.png'), png128);
      fs.writeFileSync(path.join(srcTauriIconsPath, '128x128@2x.png'), png256);
      
      fixes.push('Generated valid Tauri icon files (icon.ico, PNG icons)');
    }

    console.log(`[ProjectAutoFixer] 🦀 Tauri fixes applied: ${fixes.length}`);
  }

  /**
   * Generate a minimal valid ICO file (16x16 purple icon)
   */
  private static generateMinimalIco(): Buffer {
    // ICO header: Reserved(2) + Type(2) + Count(2) = 6 bytes
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);     // Reserved
    header.writeUInt16LE(1, 2);     // Type (1 = ICO)
    header.writeUInt16LE(1, 4);     // Image count

    // ICO directory entry: 16 bytes
    const entry = Buffer.alloc(16);
    entry.writeUInt8(16, 0);        // Width
    entry.writeUInt8(16, 1);        // Height
    entry.writeUInt8(0, 2);         // Color palette
    entry.writeUInt8(0, 3);         // Reserved
    entry.writeUInt16LE(1, 4);      // Color planes
    entry.writeUInt16LE(32, 6);     // Bits per pixel
    const imageSize = 40 + (16 * 16 * 4) + 64; // BMP header + pixels + AND mask
    entry.writeUInt32LE(imageSize, 8);  // Size of image data
    entry.writeUInt32LE(22, 12);    // Offset to image data (6 + 16 = 22)

    // BMP Info Header (BITMAPINFOHEADER): 40 bytes
    const bmpHeader = Buffer.alloc(40);
    bmpHeader.writeUInt32LE(40, 0);     // Header size
    bmpHeader.writeInt32LE(16, 4);      // Width
    bmpHeader.writeInt32LE(32, 8);      // Height (doubled for ICO)
    bmpHeader.writeUInt16LE(1, 12);     // Planes
    bmpHeader.writeUInt16LE(32, 14);    // Bits per pixel
    bmpHeader.writeUInt32LE(0, 16);     // Compression
    bmpHeader.writeUInt32LE(16 * 16 * 4, 20); // Image size

    // Pixel data (16x16 BGRA - purple color)
    const pixels = Buffer.alloc(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      pixels.writeUInt8(128, i * 4);     // Blue
      pixels.writeUInt8(64, i * 4 + 1);  // Green
      pixels.writeUInt8(255, i * 4 + 2); // Red
      pixels.writeUInt8(255, i * 4 + 3); // Alpha
    }

    // AND mask (16x16 bits, all zeros = fully opaque)
    const andMask = Buffer.alloc(64);

    return Buffer.concat([header, entry, bmpHeader, pixels, andMask]);
  }

  /**
   * Generate a minimal valid PNG file (solid purple square)
   */
  private static generateMinimalPng(size: number): Buffer {
    const zlib = require('zlib');
    
    // PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(size, 0);   // Width
    ihdrData.writeUInt32BE(size, 4);   // Height
    ihdrData.writeUInt8(8, 8);         // Bit depth
    ihdrData.writeUInt8(6, 9);         // Color type (RGBA)
    ihdrData.writeUInt8(0, 10);        // Compression
    ihdrData.writeUInt8(0, 11);        // Filter
    ihdrData.writeUInt8(0, 12);        // Interlace
    
    const ihdrCrc = this.crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
    const ihdr = Buffer.concat([
      this.uint32BE(13),
      Buffer.from('IHDR'),
      ihdrData,
      this.uint32BE(ihdrCrc)
    ]);

    // IDAT chunk (compressed pixel data)
    const rowSize = 1 + size * 4; // Filter byte + RGBA
    const rawData = Buffer.alloc(size * rowSize);
    for (let y = 0; y < size; y++) {
      const rowOffset = y * rowSize;
      rawData.writeUInt8(0, rowOffset); // No filter
      for (let x = 0; x < size; x++) {
        const pixelOffset = rowOffset + 1 + x * 4;
        rawData.writeUInt8(128, pixelOffset);     // R (purple)
        rawData.writeUInt8(64, pixelOffset + 1);  // G
        rawData.writeUInt8(255, pixelOffset + 2); // B
        rawData.writeUInt8(255, pixelOffset + 3); // A
      }
    }
    
    const compressed = zlib.deflateSync(rawData);
    const idatCrc = this.crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
    const idat = Buffer.concat([
      this.uint32BE(compressed.length),
      Buffer.from('IDAT'),
      compressed,
      this.uint32BE(idatCrc)
    ]);

    // IEND chunk
    const iendCrc = this.crc32(Buffer.from('IEND'));
    const iend = Buffer.concat([
      this.uint32BE(0),
      Buffer.from('IEND'),
      this.uint32BE(iendCrc)
    ]);

    return Buffer.concat([signature, ihdr, idat, iend]);
  }

  /**
   * Helper: Write 32-bit big-endian
   */
  private static uint32BE(value: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value, 0);
    return buf;
  }

  /**
   * Helper: CRC32 for PNG chunks
   */
  private static crc32(data: Buffer): number {
    let crc = 0xFFFFFFFF;
    const table = this.getCrc32Table();
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  private static crc32Table: number[] | null = null;
  private static getCrc32Table(): number[] {
    if (this.crc32Table) return this.crc32Table;
    this.crc32Table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      this.crc32Table[n] = c;
    }
    return this.crc32Table;
  }

  /**
   * Check if version A is older than version B (simple comparison)
   */
  private static isOlderVersion(versionA: string, versionB: string): boolean {
    // Extract major.minor.patch from versions like ^18.2.0 or ~5.0.0
    const extractVersion = (v: string) => {
      const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }
      return [0, 0, 0];
    };

    const [aMajor, aMinor, aPatch] = extractVersion(versionA);
    const [bMajor, bMinor, bPatch] = extractVersion(versionB);

    if (aMajor !== bMajor) return aMajor < bMajor;
    if (aMinor !== bMinor) return aMinor < bMinor;
    return aPatch < bPatch;
  }

  /**
   * Fix batch files to include Node.js detection
   */
  private static fixBatchFiles(workspacePath: string, fixes: string[], errors: string[]): void {
    if (process.platform !== 'win32') return;

    const batFiles = this.findBatchFiles(workspacePath);
    const toolPaths = getToolPaths();

    for (const batPath of batFiles) {
      try {
        const content = this.safeReadFileSync(batPath, 'utf-8');
        if (content === null) continue; // OneDrive placeholder - skip

        // Check if it already has Node.js detection
        if (content.includes('NODE_EXE=') || content.includes('NPM_EXE=')) {
          continue; // Already has detection
        }

        // Check if it uses npm or node
        if (content.includes('npm') || content.includes('node')) {
          // Add Node.js detection at the top
          const detectionCode = this.generateNodeDetectionCode(toolPaths);
          const lines = content.split('\n');
          
          // Find where to insert (after @echo off or first line)
          let insertIndex = 0;
          if (lines[0].includes('@echo off')) {
            insertIndex = 1;
          }

          // Insert detection code
          lines.splice(insertIndex, 0, ...detectionCode.split('\n'));
          const newContent = lines.join('\n');

          fs.writeFileSync(batPath, newContent, 'utf-8');
          fixes.push(`Updated ${path.basename(batPath)} with Node.js detection`);
        }
      } catch (error: any) {
        errors.push(`Error fixing ${path.basename(batPath)}: ${error.message}`);
      }
    }
  }

  /**
   * Generate Node.js detection code for batch files
   */
  private static generateNodeDetectionCode(toolPaths: any): string {
    const code = [
      'REM ============================================================',
      'REM Node.js/npm Detection - Finds Node.js if not in PATH',
      'REM ============================================================',
      'set NODE_EXE=',
      'set NPM_EXE=',
      '',
      'REM Check if npm is already in PATH',
      'where npm >nul 2>&1',
      'if not errorlevel 1 (',
      '    set "NPM_EXE=npm"',
      '    set "NODE_EXE=node"',
      '    goto :node_found',
      ')',
      '',
      'REM Check common Node.js installation locations',
    ];

    // Add A:\Nodejs first (user's specific location)
    code.push('if exist "A:\\Nodejs\\npm.cmd" (');
    code.push('    set "NODE_EXE=A:\\Nodejs\\node.exe"');
    code.push('    set "NPM_EXE=A:\\Nodejs\\npm.cmd"');
    code.push('    set "PATH=A:\\Nodejs;%PATH%"');
    code.push('    goto :node_found');
    code.push(')');
    code.push('if exist "A:\\nodejs\\npm.cmd" (');
    code.push('    set "NODE_EXE=A:\\nodejs\\node.exe"');
    code.push('    set "NPM_EXE=A:\\nodejs\\npm.cmd"');
    code.push('    set "PATH=A:\\nodejs;%PATH%"');
    code.push('    goto :node_found');
    code.push(')');

    // Add other common locations
    const commonPaths = [
      'C:\\Program Files\\nodejs',
      '%ProgramFiles%\\nodejs',
      '%LOCALAPPDATA%\\Programs\\nodejs',
      '%APPDATA%\\nvm\\current'
    ];

    for (const basePath of commonPaths) {
      code.push(`if exist "${basePath}\\npm.cmd" (`);
      code.push(`    set "NODE_EXE="${basePath}\\node.exe"`);
      code.push(`    set "NPM_EXE="${basePath}\\npm.cmd"`);
      code.push(`    set "PATH="${basePath};%PATH%"`);
      code.push('    goto :node_found');
      code.push(')');
    }

    // Check other drive letters
    code.push('');
    code.push('REM Check other common drive letters');
    code.push('for %%d in (D E F G H) do (');
    code.push('    if exist "%%d:\\Program Files\\nodejs\\npm.cmd" (');
    code.push('        set "NODE_EXE=%%d:\\Program Files\\nodejs\\node.exe"');
    code.push('        set "NPM_EXE=%%d:\\Program Files\\nodejs\\npm.cmd"');
    code.push('        set "PATH=%%d:\\Program Files\\nodejs;%PATH%"');
    code.push('        goto :node_found');
    code.push('    )');
    code.push('    if exist "%%d:\\nodejs\\npm.cmd" (');
    code.push('        set "NODE_EXE=%%d:\\nodejs\\node.exe"');
    code.push('        set "NPM_EXE=%%d:\\nodejs\\npm.cmd"');
    code.push('        set "PATH=%%d:\\nodejs;%PATH%"');
    code.push('        goto :node_found');
    code.push('    )');
    code.push(')');
    code.push('');
    code.push('REM If still not found, show error');
    code.push('echo [ERROR] Node.js/npm not found!');
    code.push('echo.');
    code.push('echo Please install Node.js from https://nodejs.org/');
    code.push('echo Or add Node.js to your system PATH.');
    code.push('pause');
    code.push('exit /b 1');
    code.push('');
    code.push(':node_found');
    code.push('REM Node.js found, continue with script');
    code.push('');

    return code.join('\r\n');
  }

  /**
   * Fix common file issues
   */
  private static fixFileIssues(workspacePath: string, fixes: string[], errors: string[]): void {
    // Fix main.ts -> main.tsx if it contains JSX
    const mainTsPath = path.join(workspacePath, 'src', 'main.ts');
    if (fs.existsSync(mainTsPath)) {
      try {
        const content = this.safeReadFileSync(mainTsPath, 'utf-8');
        if (content === null) return; // OneDrive placeholder
        if (content.includes('React') || content.includes('JSX') || content.includes('<')) {
          // Contains JSX, should be .tsx
          const mainTsxPath = path.join(workspacePath, 'src', 'main.tsx');
          fs.writeFileSync(mainTsxPath, content, 'utf-8');
          fs.unlinkSync(mainTsPath);
          fixes.push('Renamed main.ts to main.tsx (contains JSX)');
          
          // Update index.html if it references main.ts
          this.updateHtmlReference(workspacePath, 'main.ts', 'main.tsx', fixes);
        }
      } catch (error: any) {
        errors.push(`Error fixing main.ts: ${error.message}`);
      }
    }

    // Remove conflicting .js files if .ts versions exist
    const jsFiles = this.findFiles(workspacePath, '.js');
    for (const jsFile of jsFiles) {
      const tsFile = jsFile.replace(/\.js$/, '.ts');
      const tsxFile = jsFile.replace(/\.js$/, '.tsx');
      if (fs.existsSync(tsFile) || fs.existsSync(tsxFile)) {
        try {
          // Check if .js file is from old game (like Game.js vs Game.ts)
          const jsContent = this.safeReadFileSync(jsFile, 'utf-8');
          if (jsContent === null) continue; // OneDrive placeholder
          const tsContent = fs.existsSync(tsFile) 
            ? this.safeReadFileSync(tsFile, 'utf-8')
            : this.safeReadFileSync(tsxFile, 'utf-8');
          if (tsContent === null) continue; // OneDrive placeholder
          
          // If they're completely different (old game code), delete .js
          if (!jsContent.includes('Three') && tsContent.includes('Three')) {
            fs.unlinkSync(jsFile);
            fixes.push(`Removed conflicting ${path.basename(jsFile)} (TypeScript version exists)`);
          }
        } catch (error: any) {
          // Ignore
        }
      }
    }
  }

  /**
   * Fix HTML entry points
   */
  private static fixHtmlEntryPoints(workspacePath: string, fixes: string[], errors: string[]): void {
    const htmlFiles = this.findFiles(workspacePath, '.html');
    
    for (const htmlPath of htmlFiles) {
      try {
        const rawContent = this.safeReadFileSync(htmlPath, 'utf-8');
        if (rawContent === null) continue; // OneDrive placeholder - skip
        let content = rawContent;
        let modified = false;

        // Fix CSS references that don't exist - check for common mismatches
        const cssRefs = content.match(/href=["']([^"']+\.css)["']/g) || [];
        for (const ref of cssRefs) {
          const cssFile = ref.match(/href=["']([^"']+\.css)["']/)?.[1];
          if (cssFile && !cssFile.startsWith('http')) {
            const cssPath = path.resolve(path.dirname(htmlPath), cssFile.replace(/^\//, ''));
            if (!fs.existsSync(cssPath)) {
              // Try to find the actual CSS file
              const possiblePaths = [
                path.join(workspacePath, 'src', 'styles.css'),
                path.join(workspacePath, 'styles.css'),
                path.join(workspacePath, 'src', 'styles', 'main.css'),
                path.join(workspacePath, 'src', 'main.css'),
              ];
              
              for (const possiblePath of possiblePaths) {
                if (fs.existsSync(possiblePath)) {
                  const relativePath = path.relative(path.dirname(htmlPath), possiblePath).replace(/\\/g, '/');
                  // Fix the reference
                  content = content.replace(
                    new RegExp(`href=["']${cssFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g'),
                    `href="${relativePath.startsWith('.') ? relativePath : './' + relativePath}"`
                  );
                  fixes.push(`Fixed CSS reference in ${path.basename(htmlPath)}: ${cssFile} → ${relativePath}`);
                  modified = true;
                  break;
                }
              }
            }
          }
        }

        // Check if it's a React app but doesn't have #root
        if (content.includes('React') || this.hasReactFiles(workspacePath)) {
          if (!content.includes('id="root"') && !content.includes("id='root'")) {
            // Add root div
            if (content.includes('</body>')) {
              content = content.replace('</body>', '    <div id="root"></div>\n</body>');
              modified = true;
            }
          }

          // Fix script reference to use .tsx if it exists
          if (content.includes('main.ts') && fs.existsSync(path.join(workspacePath, 'src', 'main.tsx'))) {
            content = content.replace(/main\.ts/g, 'main.tsx');
            modified = true;
          }

          // Fix script path to use /src/ prefix for Vite
          if (content.includes('src="src/') || content.includes("src='src/")) {
            // Already correct
          } else if (content.includes('src="main') || content.includes("src='main")) {
            content = content.replace(/src="(main\.[^"]+)"/g, 'src="/src/$1"');
            content = content.replace(/src='(main\.[^']+)'/g, "src='/src/$1'");
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(htmlPath, content, 'utf-8');
          if (!fixes.some(f => f.includes(path.basename(htmlPath)))) {
            fixes.push(`Fixed ${path.basename(htmlPath)} entry point`);
          }
        }
      } catch (error: any) {
        errors.push(`Error fixing ${path.basename(htmlPath)}: ${error.message}`);
      }
    }
  }

  /**
   * Fix TypeScript configuration
   */
  private static fixTypeScriptConfig(workspacePath: string, fixes: string[], errors: string[]): void {
    const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
    const viteConfigPath = path.join(workspacePath, 'vite.config.ts');
    
    // If vite.config.ts exists, we need tsconfig.node.json
    if (fs.existsSync(viteConfigPath)) {
      const tsconfigNodePath = path.join(workspacePath, 'tsconfig.node.json');
      if (!fs.existsSync(tsconfigNodePath)) {
        try {
          const nodeConfig = {
            compilerOptions: {
              composite: true,
              skipLibCheck: true,
              module: 'ESNext',
              moduleResolution: 'bundler',
              allowSyntheticDefaultImports: true
            },
            include: ['vite.config.ts']
          };
          fs.writeFileSync(tsconfigNodePath, JSON.stringify(nodeConfig, null, 2) + '\n', 'utf-8');
          fixes.push('Created missing tsconfig.node.json');
        } catch (error: any) {
          errors.push(`Error creating tsconfig.node.json: ${error.message}`);
        }
      }

      // Update tsconfig.json to reference it
      if (fs.existsSync(tsconfigPath)) {
        try {
          const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
          if (!tsconfig.references) {
            tsconfig.references = [{ path: './tsconfig.node.json' }];
            fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
            fixes.push('Updated tsconfig.json to reference tsconfig.node.json');
          }
        } catch (error: any) {
          // Ignore
        }
      }
    }
  }

  // Helper methods
  private static hasReactFiles(workspacePath: string): boolean {
    return this.findFiles(workspacePath, '.tsx').length > 0 ||
           this.findFiles(workspacePath, '.jsx').length > 0 ||
           fs.existsSync(path.join(workspacePath, 'src', 'App.tsx')) ||
           fs.existsSync(path.join(workspacePath, 'src', 'App.jsx'));
  }

  private static hasTypeScriptFiles(workspacePath: string): boolean {
    return this.findFiles(workspacePath, '.ts').length > 0 ||
           this.findFiles(workspacePath, '.tsx').length > 0;
  }

  private static hasThreeJsFiles(workspacePath: string): boolean {
    const files = [...this.findFiles(workspacePath, '.ts'), ...this.findFiles(workspacePath, '.js')];
    for (const file of files) {
      try {
        const content = this.safeReadFileSync(file, 'utf-8');
        if (content === null) continue; // OneDrive placeholder
        if (content.includes('three') || content.includes('THREE') || content.includes('from \'three\'')) {
          return true;
        }
      } catch {
        // Ignore
      }
    }
    return false;
  }

  private static findBatchFiles(workspacePath: string): string[] {
    const files: string[] = [];
    const find = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
            find(fullPath);
          } else if (entry.endsWith('.bat')) {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore
      }
    };
    find(workspacePath);
    return files;
  }

  private static findFiles(workspacePath: string, extension: string): string[] {
    const files: string[] = [];
    const find = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
            find(fullPath);
          } else if (entry.endsWith(extension)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore
      }
    };
    find(workspacePath);
    return files;
  }

  private static updateHtmlReference(workspacePath: string, oldRef: string, newRef: string, fixes: string[]): void {
    const htmlFiles = this.findFiles(workspacePath, '.html');
    for (const htmlPath of htmlFiles) {
      try {
        const content = this.safeReadFileSync(htmlPath, 'utf-8');
        if (content === null) continue; // OneDrive placeholder
        if (content.includes(oldRef)) {
          const updated = content.replace(new RegExp(oldRef.replace('.', '\\.'), 'g'), newRef);
          fs.writeFileSync(htmlPath, updated, 'utf-8');
          fixes.push(`Updated ${path.basename(htmlPath)} to reference ${newRef}`);
        }
      } catch {
        // Ignore
      }
    }
  }
}

