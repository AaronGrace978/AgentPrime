/**
 * Project Completeness Validator
 * 
 * Validates that a project is actually complete before allowing the agent
 * to mark it as done. This prevents skeleton/incomplete projects!
 * 
 * 🦖 No more "I'm done!" when the project can't even run!
 */

import * as fs from 'fs';
import * as path from 'path';
import { PROJECT_PATTERNS, ProjectPattern } from '../tools/projectPatterns';

export interface CompletenessValidation {
  complete: boolean;
  score: number; // 0-100 completeness score
  missingFiles: string[];
  brokenReferences: FileReference[];
  emptyFiles: string[];
  missingDependencies: string[];
  issues: string[];
  suggestions: string[];
}

export interface FileReference {
  sourceFile: string;
  reference: string;
  type: 'script' | 'stylesheet' | 'image' | 'other';
}

export interface ComplexValidationResult {
  passes: boolean;
  issues: string[];
  suggestions: string[];
}

/**
 * Detect if this is a complex project with advanced features
 */
function detectComplexFeatures(allFiles: string[]): boolean {
  const fileContents = allFiles.map(file => {
    try {
      return fs.readFileSync(file, 'utf-8').toLowerCase();
    } catch {
      return '';
    }
  }).join(' ');

  const complexIndicators = [
    'three\.js', 'three', 'webgl', 'particle',
    'audio', 'microphone', 'analyser', 'frequency',
    'webaudio', 'getusermedia', 'audiocontext',
    'post-processing', 'bloom', 'effectcomposer',
    'reactive', 'real-time', 'visualization'
  ];

  return complexIndicators.some(indicator => fileContents.includes(indicator));
}

/**
 * Validate complex web app features (Three.js, Web Audio, etc.)
 */
function validateComplexWebApp(allFiles: string[], workspacePath: string): ComplexValidationResult {
  const result: ComplexValidationResult = {
    passes: true,
    issues: [],
    suggestions: []
  };

  // Check for Three.js integration
  const hasThreeJS = allFiles.some(file => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('from \'three\'') ||
             content.includes('import * as THREE') ||
             content.includes('new THREE.');
    } catch {
      return false;
    }
  });

  if (!hasThreeJS) {
    result.issues.push('Missing Three.js integration - no THREE imports or instantiations found');
    result.passes = false;
  }

  // Check for Web Audio API usage
  const hasWebAudio = allFiles.some(file => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('getUserMedia') ||
             content.includes('AudioContext') ||
             content.includes('AnalyserNode') ||
             content.includes('createMediaStreamSource');
    } catch {
      return false;
    }
  });

  if (!hasWebAudio) {
    result.issues.push('Missing Web Audio API integration - no audio context or microphone access found');
    result.passes = false;
  }

  // Check for Vue 3 Composition API usage
  const hasVue3Composition = allFiles.some(file => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('<script setup') ||
             content.includes('import { ref, onMounted') ||
             content.includes('defineProps') ||
             content.includes('defineEmits');
    } catch {
      return false;
    }
  });

  if (!hasVue3Composition) {
    result.issues.push('Missing Vue 3 Composition API usage - no reactive refs or composition functions found');
    result.passes = false;
  }

  // Check for particle system implementation
  const hasParticles = allFiles.some(file => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('Points') ||
             content.includes('BufferGeometry') ||
             content.includes('PointsMaterial') ||
             content.includes('particle');
    } catch {
      return false;
    }
  });

  if (!hasParticles) {
    result.issues.push('Missing particle system implementation - no Three.js particle geometry or materials found');
    result.passes = false;
  }

  // Check for proper error handling
  const hasErrorHandling = allFiles.some(file => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('try {') ||
             content.includes('catch') ||
             content.includes('console.error') ||
             content.includes('console.warn');
    } catch {
      return false;
    }
  });

  if (!hasErrorHandling) {
    result.suggestions.push('Add proper error handling for Web Audio permissions and Three.js failures');
  }

  // Check for performance optimizations
  const hasPerformanceOptimizations = allFiles.some(file => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      return content.includes('requestAnimationFrame') ||
             content.includes('dispose') ||
             content.includes('onUnmounted') ||
             content.includes('onBeforeUnmount');
    } catch {
      return false;
    }
  });

  if (!hasPerformanceOptimizations) {
    result.suggestions.push('Add performance optimizations: requestAnimationFrame, proper cleanup, memory management');
  }

  // Check for multiple components
  const vueFiles = allFiles.filter(f => f.endsWith('.vue'));
  if (vueFiles.length < 3) {
    result.suggestions.push('Consider breaking down into multiple Vue components for better organization');
  }

  return result;
}

