/**
 * Framework Knowledge Module
 * 
 * Contains up-to-date knowledge about modern frameworks and their correct configurations.
 * This knowledge is injected into AI prompts to prevent generating outdated/broken code.
 * 
 * Last Updated: January 2026
 */

export interface FrameworkKnowledge {
  name: string;
  version: string;
  keywords: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  configPatterns: string;
  commonMistakes: string[];
  criticalNotes: string;
}

/**
 * Tauri v2 Framework Knowledge
 * CRITICAL: Tauri v2 has completely different config format from v1
 */
export const TAURI_V2_KNOWLEDGE: FrameworkKnowledge = {
  name: 'Tauri',
  version: '2.0.x',
  keywords: ['tauri', 'rust', 'desktop', 'native'],
  dependencies: {
    '@tauri-apps/api': '^2.0.0',
    '@tauri-apps/plugin-shell': '^2.0.0',
    'react': '^18.3.1',
    'react-dom': '^18.3.1'
  },
  devDependencies: {
    '@tauri-apps/cli': '^2.0.0',
    '@types/react': '^18.3.8',
    '@types/react-dom': '^18.3.0',
    '@vitejs/plugin-react': '^4.3.1',
    'typescript': '^5.6.2',
    'vite': '^5.4.6'
  },
  configPatterns: `
## TAURI V2 CONFIGURATION (tauri.conf.json)

CORRECT v2 format (DO NOT add any other properties to build section):
{
  "$schema": "../node_modules/@tauri-apps/cli/schema.json",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  
FORBIDDEN PROPERTIES (will cause schema validation errors):
- "withGlobalTauri" - DOES NOT EXIST in v2, never include it
- "tauri" object - v2 uses flat structure, not nested
- "allowlist" - v2 uses capabilities system
- "devPath" - use "devUrl" instead
- "distDir" - use "frontendDist" instead
  "bundle": {
    "active": true,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico", "icons/icon.icns"],
    "identifier": "com.example.app",
    "targets": "all"
  },
  "identifier": "com.example.app",
  "productName": "MyApp",
  "security": {
    "csp": "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https: wss: ws:; object-src 'none';"
  },
  "version": "1.0.0"
}

## CARGO.TOML (Rust dependencies) - TAURI V2 CORRECT FORMAT

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-shell = "2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

IMPORTANT: Do NOT use these deprecated features:
- "shell-open" - DOES NOT EXIST in v2, use tauri-plugin-shell crate instead
- "protocol-asset" - DOES NOT EXIST in v2
- "api-all" - DEPRECATED

## RUST MAIN.RS / LIB.RS

// Must initialize plugins!
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![...])
    .run(tauri::generate_context!())
    .expect("error while running application");
`,
  commonMistakes: [
    'Using "devPath" instead of "devUrl" (v1 vs v2)',
    'Using "distDir" instead of "frontendDist" (v1 vs v2)',
    'Using "withGlobalTauri" in build config - NOT VALID in v2, causes schema error',
    'Using nested "tauri" object - v2 uses flat structure (app, bundle, etc.)',
    'Using "allowlist" - v2 uses capabilities system instead',
    'Using features = ["api-all"] - DEPRECATED, removed in v2',
    'Using features = ["shell-open"] - REMOVED in v2, use tauri-plugin-shell crate',
    'Using features = ["protocol-asset"] - REMOVED in v2',
    'Missing tauri_plugin_shell::init() in Rust code',
    'Using "csp": null - always configure proper CSP',
    'Missing beforeDevCommand/beforeBuildCommand',
    'Using .tsxx instead of .tsx in index.html script src',
    'Using sysinfo::SystemExt - REMOVED in sysinfo 0.30+, just use System',
    'Creating text placeholder files as icons - icons must be binary images',
    'Using version = "2.0.0" instead of version = "2" (less compatible)',
    'Mixing Tauri v1 and v2 deps (tauri="1.5" with tauri-plugin-shell="2")',
    'Using "package.productName" - v2 uses "productName" at root level',
    'Setting devUrl to file path instead of http://localhost:1420',
    'Using get_window() in Rust - v2 uses get_webview_window()',
    'Using wrong Vite port (must be 1420 to match Tauri devUrl)'
  ],
  criticalNotes: `
TAURI V2 CRITICAL NOTES:
1. Tauri v2 config format is COMPLETELY DIFFERENT from v1
2. NEVER use deprecated features: "api-all", "shell-open", "protocol-asset"
3. NEVER include "withGlobalTauri" in build config - causes schema validation error
4. NEVER use nested "tauri" object - v2 uses flat structure
5. NEVER use "allowlist" - v2 uses capabilities system
6. ALWAYS initialize plugins in Rust: .plugin(tauri_plugin_shell::init())
7. ALWAYS configure CSP security - never use null
8. Use "devUrl" NOT "devPath", "frontendDist" NOT "distDir"
9. Add @tauri-apps/plugin-shell and tauri-plugin-shell = "2" to dependencies
10. In Rust: DO NOT use sysinfo::SystemExt (removed in 0.30+)
11. In index.html: Use .tsx NOT .tsxx for script src
12. Icons: DO NOT create text placeholder files - leave empty or use real binary icons
`
};

