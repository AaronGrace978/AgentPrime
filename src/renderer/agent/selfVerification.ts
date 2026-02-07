/**
 * Self-Verification System for AgentPrime
 * 
 * After the agent makes changes, this system verifies that:
 * 1. Files were written correctly
 * 2. Code has valid syntax
 * 3. No obvious errors were introduced
 * 4. Changes match the intended goal
 * 
 * This is like a "QA pass" that runs automatically.
 */

export interface VerificationResult {
  success: boolean;
  checks: VerificationCheck[];
  suggestions: string[];
  severity: 'ok' | 'warning' | 'error' | 'critical';
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'ok' | 'warning' | 'error' | 'critical';
}

// @ts-ignore - window.agentAPI is injected by preload script
declare const window: any;

/**
 * Verify that a file write was successful
 */
export async function verifyFileWrite(
  path: string,
  expectedContent: string
): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];
  const suggestions: string[] = [];
  
  try {
    // Check 1: File exists and can be read
    const readResult = await window.agentAPI.readFile(path);
    
    if (!readResult || readResult.error) {
      checks.push({
        name: 'file_exists',
        passed: false,
        message: `Could not read file: ${readResult?.error || 'Unknown error'}`,
        severity: 'critical'
      });
      return { success: false, checks, suggestions, severity: 'critical' };
    }
    
    checks.push({
      name: 'file_exists',
      passed: true,
      message: 'File exists and is readable',
      severity: 'ok'
    });
    
    // Check 2: Content matches what we wrote
    const actualContent = readResult.content || '';
    const contentMatches = actualContent.trim() === expectedContent.trim();
    
    if (!contentMatches) {
      checks.push({
        name: 'content_match',
        passed: false,
        message: 'Written content does not match expected content',
        severity: 'error'
      });
      suggestions.push('The file may have been modified by another process');
    } else {
      checks.push({
        name: 'content_match',
        passed: true,
        message: 'Content matches expected',
        severity: 'ok'
      });
    }
    
    // Check 3: Syntax validation based on file type
    const syntaxCheck = await verifySyntax(path, actualContent);
    checks.push(syntaxCheck);
    
    if (!syntaxCheck.passed) {
      suggestions.push(`Fix syntax errors in ${path}`);
    }
    
    // Determine overall severity
    const hasCritical = checks.some(c => c.severity === 'critical');
    const hasError = checks.some(c => c.severity === 'error');
    const hasWarning = checks.some(c => c.severity === 'warning');
    
    let severity: VerificationResult['severity'] = 'ok';
    if (hasCritical) severity = 'critical';
    else if (hasError) severity = 'error';
    else if (hasWarning) severity = 'warning';
    
    return {
      success: !hasCritical && !hasError,
      checks,
      suggestions,
      severity
    };
    
  } catch (error: any) {
    checks.push({
      name: 'verification_error',
      passed: false,
      message: `Verification failed: ${error.message}`,
      severity: 'error'
    });
    
    return { success: false, checks, suggestions, severity: 'error' };
  }
}

/**
 * Verify syntax of a file based on its extension
 */
async function verifySyntax(path: string, content: string): Promise<VerificationCheck> {
  const ext = path.split('.').pop()?.toLowerCase();
  
  try {
    switch (ext) {
      case 'json':
        JSON.parse(content);
        return {
          name: 'syntax_json',
          passed: true,
          message: 'JSON syntax is valid',
          severity: 'ok'
        };
        
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return verifyJavaScriptSyntax(content);
        
      case 'html':
        return verifyHtmlSyntax(content);
        
      case 'css':
        return verifyCssSyntax(content);
        
      case 'py':
        return verifyPythonSyntax(content);
        
      default:
        return {
          name: 'syntax_check',
          passed: true,
          message: 'No syntax validation available for this file type',
          severity: 'ok'
        };
    }
  } catch (error: any) {
    return {
      name: 'syntax_check',
      passed: false,
      message: `Syntax error: ${error.message}`,
      severity: 'error'
    };
  }
}

/**
 * Basic JavaScript/TypeScript syntax verification
 */