/**
 * Extract file references from HTML content
 */
function extractHtmlReferences(content: string, filePath: string): FileReference[] {
  const refs: FileReference[] = [];
  
  // Script sources
  const scriptMatches = content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
  for (const match of scriptMatches) {
    const ref = match[1];
    if (!ref.startsWith('http') && !ref.startsWith('//') && !ref.startsWith('data:')) {
      refs.push({ sourceFile: filePath, reference: ref, type: 'script' });
    }
  }
  
  // Stylesheet links
  const linkMatches = content.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi);
  for (const match of linkMatches) {
    const ref = match[1];
    if (!ref.startsWith('http') && !ref.startsWith('//')) {
      refs.push({ sourceFile: filePath, reference: ref, type: 'stylesheet' });
    }
  }
  
  // Image sources
  const imgMatches = content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imgMatches) {
    const ref = match[1];
    if (!ref.startsWith('http') && !ref.startsWith('//') && !ref.startsWith('data:')) {
      refs.push({ sourceFile: filePath, reference: ref, type: 'image' });
    }
  }
  
  return refs;
}

/**
 * Check if a file is effectively empty (just comments or whitespace)
 */
function isFileEffectivelyEmpty(content: string, filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  
  // Remove comments based on file type
  let codeContent = content;
  
  if (['.js', '.ts', '.jsx', '.tsx', '.css', '.java', '.go', '.rs'].includes(ext)) {
    // Remove single-line comments
    codeContent = codeContent.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    codeContent = codeContent.replace(/\/\*[\s\S]*?\*\//g, '');
  } else if (['.py', '.sh', '.bash', '.yml', '.yaml'].includes(ext)) {
    // Remove Python/shell comments
    codeContent = codeContent.replace(/#.*$/gm, '');
    // Remove docstrings
    codeContent = codeContent.replace(/"""[\s\S]*?"""/g, '');
    codeContent = codeContent.replace(/'''[\s\S]*?'''/g, '');
  } else if (['.html', '.xml'].includes(ext)) {
    // Remove HTML comments
    codeContent = codeContent.replace(/<!--[\s\S]*?-->/g, '');
  }
  
  // Remove whitespace and check if anything meaningful remains
  const meaningfulContent = codeContent.replace(/\s+/g, '').trim();
  
  // Less than 20 chars of actual code = effectively empty
  return meaningfulContent.length < 20;
}

/**
 * Validate CSS for common overlay/modal patterns that break click handling
 * This catches the pointer-events inheritance bug
 */
function validateCssOverlayPatterns(content: string, filePath: string): string[] {
  const issues: string[] = [];
  
  // Check for pointer-events inheritance issues
  const hasPointerEventsNone = /pointer-events\s*:\s*none/i.test(content);
  const hasPointerEventsAll = /pointer-events\s*:\s*all/i.test(content);
  
  if (hasPointerEventsNone && hasPointerEventsAll) {
    // Check if pointer-events:all is on buttons or interactive elements
    // This is a common bug where buttons inside hidden overlays still intercept clicks
    const buttonWithPointerAll = /\.(button|btn|glow-button)[^{]*\{[^}]*pointer-events\s*:\s*all/i.test(content) ||
                                  /button[^{]*\{[^}]*pointer-events\s*:\s*all/i.test(content);
    
    if (buttonWithPointerAll) {
      issues.push('CSS BUG: buttons have pointer-events:all which overrides parent\'s pointer-events:none - hidden buttons will intercept clicks!');
    }
  }
  
  // Check for opacity:0 without pointer-events:none (hidden elements can still be clicked)
  const hasOpacityZero = /opacity\s*:\s*0[^.0-9]/i.test(content);
  if (hasOpacityZero && !hasPointerEventsNone) {
    issues.push('CSS: opacity:0 used without pointer-events:none - invisible elements may still intercept clicks');
  }
  
  // Check for multiple overlays with same z-index
  const zIndexMatches = content.match(/z-index\s*:\s*(\d+)/gi) || [];
  if (zIndexMatches.length > 3) {
    const zValues = zIndexMatches.map(m => parseInt(m.match(/\d+/)?.[0] || '0'));
    const counts = new Map<number, number>();
    for (const z of zValues) {
      counts.set(z, (counts.get(z) || 0) + 1);
    }
    for (const [z, count] of counts) {
      if (count >= 3 && z > 1) {
        issues.push(`CSS: ${count} elements share z-index:${z} - may cause stacking order issues`);
      }
    }
  }
  
  return issues;
}

/**
 * Detect incomplete/truncated code patterns
 */
function detectIncompleteCode(content: string, filePath: string): string[] {
  const issues: string[] = [];
  const ext = path.extname(filePath).toLowerCase();
  
  // JavaScript/TypeScript patterns
  if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    // Incomplete arrow functions: () => )
    if (/\([^)]*\)\s*=>\s*[);,]/.test(content)) {
      issues.push('Incomplete arrow functions detected (empty bodies)');
    }
    
    // Empty function bodies: function() {} or function name() {}
    const emptyFuncs = (content.match(/(?:function\s*\w*\s*\([^)]*\)|=>\s*)\s*\{\s*\}/g) || []).length;
    if (emptyFuncs > 2) {
      issues.push(`${emptyFuncs} empty function bodies detected`);
    }
    
    // TODO/FIXME comments
    if (/\/\/\s*TODO|\/\/\s*FIXME|\/\*\s*TODO/.test(content)) {
      issues.push('Contains TODO/FIXME comments - code is incomplete');
    }
    
    // Placeholder text
    if (/placeholder|implement|your code here|add your/i.test(content)) {
      issues.push('Contains placeholder text');
    }
    
    // Unclosed braces (simple check)
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
    }
  }
  
  // Python patterns
  if (ext === '.py') {
    // pass statements (often placeholder)
    const passCount = (content.match(/^\s*pass\s*$/gm) || []).length;
    if (passCount > 2) {
      issues.push(`${passCount} 'pass' statements - likely incomplete implementation`);
    }
    
    // Ellipsis placeholders
    if (/^\s*\.\.\.\s*$/m.test(content)) {
      issues.push('Contains ... placeholder');
    }
    
    // TODO/FIXME
    if (/#\s*TODO|#\s*FIXME/.test(content)) {
      issues.push('Contains TODO/FIXME comments');
    }
  }
  
  // HTML patterns
  if (ext === '.html') {
    // Empty body
    if (/<body[^>]*>\s*<\/body>/i.test(content)) {
      issues.push('Empty body element');
    }
    
    // Missing title content
    if (/<title>\s*<\/title>/i.test(content)) {
      issues.push('Empty title element');
    }
  }
  
  return issues;
}