/**
 * React 18 Framework Knowledge
 */
export const REACT_18_KNOWLEDGE: FrameworkKnowledge = {
  name: 'React',
  version: '18.3.x',
  keywords: ['react', 'frontend', 'ui', 'component'],
  dependencies: {
    'react': '^18.3.1',
    'react-dom': '^18.3.1'
  },
  devDependencies: {
    '@types/react': '^18.3.8',
    '@types/react-dom': '^18.3.0',
    '@vitejs/plugin-react': '^4.3.1',
    'typescript': '^5.6.2',
    'vite': '^5.4.6'
  },
  configPatterns: `
## REACT 18 BEST PRACTICES

1. Use functional components with hooks
2. Use TypeScript for type safety
3. Use Vite for fast development
4. Proper file extensions: .tsx for React components
5. Entry point: createRoot(document.getElementById('root')!).render(...)
`,
  commonMistakes: [
    'Using ReactDOM.render() instead of createRoot() (React 18+)',
    'Missing StrictMode wrapper',
    'Wrong file extension (.ts instead of .tsx for components)',
    'Outdated dependency versions'
  ],
  criticalNotes: `
REACT 18 NOTES:
1. Use createRoot() not ReactDOM.render()
2. File extensions: .tsx for JSX, .ts for pure TypeScript
3. Always wrap app in StrictMode for development
`
};

/**
 * Electron Framework Knowledge
 */
export const ELECTRON_KNOWLEDGE: FrameworkKnowledge = {
  name: 'Electron',
  version: '28.x',
  keywords: ['electron', 'desktop', 'node'],
  dependencies: {
    'react': '^18.3.1',
    'react-dom': '^18.3.1'
  },
  devDependencies: {
    'electron': '^28.0.0',
    'electron-builder': '^26.0.12',
    '@types/react': '^18.3.8',
    '@types/react-dom': '^18.3.0',
    'typescript': '^5.6.2',
    'webpack': '^5.104.0',
    'webpack-cli': '^6.0.1'
  },
  configPatterns: `
## ELECTRON SECURITY

1. Enable contextIsolation: true
2. Enable sandbox: true  
3. Disable nodeIntegration: false
4. Use preload scripts for IPC
5. Never expose Node.js APIs directly to renderer
`,
  commonMistakes: [
    'nodeIntegration: true (security risk)',
    'contextIsolation: false (security risk)',
    'Missing preload script',
    'Exposing sensitive APIs to renderer'
  ],
  criticalNotes: `
ELECTRON SECURITY IS CRITICAL:
1. NEVER use nodeIntegration: true
2. ALWAYS use contextIsolation: true
3. ALWAYS use preload scripts
4. Validate all IPC messages
`
};

/**
 * Vite Framework Knowledge
 */
export const VITE_KNOWLEDGE: FrameworkKnowledge = {
  name: 'Vite',
  version: '5.4.x',
  keywords: ['vite', 'build', 'bundler'],
  dependencies: {},
  devDependencies: {
    'vite': '^5.4.6',
    '@vitejs/plugin-react': '^4.3.1',
    'typescript': '^5.6.2'
  },
  configPatterns: `
## VITE CONFIG (vite.config.ts)

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
`,
  commonMistakes: [
    'Wrong port configuration for Tauri (should be 1420)',
    'Missing React plugin',
    'Incorrect outDir path'
  ],
  criticalNotes: `
VITE NOTES:
1. For Tauri projects, use port 1420
2. Always include the React plugin for React projects
3. Use strictPort: true for Tauri
`
};

/**
 * All framework knowledge combined
 */
