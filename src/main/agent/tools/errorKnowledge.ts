/**
 * Error Knowledge Base
 * Common errors and their solutions for Python, Node.js, and general development
 */

export interface ErrorPattern {
  pattern: RegExp;
  category: 'python' | 'node' | 'general' | 'encoding' | 'import' | 'syntax';
  severity: 'critical' | 'warning' | 'info';
  solution: string;
  autoFixable: boolean;
  retryable: boolean; // Can we retry after fixing?
  escalationNeeded: boolean; // Does this need a better model?
}

export const ERROR_PATTERNS: ErrorPattern[] = [
  // ============ PYTHON ERRORS ============
  {
    pattern: /UnicodeEncodeError.*charmap.*can't encode/i,
    category: 'encoding',
    severity: 'critical',
    solution: 'Use ASCII-safe characters in print statements or set PYTHONIOENCODING=utf-8. Replace emojis/special chars with ASCII equivalents.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /ModuleNotFoundError.*No module named/i,
    category: 'python',
    severity: 'critical',
    solution: 'Missing dependency. Add to requirements.txt and run: pip install -r requirements.txt',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /ImportError.*cannot import name/i,
    category: 'import',
    severity: 'critical',
    solution: 'Circular import or missing dependency. Check import order and dependencies.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /SyntaxError.*invalid syntax/i,
    category: 'syntax',
    severity: 'critical',
    solution: 'Syntax error in code. Check for missing colons, parentheses, or indentation issues.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: true // Syntax errors might need better model
  },
  {
    pattern: /IndentationError/i,
    category: 'syntax',
    severity: 'critical',
    solution: 'Python indentation error. Ensure consistent indentation (spaces or tabs, not mixed).',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /AttributeError.*has no attribute/i,
    category: 'python',
    severity: 'warning',
    solution: 'Object missing attribute. Check if object is initialized correctly or if attribute name is misspelled.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /TypeError.*unsupported operand/i,
    category: 'python',
    severity: 'warning',
    solution: 'Type mismatch in operation. Check variable types and convert if needed (str(), int(), etc.).',
    autoFixable: false,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /FileNotFoundError/i,
    category: 'general',
    severity: 'warning',
    solution: 'File not found. Check file path and ensure file exists before reading.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /PermissionError/i,
    category: 'general',
    severity: 'critical',
    solution: 'Permission denied. Check file/directory permissions or run with appropriate privileges.',
    autoFixable: false,
    retryable: false,
    escalationNeeded: false
  },
  
  // ============ NODE.JS ERRORS ============
  {
    pattern: /'node' is not recognized|'npm' is not recognized|node.*not recognized.*internal or external command/i,
    category: 'node',
    severity: 'critical',
    solution: 'Node.js not in PATH. The system cannot find node.exe. Ensure Node.js directory is in PATH environment variable, or use full path to npm.cmd.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /Cannot find module.*node_modules.*npm.*bin/i,
    category: 'node',
    severity: 'critical',
    solution: 'Corrupted node_modules. npm is looking for itself in the wrong location. Delete node_modules folder and package-lock.json, then run npm install with full path.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /'vite' is not recognized|'tsc' is not recognized|'esbuild' is not recognized/i,
    category: 'node',
    severity: 'warning',
    solution: 'npm binary not found. Dependencies may not be installed. Run npm install first, or the node_modules/.bin may be corrupted.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /Cannot find module/i,
    category: 'node',
    severity: 'critical',
    solution: 'Missing npm package. Run: npm install <package-name> or npm install to install all dependencies.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /Error: Cannot find module.*node_modules/i,
    category: 'node',
    severity: 'critical',
    solution: 'Dependencies not installed or corrupted. Delete node_modules and run: npm install',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /ReferenceError.*is not defined/i,
    category: 'node',
    severity: 'critical',
    solution: 'Variable/function not defined. Check for typos, missing imports, or scope issues.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /SyntaxError.*Unexpected token/i,
    category: 'syntax',
    severity: 'critical',
    solution: 'JavaScript syntax error. Check for missing brackets, quotes, or semicolons. Read the file to see the exact error location.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: true
  },
  {
    pattern: /SyntaxError.*Unexpected token '\)'/i,
    category: 'syntax',
    severity: 'critical',
    solution: 'Incomplete function/arrow function. Check for missing function body after => or missing code before closing parenthesis.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: true
  },
  {
    pattern: /SyntaxError.*at\s+.*\.js:\d+/i,
    category: 'syntax',
    severity: 'critical',
    solution: 'JavaScript syntax error with file location. Read the file at the specified line and fix the syntax issue.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: true
  },
  {
    pattern: /TypeError.*Cannot read property/i,
    category: 'node',
    severity: 'warning',
    solution: 'Trying to access property of undefined/null. Add null checks before accessing properties.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /EADDRINUSE.*address already in use/i,
    category: 'node',
    severity: 'warning',
    solution: 'Port already in use. Change port number or kill the process using that port.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  
  // ============ GENERAL ERRORS ============
  {
    pattern: /ECONNREFUSED/i,
    category: 'general',
    severity: 'warning',
    solution: 'Connection refused. Service may not be running or wrong host/port. Check if service is started.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /ENOENT.*no such file or directory/i,
    category: 'general',
    severity: 'warning',
    solution: 'File or directory not found. Check path and ensure it exists.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  {
    pattern: /timeout/i,
    category: 'general',
    severity: 'warning',
    solution: 'Operation timed out. May need longer timeout or the operation is too slow.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  },
  
  // ============ TRUNCATED CODE ERRORS ============
  {
    pattern: /Content is too short|empty method bodies|incomplete code/i,
    category: 'general',
    severity: 'critical',
    solution: 'Model produced truncated/incomplete code. This is a model limitation - code needs to be regenerated completely.',
    autoFixable: false,
    retryable: true,
    escalationNeeded: true // Truncated code needs better model
  },
  
  // ============ JSON PARSING ERRORS ============
  {
    pattern: /Unexpected.*JSON|JSON parse error/i,
    category: 'general',
    severity: 'critical',
    solution: 'Invalid JSON response from model. Model may have added text before/after JSON. Extract JSON from response.',
    autoFixable: true,
    retryable: true,
    escalationNeeded: false
  }
];

export interface ErrorAnalysis {
  error: string;
  matchedPattern?: ErrorPattern;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  solution: string;
  shouldRetry: boolean;
  shouldEscalate: boolean;
  autoFixable: boolean;
  confidence: number; // 0-1, how confident we are in this analysis
}

export class ErrorKnowledge {
  /**
   * Analyze an error and provide solution
   */
  static analyzeError(errorMessage: string, context?: { language?: string; file?: string }): ErrorAnalysis {
    const errorLower = errorMessage.toLowerCase();
    
    // Find matching patterns
    let bestMatch: ErrorPattern | undefined;
    let bestScore = 0;
    
    for (const pattern of ERROR_PATTERNS) {
      // Filter by language context if provided
      if (context?.language && pattern.category !== 'general' && pattern.category !== context.language) {
        continue;
      }
      
      const match = errorMessage.match(pattern.pattern);
      if (match) {
        // Score based on specificity (longer patterns = more specific)
        const score = pattern.pattern.source.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = pattern;
        }
      }
    }
    
    if (bestMatch) {
      return {
        error: errorMessage,
        matchedPattern: bestMatch,
        category: bestMatch.category,
        severity: bestMatch.severity,
        solution: bestMatch.solution,
        shouldRetry: bestMatch.retryable,
        shouldEscalate: bestMatch.escalationNeeded,
        autoFixable: bestMatch.autoFixable,
        confidence: 0.9
      };
    }
    
    // No match found - generic analysis
    return {
      error: errorMessage,
      category: 'general',
      severity: 'warning',
      solution: 'Unknown error. Review error message and fix accordingly.',
      shouldRetry: true,
      shouldEscalate: false,
      autoFixable: false,
      confidence: 0.3
    };
  }
  
  /**
   * Get common errors for a specific language
   */
  static getCommonErrors(language: 'python' | 'node' | 'general'): ErrorPattern[] {
    return ERROR_PATTERNS.filter(p => 
      p.category === language || p.category === 'general' || 
      (language === 'node' && p.category === 'node')
    );
  }
  
  /**
   * Check if error is "pacing" - still a good attempt that can be fixed
   */
  static isGoodAttempt(error: string, attempts: number): {
    isGoodAttempt: boolean;
    reason: string;
    shouldContinue: boolean;
  } {
    const analysis = this.analyzeError(error);
    
    // Critical errors that are auto-fixable are still good attempts
    if (analysis.autoFixable && analysis.shouldRetry) {
      return {
        isGoodAttempt: true,
        reason: `Auto-fixable error: ${analysis.solution}`,
        shouldContinue: true
      };
    }
    
    // Retryable errors within 3 attempts are good attempts
    if (analysis.shouldRetry && attempts < 3) {
      return {
        isGoodAttempt: true,
        reason: `Retryable error (attempt ${attempts}/3): ${analysis.solution}`,
        shouldContinue: true
      };
    }
    
    // Escalation-needed errors are good attempts if we haven't escalated yet
    if (analysis.shouldEscalate && attempts < 2) {
      return {
        isGoodAttempt: true,
        reason: `Model limitation detected - will escalate to better model`,
        shouldContinue: true
      };
    }
    
    // After 3+ attempts of same error, not a good attempt
    if (attempts >= 3) {
      return {
        isGoodAttempt: false,
        reason: `Failed ${attempts} times with same error. Need different approach.`,
        shouldContinue: false
      };
    }
    
    // Non-retryable errors are not good attempts
    if (!analysis.shouldRetry) {
      return {
        isGoodAttempt: false,
        reason: `Non-retryable error: ${analysis.solution}`,
        shouldContinue: false
      };
    }
    
    return {
      isGoodAttempt: true,
      reason: 'Error can be fixed',
      shouldContinue: true
    };
  }
  
  /**
   * Generate fix instruction for the model
   */
  static generateFixInstruction(error: string, context?: { language?: string; file?: string }): string {
    const analysis = this.analyzeError(error);
    
    let instruction = `\n\n⚠️ ERROR DETECTED:\n${error}\n\n`;
    instruction += `SOLUTION: ${analysis.solution}\n\n`;
    
    if (analysis.autoFixable) {
      instruction += `AUTO-FIX: This error can be automatically fixed. Apply the solution and retry.\n`;
    } else {
      instruction += `MANUAL FIX REQUIRED: Review the error and apply the solution.\n`;
    }
    
    if (analysis.shouldEscalate) {
      instruction += `NOTE: This may require a more capable model. Consider escalating if fix fails.\n`;
    }
    
    return instruction;
  }
}