/**
 * Parse package.json and check for dependencies
 */
function checkPackageJson(workspacePath: string, expectedDeps: Record<string, string>): {
  exists: boolean;
  missing: string[];
  isGeneric: boolean;
} {
  const pkgPath = path.join(workspacePath, 'package.json');
  
  if (!fs.existsSync(pkgPath)) {
    return { exists: false, missing: Object.keys(expectedDeps), isGeneric: false };
  }
  
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const missing: string[] = [];
    
    for (const dep of Object.keys(expectedDeps)) {
      if (!allDeps[dep]) {
        missing.push(dep);
      }
    }
    
    // Check if it's a generic/placeholder package.json
    const isGeneric = pkg.name === 'project' || 
                      pkg.name === 'my-project' ||
                      pkg.description === 'Generated project' ||
                      (Object.keys(pkg.dependencies || {}).length === 0 && 
                       Object.keys(pkg.devDependencies || {}).length === 0);
    
    return { exists: true, missing, isGeneric };
  } catch (e) {
    return { exists: true, missing: Object.keys(expectedDeps), isGeneric: true };
  }
}

/**
 * Recursively find all files in a directory
 */
function getAllFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (!['node_modules', '.git', '__pycache__', 'venv', '.venv', 'dist', 'build'].includes(file)) {
          getAllFiles(filePath, fileList);
        }
      } else {
        fileList.push(filePath);
      }
    } catch (e) {
      // Skip files we can't read
    }
  }
  return fileList;
}