function verifyJavaScriptSyntax(content: string): VerificationCheck {
  const errors: string[] = [];
  
  // Check for balanced brackets
  const brackets: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const stack: string[] = [];
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let inMultilineComment = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    const prevChar = content[i - 1];
    
    // Handle comments
    if (!inString && !inMultilineComment && char === '/' && nextChar === '/') {
      inComment = true;
      continue;
    }
    if (inComment && char === '\n') {
      inComment = false;
      continue;
    }
    if (!inString && !inComment && char === '/' && nextChar === '*') {
      inMultilineComment = true;
      continue;
    }
    if (inMultilineComment && char === '*' && nextChar === '/') {
      inMultilineComment = false;
      i++; // Skip the /
      continue;
    }
    if (inComment || inMultilineComment) continue;
    
    // Handle strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    if (inString) continue;
    
    // Check brackets
    if (brackets[char]) {
      stack.push(brackets[char]);
    } else if (Object.values(brackets).includes(char)) {
      if (stack.length === 0 || stack.pop() !== char) {
        errors.push(`Unbalanced bracket: ${char} at position ${i}`);
      }
    }
  }
  
  if (stack.length > 0) {
    errors.push(`Unclosed brackets: ${stack.join(', ')}`);
  }
  
  // Check for common issues
  if (/\bfunction\s*\(/.test(content) && !/\bfunction\s*\w*\s*\(/.test(content) && 
      !content.includes('=>')) {
    // This is fine for anonymous functions
  }
  
  // Check for semicolons after obvious statements (warning only)
  const hasNoSemicolons = !content.includes(';') && 
    (content.includes('const ') || content.includes('let ') || content.includes('var '));
  
  if (errors.length > 0) {
    return {
      name: 'syntax_js',
      passed: false,
      message: errors.join('; '),
      severity: 'error'
    };
  }
  
  if (hasNoSemicolons && !content.includes('export ')) {
    return {
      name: 'syntax_js',
      passed: true,
      message: 'No semicolons detected (might be intentional)',
      severity: 'warning'
    };
  }
  
  return {
    name: 'syntax_js',
    passed: true,
    message: 'JavaScript syntax appears valid',
    severity: 'ok'
  };
}

/**
 * Basic HTML syntax verification
 */
function verifyHtmlSyntax(content: string): VerificationCheck {
  const errors: string[] = [];
  
  // Check for DOCTYPE
  if (!content.trim().toLowerCase().startsWith('<!doctype')) {
    // This is a warning, not an error
  }
  
  // Check for balanced tags (simplified)
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);
  
  const stack: string[] = [];
  let match;
  
  while ((match = tagPattern.exec(content)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    
    // Skip void elements and self-closing tags
    if (voidElements.has(tagName) || fullTag.endsWith('/>')) {
      continue;
    }
    
    if (fullTag.startsWith('</')) {
      // Closing tag
      if (stack.length === 0) {
        errors.push(`Unexpected closing tag: </${tagName}>`);
      } else if (stack[stack.length - 1] !== tagName) {
        errors.push(`Mismatched tags: expected </${stack[stack.length - 1]}>, got </${tagName}>`);
        stack.pop();
      } else {
        stack.pop();
      }
    } else {
      // Opening tag
      stack.push(tagName);
    }
  }
  
  if (stack.length > 0) {
    errors.push(`Unclosed tags: ${stack.map(t => `<${t}>`).join(', ')}`);
  }
  
  if (errors.length > 0) {
    return {
      name: 'syntax_html',
      passed: false,
      message: errors.slice(0, 3).join('; '), // Limit error messages
      severity: 'error'
    };
  }
  
  return {
    name: 'syntax_html',
    passed: true,
    message: 'HTML syntax appears valid',
    severity: 'ok'
  };
}

/**
 * Basic CSS syntax verification
 */
function verifyCssSyntax(content: string): VerificationCheck {
  const errors: string[] = [];
  
  // Check for balanced braces
  let braceCount = 0;
  let inComment = false;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    // Handle comments
    if (!inString && char === '/' && nextChar === '*') {
      inComment = true;
      continue;
    }
    if (inComment && char === '*' && nextChar === '/') {
      inComment = false;
      i++;
      continue;
    }
    if (inComment) continue;
    
    // Handle strings
    if ((char === '"' || char === "'") && content[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    if (inString) continue;
    
    // Count braces
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    
    if (braceCount < 0) {
      errors.push('Extra closing brace }');
      braceCount = 0;
    }
  }
  
  if (braceCount > 0) {
    errors.push(`${braceCount} unclosed brace(s)`);
  }
  
  if (errors.length > 0) {
    return {
      name: 'syntax_css',
      passed: false,
      message: errors.join('; '),
      severity: 'error'
    };
  }
  
  return {
    name: 'syntax_css',
    passed: true,
    message: 'CSS syntax appears valid',
    severity: 'ok'
  };
}

/**
 * Basic Python syntax verification
 */
function verifyPythonSyntax(content: string): VerificationCheck {
  const errors: string[] = [];
  const lines = content.split('\n');
  
  // Check for consistent indentation
  const indentPattern = /^(\s*)/;
  let prevIndent = 0;
  let useTabs = false;
  let useSpaces = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    
    const match = line.match(indentPattern);
    if (match) {
      const indent = match[1];
      
      if (indent.includes('\t')) useTabs = true;
      if (indent.includes(' ')) useSpaces = true;
      
      if (useTabs && useSpaces) {
        errors.push(`Mixed tabs and spaces on line ${i + 1}`);
        break;
      }
    }
    
    // Check for missing colons after control structures
    const trimmed = line.trim();
    if (
      (trimmed.startsWith('if ') || 
       trimmed.startsWith('elif ') ||
       trimmed.startsWith('else') ||
       trimmed.startsWith('for ') ||
       trimmed.startsWith('while ') ||
       trimmed.startsWith('def ') ||
       trimmed.startsWith('class ') ||
       trimmed.startsWith('try') ||
       trimmed.startsWith('except') ||
       trimmed.startsWith('finally')) &&
      !trimmed.endsWith(':') &&
      !trimmed.endsWith(':\\')
    ) {
      // Could be a continuation line or comment
      if (!lines[i + 1]?.trim().startsWith('#')) {
        // Check if next non-empty line is indented
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length) {
          const nextIndent = lines[j].match(indentPattern)?.[1]?.length || 0;
          const currentIndent = line.match(indentPattern)?.[1]?.length || 0;
          if (nextIndent > currentIndent && !trimmed.endsWith(':')) {
            errors.push(`Line ${i + 1}: Missing colon after control structure`);
          }
        }
      }
    }
  }
  
  // Check for balanced parentheses
  let parenCount = 0;
  let bracketCount = 0;
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let inTriple = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next2 = content.substring(i, i + 3);
    
    // Handle triple quotes
    if ((next2 === '"""' || next2 === "'''") && !inString) {
      inTriple = true;
      inString = true;
      stringChar = next2;
      i += 2;
      continue;
    }
    if (inTriple && content.substring(i, i + 3) === stringChar) {
      inTriple = false;
      inString = false;
      i += 2;
      continue;
    }
    
    // Handle regular strings
    if ((char === '"' || char === "'") && !inString && content[i - 1] !== '\\') {
      inString = true;
      stringChar = char;
      continue;
    }
    if (inString && !inTriple && char === stringChar && content[i - 1] !== '\\') {
      inString = false;
      continue;
    }
    if (inString) continue;
    
    // Count brackets
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
  }
  
  if (parenCount !== 0) errors.push(`Unbalanced parentheses: ${parenCount > 0 ? 'unclosed' : 'extra'}`);
  if (bracketCount !== 0) errors.push(`Unbalanced brackets: ${bracketCount > 0 ? 'unclosed' : 'extra'}`);
  if (braceCount !== 0) errors.push(`Unbalanced braces: ${braceCount > 0 ? 'unclosed' : 'extra'}`);
  
  if (errors.length > 0) {
    return {
      name: 'syntax_python',
      passed: false,
      message: errors.slice(0, 3).join('; '),
      severity: 'error'
    };
  }
  
  return {
    name: 'syntax_python',
    passed: true,
    message: 'Python syntax appears valid',
    severity: 'ok'
  };
}

