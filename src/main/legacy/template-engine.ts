/**
 * AgentPrime Template Engine
 * Creates projects from templates with variable substitution
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { sanitizeFolderName } from '../security/ipcValidation';

interface TemplateRegistry {
  templates: Template[];
  categories: Category[];
}

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
}

interface Category {
  id: string;
  name: string;
  description?: string;
}

interface TemplateDefinition {
  files?: TemplateFile[];
  directories?: string[];
  postCreate?: string[];
}

interface TemplateFile {
  template: string;
  path: string;
}

interface CreateProjectResult {
  success: boolean;
  projectPath: string;
  template: string;
  filesCreated: string[];
  postCreate: string[];
  dependenciesInstalled?: boolean;
  installOutput?: string;
}

interface Variables {
  projectName: string;
  [key: string]: any;
}

class TemplateEngine {
  private templatesDir: string;
  private registry: TemplateRegistry | null = null;

  constructor(templatesDir: string) {
    this.templatesDir = templatesDir;
    console.log(`[TemplateEngine] Initialized with templates directory: ${templatesDir}`);
  }

  /**
   * Load the template registry
   */
  loadRegistry(): TemplateRegistry {
    const registryPath = path.join(this.templatesDir, 'registry.json');
    console.log(`[TemplateEngine] Loading registry from: ${registryPath}`);

    if (!fs.existsSync(registryPath)) {
      const error = `Template registry not found at ${registryPath}`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as TemplateRegistry;
      this.registry = parsed;
      const templateCount = parsed.templates ? parsed.templates.length : 0;
      const categoryCount = parsed.categories ? parsed.categories.length : 0;
      console.log(`[TemplateEngine] Registry loaded: ${templateCount} templates, ${categoryCount} categories`);
      return parsed;
    } catch (e: any) {
      const error = `Failed to parse registry JSON: ${e.message}`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }
  }

  /**
   * Get all available templates
   */
  getTemplates(): Template[] {
    console.log('[TemplateEngine] getTemplates() called');
    if (!this.registry) this.loadRegistry();
    const templates = this.registry!.templates || [];
    console.log(`[TemplateEngine] Returning ${templates.length} templates`);
    return templates;
  }

  /**
   * Get template categories
   */
  getCategories(): Category[] {
    console.log('[TemplateEngine] getCategories() called');
    if (!this.registry) this.loadRegistry();
    const categories = this.registry!.categories || [];
    console.log(`[TemplateEngine] Returning ${categories.length} categories`);
    return categories;
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(templateId: string): Template | undefined {
    console.log(`[TemplateEngine] getTemplate(${templateId}) called`);
    if (!this.registry) this.loadRegistry();
    const template = this.registry!.templates.find(t => t.id === templateId);
    if (template) {
      console.log(`[TemplateEngine] Template '${templateId}' found: ${template.name}`);
    } else {
      console.warn(`[TemplateEngine] Template '${templateId}' not found`);
    }
    return template;
  }

  /**
   * Substitute variables in content
   */
  substituteVariables(content: string, variables: Variables): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  /**
   * Create a project from a template
   */
  async createProject(templateId: string, targetDir: string, variables: Variables): Promise<CreateProjectResult> {
    console.log(`[TemplateEngine] createProject() called: templateId=${templateId}, targetDir=${targetDir}`);
    console.log(`[TemplateEngine] Variables:`, JSON.stringify(variables, null, 2));

    const template = this.getTemplate(templateId);
    if (!template) {
      const error = `Template '${templateId}' not found`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }

    const templateDir = path.join(this.templatesDir, templateId);
    const templateJsonPath = path.join(templateDir, 'template.json');
    console.log(`[TemplateEngine] Template directory: ${templateDir}`);
    console.log(`[TemplateEngine] Template definition path: ${templateJsonPath}`);

    if (!fs.existsSync(templateJsonPath)) {
      const error = `Template definition not found for '${templateId}' at ${templateJsonPath}`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }

    let templateDef: TemplateDefinition;
    try {
      templateDef = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'));
      console.log(`[TemplateEngine] Template definition loaded: ${templateDef.files?.length || 0} files, ${templateDef.directories?.length || 0} directories`);
    } catch (e: any) {
      const error = `Failed to parse template.json: ${e.message}`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }

    // Sanitize project name to prevent invalid folder names
    const safeProjectName = sanitizeFolderName(variables.projectName);
    console.log(`[TemplateEngine] Original project name: "${variables.projectName}" -> Sanitized: "${safeProjectName}"`);
    
    const projectPath = path.join(targetDir, safeProjectName);
    console.log(`[TemplateEngine] Project will be created at: ${projectPath}`);

    // Create project directory
    console.log(`[TemplateEngine] Creating project directory: ${projectPath}`);
    try {
      fs.mkdirSync(projectPath, { recursive: true });
      console.log(`[TemplateEngine] Project directory created`);
    } catch (e: any) {
      const error = `Failed to create project directory: ${e.message}`;
      console.error(`[TemplateEngine] ERROR: ${error}`);
      throw new Error(error);
    }

    // Create subdirectories
    if (templateDef.directories) {
      console.log(`[TemplateEngine] Creating ${templateDef.directories.length} subdirectories`);
      for (const dir of templateDef.directories) {
        const dirPath = path.join(projectPath, dir);
        try {
          fs.mkdirSync(dirPath, { recursive: true });
          console.log(`[TemplateEngine] Created directory: ${dir}`);
        } catch (e: any) {
          console.warn(`[TemplateEngine] Warning: Failed to create directory ${dir}: ${e.message}`);
        }
      }
    }

    // Copy and process template files
    const createdFiles: string[] = [];
    console.log(`[TemplateEngine] Processing ${templateDef.files?.length || 0} template files`);
    if (templateDef.files) {
      for (const file of templateDef.files) {
        const sourcePath = path.join(templateDir, file.template);
        const targetPath = path.join(projectPath, file.path);

        // Ensure target directory exists
        try {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        } catch (e: any) {
          console.warn(`[TemplateEngine] Warning: Failed to create parent directory for ${file.path}: ${e.message}`);
        }

        if (fs.existsSync(sourcePath)) {
          try {
            // Read, substitute variables, and write
            let content = fs.readFileSync(sourcePath, 'utf-8');
            content = this.substituteVariables(content, variables);
            fs.writeFileSync(targetPath, content, 'utf-8');
            createdFiles.push(file.path);
            console.log(`[TemplateEngine] Created file: ${file.path}`);
          } catch (e: any) {
            console.error(`[TemplateEngine] ERROR: Failed to process file ${file.path}: ${e.message}`);
            throw new Error(`Failed to create file ${file.path}: ${e.message}`);
          }
        } else {
          console.warn(`[TemplateEngine] Warning: Template file not found: ${sourcePath}`);
        }
      }
    }

    // Generate .bat launcher files from package.json scripts
    console.log(`[TemplateEngine] Generating .bat launcher files`);
    const batFiles = this.generateBatFiles(projectPath, variables);
    if (batFiles.length > 0) {
      console.log(`[TemplateEngine] Generated ${batFiles.length} .bat files: ${batFiles.join(', ')}`);
    }
    createdFiles.push(...batFiles);

    // Generate .bat files for Python projects
    const pythonBats = this.generatePythonBatFiles(projectPath, variables);
    if (pythonBats.length > 0) {
      console.log(`[TemplateEngine] Generated ${pythonBats.length} Python .bat files: ${pythonBats.join(', ')}`);
    }
    createdFiles.push(...pythonBats);

    // Auto-install dependencies
    let dependenciesInstalled = false;
    let installOutput = '';

    // Check for Node.js project (package.json)
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      console.log(`[TemplateEngine] Node.js project detected, installing dependencies...`);
      const nodeResult = await this.installNodeDependencies(projectPath);
      dependenciesInstalled = nodeResult.success;
      installOutput = nodeResult.output;
      if (nodeResult.success) {
        console.log(`[TemplateEngine] Node.js dependencies installed successfully`);
      } else {
        console.warn(`[TemplateEngine] Node.js dependency installation failed: ${nodeResult.output}`);
      }
    }

    // Check for Python project (requirements.txt)
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      console.log(`[TemplateEngine] Python project detected, setting up environment...`);
      const pythonResult = await this.installPythonDependencies(projectPath);
      // Only update if not already set by Node install, or if Python succeeded
      if (!dependenciesInstalled || pythonResult.success) {
        dependenciesInstalled = pythonResult.success;
      }
      installOutput += (installOutput ? '\n' : '') + pythonResult.output;
      if (pythonResult.success) {
        console.log(`[TemplateEngine] Python environment set up successfully`);
      } else {
        console.warn(`[TemplateEngine] Python setup failed: ${pythonResult.output}`);
      }
    }

    const result: CreateProjectResult = {
      success: true,
      projectPath,
      template: templateId,
      filesCreated: createdFiles,
      postCreate: templateDef.postCreate || [],
      dependenciesInstalled,
      installOutput
    };

    console.log(`[TemplateEngine] Project creation completed successfully!`);
    console.log(`[TemplateEngine] Total files created: ${createdFiles.length}`);
    console.log(`[TemplateEngine] Dependencies installed: ${dependenciesInstalled}`);
    console.log(`[TemplateEngine] Project path: ${projectPath}`);

    return result;
  }

  /**
   * Install dependencies for Node.js projects (runs npm install)
   * Returns a promise that resolves with install result
   */
  async installNodeDependencies(projectPath: string): Promise<{ success: boolean; output: string }> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[TemplateEngine] No package.json found, skipping npm install`);
      return { success: true, output: 'No package.json found' };
    }

    console.log(`[TemplateEngine] Running npm install in ${projectPath}...`);
    
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const npmCmd = isWindows ? 'npm.cmd' : 'npm';
      
      let output = '';
      let errorOutput = '';
      
      const npmProcess = spawn(npmCmd, ['install'], {
        cwd: projectPath,
        shell: true,
        env: { ...process.env }
      });

      npmProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        console.log(`[TemplateEngine] npm: ${text.trim()}`);
      });

      npmProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        // npm often writes progress to stderr, so don't treat all as errors
        console.log(`[TemplateEngine] npm: ${text.trim()}`);
      });

      npmProcess.on('close', (code: number | null) => {
        if (code === 0) {
          console.log(`[TemplateEngine] npm install completed successfully`);
          resolve({ success: true, output: output || 'Dependencies installed successfully' });
        } else {
          console.error(`[TemplateEngine] npm install failed with code ${code}`);
          resolve({ success: false, output: errorOutput || output || `npm install failed with code ${code}` });
        }
      });

      npmProcess.on('error', (err: Error) => {
        console.error(`[TemplateEngine] npm install error: ${err.message}`);
        resolve({ success: false, output: `Failed to run npm install: ${err.message}` });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        npmProcess.kill();
        resolve({ success: false, output: 'npm install timed out after 5 minutes' });
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Install dependencies for Python projects (creates venv and runs pip install)
   * Returns a promise that resolves with install result
   */
  async installPythonDependencies(projectPath: string): Promise<{ success: boolean; output: string }> {
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    
    if (!fs.existsSync(requirementsPath)) {
      console.log(`[TemplateEngine] No requirements.txt found, skipping Python setup`);
      return { success: true, output: 'No requirements.txt found' };
    }

    console.log(`[TemplateEngine] Setting up Python environment in ${projectPath}...`);
    
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      let output = '';
      
      // First create venv
      const pythonCmd = isWindows ? 'python' : 'python3';
      const venvPath = path.join(projectPath, 'venv');
      
      if (fs.existsSync(venvPath)) {
        console.log(`[TemplateEngine] Virtual environment already exists`);
      }
      
      const createVenv = spawn(pythonCmd, ['-m', 'venv', 'venv'], {
        cwd: projectPath,
        shell: true
      });

      createVenv.on('close', (code) => {
        if (code !== 0) {
          resolve({ success: false, output: 'Failed to create virtual environment' });
          return;
        }
        
        console.log(`[TemplateEngine] Virtual environment created, installing dependencies...`);
        
        // Now install requirements
        const pipPath = isWindows 
          ? path.join(projectPath, 'venv', 'Scripts', 'pip.exe')
          : path.join(projectPath, 'venv', 'bin', 'pip');
        
        const pipInstall = spawn(pipPath, ['install', '-r', 'requirements.txt'], {
          cwd: projectPath,
          shell: true
        });

        pipInstall.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
        });

        pipInstall.stderr?.on('data', (data: Buffer) => {
          output += data.toString();
        });

        pipInstall.on('close', (pipCode) => {
          if (pipCode === 0) {
            console.log(`[TemplateEngine] Python dependencies installed successfully`);
            resolve({ success: true, output: 'Python dependencies installed' });
          } else {
            console.error(`[TemplateEngine] pip install failed`);
            resolve({ success: false, output: output || 'pip install failed' });
          }
        });

        pipInstall.on('error', (err) => {
          resolve({ success: false, output: `pip install error: ${err.message}` });
        });
      });

      createVenv.on('error', (err) => {
        resolve({ success: false, output: `Failed to create venv: ${err.message}` });
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        createVenv.kill();
        resolve({ success: false, output: 'Python setup timed out after 5 minutes' });
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Generate .bat launcher files from package.json scripts
   */
  generateBatFiles(projectPath: string, variables: Variables): string[] {
    const createdBats: string[] = [];
    const packageJsonPath = path.join(projectPath, 'package.json');

    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      return createdBats;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts = packageJson.scripts || {};

      // Common scripts to create .bat files for
      const scriptMap: { [key: string]: string } = {
        'dev': 'dev.bat',
        'start': 'start.bat',
        'build': 'build.bat',
        'test': 'test.bat',
        'lint': 'lint.bat',
        'preview': 'preview.bat'
      };

      for (const [scriptName, batFileName] of Object.entries(scriptMap)) {
        if (scripts[scriptName]) {
          const batContent = this.createBatFile(scriptName, scripts[scriptName], variables);
          const batPath = path.join(projectPath, batFileName);
          fs.writeFileSync(batPath, batContent, 'utf-8');
          createdBats.push(batFileName);
        }
      }

      // Create a master "run.bat" that shows available scripts
      if (Object.keys(scripts).length > 0) {
        const runBat = this.createRunBat(scripts, variables);
        const runBatPath = path.join(projectPath, 'run.bat');
        fs.writeFileSync(runBatPath, runBat, 'utf-8');
        createdBats.push('run.bat');
      }
    } catch (e: any) {
      console.error('Error generating .bat files:', e);
    }

    return createdBats;
  }

  /**
   * Generate Node.js/npm detection code for .bat files
   */
  generateNodeDetectionCode(): string {
    return `REM ============================================================
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