/**
 * Main validation function
 * 
 * Validates a project is complete before allowing "done" status
 */
export async function validateProjectCompleteness(
  workspacePath: string,
  projectType: string | null
): Promise<CompletenessValidation> {
  const result: CompletenessValidation = {
    complete: true,
    score: 100,
    missingFiles: [],
    brokenReferences: [],
    emptyFiles: [],
    missingDependencies: [],
    issues: [],
    suggestions: []
  };
  
  // Get the pattern for this project type
  const pattern = projectType ? PROJECT_PATTERNS[projectType] : null;
  
  // Get all files in the workspace
  const allFiles = getAllFiles(workspacePath);
  const relativeFiles = allFiles.map(f => path.relative(workspacePath, f).replace(/\\/g, '/'));
  
  // Check 1: Required files exist
  if (pattern) {
    for (const reqFile of pattern.structure.requiredFiles) {
      const exists = relativeFiles.some(f => 
        f === reqFile || f.endsWith(`/${reqFile}`)
      );
      if (!exists) {
        result.missingFiles.push(reqFile);
        result.complete = false;
        result.score -= 15;
      }
    }
  }
  
  // Check 1.5: Complex project feature validation
  if (projectType === 'complex_web_app' || detectComplexFeatures(allFiles)) {
    const complexValidation = validateComplexWebApp(allFiles, workspacePath);
    result.issues.push(...complexValidation.issues);
    result.suggestions.push(...complexValidation.suggestions);
    if (!complexValidation.passes) {
      result.complete = false;
      result.score -= 20;
    }
  }

  // Check 2: Find broken file references in HTML files
  for (const file of allFiles) {
    if (file.endsWith('.html')) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const refs = extractHtmlReferences(content, path.relative(workspacePath, file));
        
        for (const ref of refs) {
          // Resolve the reference relative to the HTML file
          const refDir = path.dirname(path.join(workspacePath, ref.sourceFile));
          const refPath = path.resolve(refDir, ref.reference);
          
          if (!fs.existsSync(refPath)) {
            result.brokenReferences.push(ref);
            result.complete = false;
            result.score -= 10;
          }
        }
      } catch (e) {
        // Skip files we can't read
      }
    }
  }
  
  // Check 3: Empty/placeholder files
  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(workspacePath, file);
      
      // Skip certain files that are allowed to be small
      if (relPath.includes('.gitignore') || relPath.includes('.env')) continue;
      
      if (isFileEffectivelyEmpty(content, file)) {
        result.emptyFiles.push(relPath);
        result.complete = false;
        result.score -= 10;
      }
      
      // Check for incomplete code
      const incompleteIssues = detectIncompleteCode(content, file);
      for (const issue of incompleteIssues) {
        result.issues.push(`${relPath}: ${issue}`);
        result.score -= 5;
      }
      
      // Check CSS files for overlay/modal pattern issues
      if (file.endsWith('.css') || file.endsWith('.scss') || file.endsWith('.less')) {
        const cssIssues = validateCssOverlayPatterns(content, file);
        for (const issue of cssIssues) {
          result.issues.push(`${relPath}: ${issue}`);
          // CSS bugs that break click handling are critical
          if (issue.includes('BUG')) {
            result.score -= 15;
          } else {
            result.score -= 5;
          }
        }
      }
    } catch (e) {
      // Skip binary files or unreadable files
    }
  }
  
  // Check 4: Package.json dependencies (for Node projects)
  if (pattern && Object.keys(pattern.structure.dependencies || {}).length > 0) {
    const pkgCheck = checkPackageJson(workspacePath, pattern.structure.dependencies);
    
    if (!pkgCheck.exists) {
      result.missingFiles.push('package.json');
      result.complete = false;
      result.score -= 20;
    } else {
      if (pkgCheck.isGeneric) {
        result.issues.push('package.json appears to be a generic placeholder');
        result.score -= 10;
      }
      if (pkgCheck.missing.length > 0) {
        result.missingDependencies = pkgCheck.missing;
        result.issues.push(`Missing dependencies: ${pkgCheck.missing.join(', ')}`);
        result.score -= 5 * pkgCheck.missing.length;
      }
    }
  }
  
  // Clamp score
  result.score = Math.max(0, Math.min(100, result.score));
  
  // Generate suggestions based on issues
  if (result.missingFiles.length > 0) {
    result.suggestions.push(`Create missing files: ${result.missingFiles.join(', ')}`);
  }
  if (result.brokenReferences.length > 0) {
    const refFiles = [...new Set(result.brokenReferences.map(r => r.reference))];
    result.suggestions.push(`Create referenced files: ${refFiles.join(', ')}`);
  }
  if (result.emptyFiles.length > 0) {
    result.suggestions.push(`Implement code in empty files: ${result.emptyFiles.join(', ')}`);
  }
  if (result.missingDependencies.length > 0) {
    result.suggestions.push(`Add to package.json dependencies: ${result.missingDependencies.join(', ')}`);
  }
  
  // Final determination
  result.complete = result.score >= 70 && 
                    result.missingFiles.length === 0 && 
                    result.brokenReferences.length === 0;
  
  return result;
}