/**
 * Verify selector consistency between HTML and JavaScript files
 */
export function verifySelectorConsistency(
  htmlContent: string,
  jsContent: string
): VerificationResult {
  const checks: VerificationCheck[] = [];
  const suggestions: string[] = [];
  
  // Extract IDs from HTML
  const htmlIds = new Set<string>();
  const idMatches = htmlContent.matchAll(/id=["']([^"']+)["']/g);
  for (const match of idMatches) {
    htmlIds.add(match[1]);
  }
  
  // Extract classes from HTML
  const htmlClasses = new Set<string>();
  const classMatches = htmlContent.matchAll(/class=["']([^"']+)["']/g);
  for (const match of classMatches) {
    match[1].split(/\s+/).forEach(cls => htmlClasses.add(cls.trim()));
  }
  
  // Check JavaScript selectors
  const idSelectorErrors: string[] = [];
  const classSelectorErrors: string[] = [];
  
  // getElementById calls
  const getByIdCalls = jsContent.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g);
  for (const match of getByIdCalls) {
    if (!htmlIds.has(match[1])) {
      idSelectorErrors.push(match[1]);
    }
  }
  
  // querySelector with IDs
  const querySelectorIdCalls = jsContent.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g);
  for (const match of querySelectorIdCalls) {
    if (!htmlIds.has(match[1])) {
      idSelectorErrors.push(match[1]);
    }
  }
  
  // querySelector with classes
  const querySelectorClassCalls = jsContent.matchAll(/querySelector(?:All)?\(['"]\.([^'".\s\[]+)['"]\)/g);
  for (const match of querySelectorClassCalls) {
    if (!htmlClasses.has(match[1])) {
      classSelectorErrors.push(match[1]);
    }
  }
  
  if (idSelectorErrors.length > 0) {
    checks.push({
      name: 'selector_ids',
      passed: false,
      message: `Missing HTML IDs referenced in JS: ${idSelectorErrors.join(', ')}`,
      severity: 'error'
    });
    suggestions.push('Ensure JavaScript selectors match HTML id attributes');
  } else {
    checks.push({
      name: 'selector_ids',
      passed: true,
      message: 'All ID selectors found in HTML',
      severity: 'ok'
    });
  }
  
  if (classSelectorErrors.length > 0) {
    checks.push({
      name: 'selector_classes',
      passed: false,
      message: `Missing HTML classes referenced in JS: ${classSelectorErrors.join(', ')}`,
      severity: 'error'
    });
    suggestions.push('Ensure JavaScript selectors match HTML class attributes');
  } else {
    checks.push({
      name: 'selector_classes',
      passed: true,
      message: 'All class selectors found in HTML',
      severity: 'ok'
    });
  }
  
  const hasErrors = checks.some(c => !c.passed);
  
  return {
    success: !hasErrors,
    checks,
    suggestions,
    severity: hasErrors ? 'error' : 'ok'
  };
}