export const ALL_FRAMEWORKS: FrameworkKnowledge[] = [
  TAURI_V2_KNOWLEDGE,
  REACT_18_KNOWLEDGE,
  ELECTRON_KNOWLEDGE,
  VITE_KNOWLEDGE
];

/**
 * Detect frameworks from user prompt
 */
export function detectFrameworksFromPrompt(prompt: string): FrameworkKnowledge[] {
  const lowerPrompt = prompt.toLowerCase();
  const detected: FrameworkKnowledge[] = [];

  for (const framework of ALL_FRAMEWORKS) {
    for (const keyword of framework.keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        if (!detected.includes(framework)) {
          detected.push(framework);
        }
        break;
      }
    }
  }

  return detected;
}

/**
 * Generate framework knowledge section for AI prompts
 */
export function generateFrameworkPrompt(frameworks: FrameworkKnowledge[]): string {
  if (frameworks.length === 0) {
    return '';
  }

  let prompt = '\n\n## FRAMEWORK-SPECIFIC REQUIREMENTS (CRITICAL - FOLLOW EXACTLY)\n\n';

  for (const framework of frameworks) {
    prompt += `### ${framework.name} ${framework.version}\n\n`;
    
    // Dependencies
    prompt += '**Required Dependencies (package.json):**\n```json\n';
    prompt += '"dependencies": {\n';
    for (const [pkg, version] of Object.entries(framework.dependencies)) {
      prompt += `  "${pkg}": "${version}",\n`;
    }
    prompt += '},\n"devDependencies": {\n';
    for (const [pkg, version] of Object.entries(framework.devDependencies)) {
      prompt += `  "${pkg}": "${version}",\n`;
    }
    prompt += '}\n```\n\n';

    // Config patterns
    prompt += framework.configPatterns + '\n\n';

    // Common mistakes to avoid
    prompt += '**AVOID THESE MISTAKES:**\n';
    for (const mistake of framework.commonMistakes) {
      prompt += `- ❌ ${mistake}\n`;
    }
    prompt += '\n';

    // Critical notes
    prompt += framework.criticalNotes + '\n\n';
  }

  return prompt;
}

/**
 * Get complete framework knowledge for a prompt
 */
export function getFrameworkKnowledge(prompt: string): string {
  const frameworks = detectFrameworksFromPrompt(prompt);
  return generateFrameworkPrompt(frameworks);
}

/**
 * Validate a project against framework knowledge
 */
export function validateAgainstFramework(
  framework: FrameworkKnowledge,
  packageJson: any,
  configFiles: Record<string, any>
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check dependencies
  for (const [pkg, expectedVersion] of Object.entries(framework.dependencies)) {
    const actualVersion = packageJson.dependencies?.[pkg];
    if (!actualVersion) {
      issues.push(`Missing dependency: ${pkg}`);
    }
  }

  // Check devDependencies
  for (const [pkg, expectedVersion] of Object.entries(framework.devDependencies)) {
    const actualVersion = packageJson.devDependencies?.[pkg];
    if (!actualVersion) {
      issues.push(`Missing devDependency: ${pkg}`);
    }
  }

  // Framework-specific validations
  if (framework.name === 'Tauri') {
    const tauriConfig = configFiles['tauri.conf.json'];
    if (tauriConfig) {
      // Check for v1 vs v2 format
      if (tauriConfig.build?.devPath) {
        issues.push('Using v1 format "devPath" - should be "devUrl" for Tauri v2');
      }
      if (tauriConfig.build?.distDir) {
        issues.push('Using v1 format "distDir" - should be "frontendDist" for Tauri v2');
      }
      if (tauriConfig.tauri?.security?.csp === null || tauriConfig.security?.csp === null) {
        issues.push('CSP is null - should configure proper Content Security Policy');
      }
    }

    const cargoToml = configFiles['Cargo.toml'];
    if (cargoToml && typeof cargoToml === 'string') {
      if (cargoToml.includes('api-all')) {
        issues.push('Using deprecated "api-all" feature - use specific features instead');
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export default {
  TAURI_V2_KNOWLEDGE,
  REACT_18_KNOWLEDGE,
  ELECTRON_KNOWLEDGE,
  VITE_KNOWLEDGE,
  ALL_FRAMEWORKS,
  detectFrameworksFromPrompt,
  generateFrameworkPrompt,
  getFrameworkKnowledge,
  validateAgainstFramework
};