REM Check common Node.js installation locations
if exist "A:\\nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\nodejs\\node.exe"
    set "NPM_EXE=A:\\nodejs\\npm.cmd"
    set "PATH=A:\\nodejs;%PATH%"
    goto :node_found
)
if exist "A:\\Nodejs\\npm.cmd" (
    set "NODE_EXE=A:\\Nodejs\\node.exe"
    set "NPM_EXE=A:\\Nodejs\\npm.cmd"
    set "PATH=A:\\Nodejs;%PATH%"
    goto :node_found
)
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

REM Check other common drive letters
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
)

REM If still not found, show error
echo [ERROR] Node.js/npm not found!
echo.
echo Please install Node.js from https://nodejs.org/
echo Or add Node.js to your system PATH.
pause
exit /b 1

:node_found
REM Node.js found, continue with script
`;
  }

  /**
   * Create a .bat file for a specific npm script
   */
  createBatFile(scriptName: string, scriptCommand: string, variables: Variables): string {
    const projectName = variables.projectName || 'project';
    const nodeDetection = this.generateNodeDetectionCode();
    return `@echo off
REM ${projectName} - ${scriptName} launcher
REM Generated by AgentPrime

echo.
echo ========================================
echo   ${projectName} - ${scriptName}
echo ========================================
echo.