/**
 * Format validation result for agent feedback
 */
export function formatValidationFeedback(validation: CompletenessValidation): string {
  if (validation.complete) {
    return `✅ Project validation passed (score: ${validation.score}/100)`;
  }
  
  let feedback = `❌ PROJECT INCOMPLETE - Cannot mark as done yet!\n\n`;
  feedback += `Completeness Score: ${validation.score}/100\n\n`;
  
  if (validation.missingFiles.length > 0) {
    feedback += `📁 Missing Required Files:\n`;
    for (const file of validation.missingFiles) {
      feedback += `   • ${file}\n`;
    }
    feedback += '\n';
  }
  
  if (validation.brokenReferences.length > 0) {
    feedback += `🔗 Broken File References:\n`;
    for (const ref of validation.brokenReferences) {
      feedback += `   • ${ref.sourceFile} → ${ref.reference} (${ref.type} NOT FOUND)\n`;
    }
    feedback += '\n';
  }
  
  if (validation.emptyFiles.length > 0) {
    feedback += `📝 Empty/Placeholder Files:\n`;
    for (const file of validation.emptyFiles) {
      feedback += `   • ${file}\n`;
    }
    feedback += '\n';
  }
  
  if (validation.issues.length > 0) {
    feedback += `⚠️ Code Quality Issues:\n`;
    for (const issue of validation.issues) {
      feedback += `   • ${issue}\n`;
    }
    feedback += '\n';
  }
  
  if (validation.suggestions.length > 0) {
    feedback += `💡 Suggestions:\n`;
    for (const suggestion of validation.suggestions) {
      feedback += `   • ${suggestion}\n`;
    }
  }
  
  feedback += '\n🛑 Please fix these issues before marking the task as complete.';
  
  return feedback;
}

export default {
  validateProjectCompleteness,
  formatValidationFeedback
};