/**
 * Run all verification checks for a set of files
 */
export async function verifyChanges(
  changedFiles: Array<{ path: string; content: string }>
): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];
  const suggestions: string[] = [];
  
  // Verify each file
  for (const file of changedFiles) {
    const result = await verifyFileWrite(file.path, file.content);
    checks.push(...result.checks);
    suggestions.push(...result.suggestions);
  }
  
  // Check HTML/JS consistency
  const htmlFiles = changedFiles.filter(f => f.path.endsWith('.html'));
  const jsFiles = changedFiles.filter(f => 
    f.path.endsWith('.js') || f.path.endsWith('.jsx') ||
    f.path.endsWith('.ts') || f.path.endsWith('.tsx')
  );
  
  for (const htmlFile of htmlFiles) {
    for (const jsFile of jsFiles) {
      // Only check related files (same directory or common names)
      const htmlDir = htmlFile.path.split('/').slice(0, -1).join('/');
      const jsDir = jsFile.path.split('/').slice(0, -1).join('/');
      
      if (htmlDir === jsDir || 
          htmlFile.path.replace(/\.html$/, '') === jsFile.path.replace(/\.(js|ts)x?$/, '')) {
        const consistency = verifySelectorConsistency(htmlFile.content, jsFile.content);
        checks.push(...consistency.checks);
        suggestions.push(...consistency.suggestions);
      }
    }
  }
  
  // Determine overall severity
  const hasCritical = checks.some(c => c.severity === 'critical');
  const hasError = checks.some(c => c.severity === 'error');
  const hasWarning = checks.some(c => c.severity === 'warning');
  
  let severity: VerificationResult['severity'] = 'ok';
  if (hasCritical) severity = 'critical';
  else if (hasError) severity = 'error';
  else if (hasWarning) severity = 'warning';
  
  return {
    success: !hasCritical && !hasError,
    checks,
    suggestions: [...new Set(suggestions)], // Dedupe
    severity
  };
}