cd /d "%~dp0"

${nodeDetection}

REM Check if node_modules exists, install if needed
if not exist "node_modules" (
    echo [*] Installing dependencies...
    if defined NPM_EXE (
        call "%NPM_EXE%" install
    ) else (
        call npm install
    )
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [*] Dependencies installed successfully!
    echo.
)

REM Use detected npm or fallback to npm in PATH
if defined NPM_EXE (
    call "%NPM_EXE%" run ${scriptName}
) else (
    call npm run ${scriptName}
)

if errorlevel 1 (
    echo.
    echo [ERROR] Command failed!
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Command completed!
pause
`;
  }

  /**
   * Create a master run.bat that shows all available scripts
   */
  createRunBat(scripts: { [key: string]: string }, variables: Variables): string {
    const projectName = variables.projectName || 'project';
    let menu = `@echo off
REM ${projectName} - Script Launcher
REM Generated by AgentPrime

:menu
cls
echo.
echo ========================================
echo   ${projectName} - Available Scripts
echo ========================================
echo.
`;

    let optionNum = 1;
    const scriptOptions: Array<{ name: string; command: string }> = [];
    for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
      menu += `echo   [${optionNum}] ${scriptName.padEnd(12)} - ${scriptCommand}\n`;
      scriptOptions.push({ name: scriptName, command: scriptCommand });
      optionNum++;
    }

    menu += `echo   [${optionNum}] Exit
echo.
set /p choice="Select option: "

if "%choice%"=="" goto menu
`;

    // Generate if statements for each option
    for (let i = 0; i < scriptOptions.length; i++) {
      const opt = scriptOptions[i];
      menu += `if "%choice%"=="${i + 1}" goto run_${opt.name}\n`;
    }

    menu += `if "%choice%"=="${optionNum}" exit
goto menu

`;

    // Generate run sections for each script
    for (const opt of scriptOptions) {
      menu += `:run_${opt.name}
cls
echo.
echo ========================================
echo   Running: ${opt.name}
echo ========================================
echo.
cd /d "%~dp0"
call npm run ${opt.name}
echo.
pause
goto menu

`;
    }

    return menu;
  }

  /**
   * Generate Python detection code for .bat files
   * Tries multiple methods to find Python on any Windows machine
   */
  generatePythonDetectionCode(): string {
    return `REM Auto-detect Python installation
set PYTHON_CMD=
set PYTHON_FOUND=0

REM Method 1: Try 'python' command (most common)
where python >nul 2>&1
if %errorlevel%==0 (
    python --version >nul 2>&1
    if %errorlevel%==0 (
        set PYTHON_CMD=python
        set PYTHON_FOUND=1
    )
)

REM Method 2: Try 'python3' command
if %PYTHON_FOUND%==0 (
    where python3 >nul 2>&1
    if %errorlevel%==0 (
        python3 --version >nul 2>&1
        if %errorlevel%==0 (
            set PYTHON_CMD=python3
            set PYTHON_FOUND=1
        )
    )
)

REM Method 3: Try Windows Python launcher 'py'
if %PYTHON_FOUND%==0 (
    where py >nul 2>&1
    if %errorlevel%==0 (
        py --version >nul 2>&1
        if %errorlevel%==0 (
            set PYTHON_CMD=py
            set PYTHON_FOUND=1
        )
    )
)

REM Method 4: Check common installation paths
if %PYTHON_FOUND%==0 (
    REM Check LocalAppData (user installs)
    if exist "%LOCALAPPDATA%\\Programs\\Python" (
        for /d %%P in ("%LOCALAPPDATA%\\Programs\\Python\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check Program Files
    if exist "%PROGRAMFILES%\\Python*" (
        for /d %%P in ("%PROGRAMFILES%\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check Program Files (x86)
    if exist "%PROGRAMFILES(X86)%\\Python*" (
        for /d %%P in ("%PROGRAMFILES(X86)%\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check C:\\Python* (common custom install location)
    if exist "C:\\Python*" (
        for /d %%P in ("C:\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

if %PYTHON_FOUND%==0 (
    REM Check AppData\\Python
    if exist "%APPDATA%\\Python\\Python*" (
        for /d %%P in ("%APPDATA%\\Python\\Python*") do (
            if exist "%%P\\python.exe" (
                set PYTHON_CMD=%%P\\python.exe
                set PYTHON_FOUND=1
            )
            if %PYTHON_FOUND%==1 goto :check_done
        )
    )
)

:check_done
if %PYTHON_FOUND%==0 (
    echo.
    echo [ERROR] Python not found!
    echo.
    echo Please install Python from https://www.python.org/downloads/
    echo Or ensure Python is in your system PATH.
    echo.
    pause
    exit /b 1
)

REM Verify Python works
%PYTHON_CMD% --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Python found but not working: %PYTHON_CMD%
    echo.
    pause
    exit /b 1
)`;
  }

  /**
   * Generate .bat files for Python projects
   */
  generatePythonBatFiles(projectPath: string, variables: Variables): string[] {
    const createdBats: string[] = [];
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    const pyProjectPath = path.join(projectPath, 'pyproject.toml');
    const hasPython = fs.existsSync(requirementsPath) || fs.existsSync(pyProjectPath);

    if (!hasPython) {
      return createdBats;
    }

    const projectName = variables.projectName || 'project';

    // Create setup.bat for installing dependencies
    if (fs.existsSync(requirementsPath)) {
      const pythonDetection = this.generatePythonDetectionCode();
      const setupBat = `@echo off
REM ${projectName} - Setup Python Environment
REM Generated by AgentPrime

echo.
echo ========================================
echo   ${projectName} - Python Setup
echo ========================================
echo.

cd /d "%~dp0"

${pythonDetection}

echo [INFO] Using Python: %PYTHON_CMD%
%PYTHON_CMD% --version
echo.

echo [1/2] Creating virtual environment...
if not exist "venv" (
    %PYTHON_CMD% -m venv venv
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
    echo Virtual environment created!
) else (
    echo Virtual environment already exists.
)

echo.
echo [2/2] Installing dependencies...
call venv\\Scripts\\activate.bat
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to activate virtual environment!
    pause
    exit /b 1
)

REM Use python -m pip to ensure we use the venv's pip
%PYTHON_CMD% -m pip install --upgrade pip >nul 2>&1
%PYTHON_CMD% -m pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo [ERROR] Installation failed!
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Setup complete!
echo.
echo To activate the virtual environment, run:
echo   venv\\Scripts\\activate.bat
echo.
pause
`;
      fs.writeFileSync(path.join(projectPath, 'setup.bat'), setupBat, 'utf-8');
      createdBats.push('setup.bat');
    }

    // Create run.bat for Python projects
    const mainPyPath = path.join(projectPath, 'src', 'main.py');
    const cliPyPath = path.join(projectPath, 'src', 'cli.py');
    let runScript = 'main.py';

    if (fs.existsSync(cliPyPath)) {
      runScript = 'src/cli.py';
    } else if (fs.existsSync(mainPyPath)) {
      runScript = 'src/main.py';
    } else {
      // Look for any .py file in src/
      const srcPath = path.join(projectPath, 'src');
      if (fs.existsSync(srcPath)) {
        const files = fs.readdirSync(srcPath);
        const pyFile = files.find(f => f.endsWith('.py') && !f.startsWith('__'));
        if (pyFile) {
          runScript = `src/${pyFile}`;
        }
      }
    }

    if (runScript && fs.existsSync(path.join(projectPath, runScript))) {
      const pythonDetection = this.generatePythonDetectionCode();
      const runBat = `@echo off
REM ${projectName} - Run Python Application
REM Generated by AgentPrime

echo.
echo ========================================
echo   ${projectName} - Running...
echo ========================================
echo.

cd /d "%~dp0"

if not exist "venv" (
    echo [ERROR] Virtual environment not found!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Try to use venv's Python directly first (most reliable)
if exist "venv\\Scripts\\python.exe" (
    set VENV_PYTHON=venv\\Scripts\\python.exe
    %VENV_PYTHON% ${runScript} %*
    if errorlevel 1 (
        echo.
        echo [ERROR] Application failed!
        pause
        exit /b 1
    )
    pause
    exit /b 0
)

REM Fallback: Try to activate venv and use python command
${pythonDetection}

call venv\\Scripts\\activate.bat
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to activate virtual environment!
    echo Trying to use system Python instead...
    echo.
    %PYTHON_CMD% ${runScript} %*
) else (
    REM Use venv's python (should be in PATH after activation)
    python ${runScript} %*
)

if errorlevel 1 (
    echo.
    echo [ERROR] Application failed!
    pause
    exit /b 1
)

pause
`;
      fs.writeFileSync(path.join(projectPath, 'run.bat'), runBat, 'utf-8');
      createdBats.push('run.bat');
    }

    return createdBats;
  }
}

export default TemplateEngine;
