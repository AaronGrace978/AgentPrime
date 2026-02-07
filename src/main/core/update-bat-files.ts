/**
 * Utility to update existing .bat files with Node.js detection code
 * Fixes projects created before the auto-detection was added
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Node.js detection code for .bat files
 */
const NODE_DETECTION_CODE = `REM ============================================================
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

/**
 * Update a .bat file to include Node.js detection
 */
function updateBatFile(batPath: string): boolean {
  try {
    let content = fs.readFileSync(batPath, 'utf-8');
    
    // Skip if already has node detection
    if (content.includes('Node.js/npm Detection')) {
      return false; // Already updated
    }
    
    // Find the npm command line
    const npmCommandMatch = content.match(/call\s+npm\s+run\s+(\w+)/);
    if (!npmCommandMatch) {
      return false; // Not an npm script .bat file
    }
    
    const scriptName = npmCommandMatch[1];
    
    // Find where to insert (after cd /d "%~dp0")
    const cdMatch = content.match(/(cd\s+\/d\s+"%~dp0"\s*\r?\n)/);
    if (!cdMatch) {
      return false; // Unexpected format
    }
    
    // Replace npm command with detected version
    const oldNpmLine = `call npm run ${scriptName}`;
    const newNpmSection = `\n${NODE_DETECTION_CODE}\n\nREM Use detected npm or fallback to npm in PATH\nif defined NPM_EXE (\n    call "%NPM_EXE%" run ${scriptName}\n) else (\n    call npm run ${scriptName}\n)`;
    
    content = content.replace(oldNpmLine, newNpmSection);
    
    fs.writeFileSync(batPath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error(`Failed to update ${batPath}:`, error);
    return false;
  }
}

/**
 * Update all .bat files in a project directory
 */
export function updateProjectBatFiles(projectPath: string): { updated: number; total: number } {
  let updated = 0;
  let total = 0;
  
  try {
    const files = fs.readdirSync(projectPath);
    
    for (const file of files) {
      if (file.endsWith('.bat')) {
        total++;
        const batPath = path.join(projectPath, file);
        if (updateBatFile(batPath)) {
          updated++;
          console.log(`[UpdateBatFiles] ✅ Updated: ${file}`);
        }
      }
    }
  } catch (error) {
    console.error('[UpdateBatFiles] Error:', error);
  }
  
  return { updated, total };
}

