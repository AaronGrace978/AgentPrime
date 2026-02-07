/**
 * AgentPrime - Workspace Protection Tests
 * Tests for workspace boundary protection, file existence checks, and hallucination detection
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Mock implementation of the workspace protection functions
// These mirror the TypeScript implementation for testing

function calculateContentHash(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex').substring(0, 16);
}

function isAgentPrimeCodebase(targetPath) {
  // For testing, we'll use a mock AgentPrime root
  const agentPrimeRoot = path.resolve(__dirname, '..', '..');
  const normalizedTarget = path.normalize(path.resolve(targetPath));
  const normalizedRoot = path.normalize(agentPrimeRoot);
  
  return normalizedTarget.startsWith(normalizedRoot);
}

function validateWorkspaceNotSelf(workspacePath) {
  const agentPrimeRoot = path.resolve(__dirname, '..', '..');
  const normalizedWorkspace = path.normalize(path.resolve(workspacePath));
  const normalizedRoot = path.normalize(agentPrimeRoot);
  
  const isSelfCodebase = normalizedWorkspace.startsWith(normalizedRoot);
  
  // Check for AgentPrime markers
  const markers = [
    'src/main/agent-loop.ts',
    'src/main/mirror/opus-reasoning-engine.ts',
    'package.json'
  ];
  
  let markerCount = 0;
  for (const marker of markers) {
    const markerPath = path.join(workspacePath, marker);
    if (fs.existsSync(markerPath)) {
      markerCount++;
      
      // Check package.json for AgentPrime name
      if (marker === 'package.json') {
        try {
          const pkg = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
          if (pkg.name === 'agentprime' || pkg.name === 'agent-prime') {
            return {
              valid: false,
              isSelfCodebase: true,
              reason: "Workspace is AgentPrime's own codebase (detected by package.json)",
              workspacePath,
              agentPrimeRoot
            };
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    }
  }
  
  if (isSelfCodebase && markerCount >= 2) {
    return {
      valid: false,
      isSelfCodebase: true,
      reason: `Workspace appears to be AgentPrime's codebase (${markerCount} markers found)`,
      workspacePath,
      agentPrimeRoot
    };
  }
  
  if (isSelfCodebase) {
    return {
      valid: false,
      isSelfCodebase: true,
      reason: 'Workspace path is within AgentPrime installation directory',
      workspacePath,
      agentPrimeRoot
    };
  }
  
  return {
    valid: true,
    isSelfCodebase: false,
    reason: 'Workspace is valid user project',
    workspacePath,
    agentPrimeRoot
  };
}

function validateFileExists(filePath, workspacePath) {
  const fullPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(workspacePath, filePath);
  
  const normalizedPath = path.normalize(fullPath);
  
  try {
    const stats = fs.statSync(normalizedPath);
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      path: normalizedPath,
      relativePath: path.relative(workspacePath, normalizedPath)
    };
  } catch (e) {
    return {
      exists: false,
      isFile: false,
      isDirectory: false,
      size: 0,
      path: normalizedPath,
      relativePath: path.relative(workspacePath, normalizedPath),
      error: e.message
    };
  }
}

function extractFileReferences(text) {
  const references = [];
  const extensions = ['js', 'ts', 'tsx', 'jsx', 'css', 'html', 'json', 'py', 'md', 'txt', 'yaml', 'yml'];
  const extPattern = extensions.join('|');
  
  // Backtick-quoted files
  const backtickPattern = new RegExp(`\`([^\\s\`]+\\.(${extPattern}))\``, 'gi');
  let match;
  while ((match = backtickPattern.exec(text)) !== null) {
    references.push({
      path: match[1],
      context: text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + 100)),
      type: 'backtick'
    });
  }
  
  // Double-quoted files
  const quotePattern = new RegExp(`"([^"\\s]+\\.(${extPattern}))"`, 'gi');
  while ((match = quotePattern.exec(text)) !== null) {
    if (!references.some(r => r.path === match[1])) {
      references.push({
        path: match[1],
        context: text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + 100)),
        type: 'quoted'
      });
    }
  }
  
  // File with line number
  const linePattern = new RegExp(`([\\w/.-]+\\.(${extPattern}))(?:\\s+line\\s+(\\d+)|:(\\d+))`, 'gi');
  while ((match = linePattern.exec(text)) !== null) {
    const lineNum = match[3] || match[4];
    if (!references.some(r => r.path === match[1])) {
      references.push({
        path: match[1],
        lineNumber: lineNum ? parseInt(lineNum) : undefined,
        context: text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + 100)),
        type: 'line_reference'
      });
    }
  }
  
  return references;
}

function detectHallucinations(modelResponse, workspacePath) {
  const fileReferences = extractFileReferences(modelResponse);
  const hallucinations = [];
  const verified = [];
  
  for (const ref of fileReferences) {
    const existence = validateFileExists(ref.path, workspacePath);
    
    if (!existence.exists) {
      hallucinations.push({
        type: 'non_existent_file',
        claimedPath: ref.path,
        lineNumber: ref.lineNumber,
        context: ref.context,
        suggestion: `File "${ref.path}" does not exist. Model may have hallucinated this file.`
      });
    } else {
      verified.push({
        path: ref.path,
        size: existence.size
      });
    }
  }
  
  return {
    hasHallucinations: hallucinations.length > 0,
    hallucinations,
    verified,
    totalReferences: fileReferences.length,
    hallucinationRate: fileReferences.length > 0 
      ? hallucinations.length / fileReferences.length 
      : 0
  };
}

function detectContentType(content) {
  const contentLower = content.toLowerCase();
  
  const gameIndicators = [
    'game', 'player', 'enemy', 'score', 'level', 'sprite', 'collision',
    'physics', 'velocity', 'gameloop', 'game loop', 'animation frame',
    'requestanimationframe', 'canvas', 'three.js', 'phaser', 'pixi'
  ];
  
  const portfolioIndicators = [
    'portfolio', 'about me', 'contact', 'resume', 'navigation',
    'hamburger', 'nav-menu', 'hero', 'testimonial', 'skills'
  ];
  
  const debuggerIndicators = [
    'debugger', 'code analyzer', 'lint', 'error pattern',
    'syntax check', 'ast', 'parse tree', 'tokenize'
  ];
  
  let gameScore = 0;
  let portfolioScore = 0;
  let debuggerScore = 0;
  
  for (const indicator of gameIndicators) {
    if (contentLower.includes(indicator)) gameScore++;
  }
  
  for (const indicator of portfolioIndicators) {
    if (contentLower.includes(indicator)) portfolioScore++;
  }
  
  for (const indicator of debuggerIndicators) {
    if (contentLower.includes(indicator)) debuggerScore++;
  }
  
  const maxScore = Math.max(gameScore, portfolioScore, debuggerScore);
  let primaryType = 'unknown';
  
  if (maxScore > 0) {
    if (gameScore === maxScore) primaryType = 'game';
    else if (portfolioScore === maxScore) primaryType = 'portfolio';
    else if (debuggerScore === maxScore) primaryType = 'debugger';
  }
  
  return {
    primaryType,
    scores: { game: gameScore, portfolio: portfolioScore, debugger: debuggerScore },
    confidence: maxScore > 3 ? 'high' : maxScore > 1 ? 'medium' : 'low'
  };
}

// ============================================================
// TESTS
// ============================================================

describe('Workspace Protection', () => {
  describe('isAgentPrimeCodebase', () => {
    test('should detect AgentPrime root directory', () => {
      const agentPrimeRoot = path.resolve(__dirname, '..', '..');
      expect(isAgentPrimeCodebase(agentPrimeRoot)).toBe(true);
    });
    
    test('should detect AgentPrime subdirectories', () => {
      const srcDir = path.resolve(__dirname, '..', '..', 'src');
      expect(isAgentPrimeCodebase(srcDir)).toBe(true);
    });
    
    test('should not detect external directories', () => {
      const externalPath = os.tmpdir();
      expect(isAgentPrimeCodebase(externalPath)).toBe(false);
    });
    
    test('should not detect user home directory', () => {
      const homePath = os.homedir();
      expect(isAgentPrimeCodebase(homePath)).toBe(false);
    });
  });
  
  describe('validateWorkspaceNotSelf', () => {
    test('should reject AgentPrime root as workspace', () => {
      const agentPrimeRoot = path.resolve(__dirname, '..', '..');
      const result = validateWorkspaceNotSelf(agentPrimeRoot);
      expect(result.valid).toBe(false);
      expect(result.isSelfCodebase).toBe(true);
    });
    
    test('should accept external directory as workspace', () => {
      const externalPath = os.tmpdir();
      const result = validateWorkspaceNotSelf(externalPath);
      expect(result.valid).toBe(true);
      expect(result.isSelfCodebase).toBe(false);
    });
    
    test('should return workspace path in result', () => {
      const testPath = os.tmpdir();
      const result = validateWorkspaceNotSelf(testPath);
      expect(result.workspacePath).toBe(testPath);
    });
  });
});

describe('File Existence Validation', () => {
  describe('validateFileExists', () => {
    const testWorkspace = path.resolve(__dirname, '..', '..');
    
    test('should detect existing files', () => {
      const result = validateFileExists('package.json', testWorkspace);
      expect(result.exists).toBe(true);
      expect(result.isFile).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    });
    
    test('should detect existing directories', () => {
      const result = validateFileExists('src', testWorkspace);
      expect(result.exists).toBe(true);
      expect(result.isDirectory).toBe(true);
    });
    
    test('should report non-existent files', () => {
      const result = validateFileExists('nonexistent-file-12345.txt', testWorkspace);
      expect(result.exists).toBe(false);
      expect(result.isFile).toBe(false);
      expect(result.error).toBeDefined();
    });
    
    test('should handle absolute paths', () => {
      const absolutePath = path.join(testWorkspace, 'package.json');
      const result = validateFileExists(absolutePath, testWorkspace);
      expect(result.exists).toBe(true);
    });
    
    test('should calculate relative path', () => {
      const result = validateFileExists('src/main/agent-loop.ts', testWorkspace);
      if (result.exists) {
        expect(result.relativePath).toBe(path.normalize('src/main/agent-loop.ts'));
      }
    });
  });
});

describe('Content Hash Verification', () => {
  describe('calculateContentHash', () => {
    test('should return consistent hash for same content', () => {
      const content = 'test content';
      const hash1 = calculateContentHash(content);
      const hash2 = calculateContentHash(content);
      expect(hash1).toBe(hash2);
    });
    
    test('should return different hash for different content', () => {
      const hash1 = calculateContentHash('content 1');
      const hash2 = calculateContentHash('content 2');
      expect(hash1).not.toBe(hash2);
    });
    
    test('should return 16 character hash', () => {
      const hash = calculateContentHash('test');
      expect(hash.length).toBe(16);
    });
    
    test('should handle empty content', () => {
      const hash = calculateContentHash('');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(16);
    });
    
    test('should handle unicode content', () => {
      const hash = calculateContentHash('Hello 世界 🎮');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(16);
    });
  });
});

describe('Hallucination Detection', () => {
  describe('extractFileReferences', () => {
    test('should extract backtick-quoted file references', () => {
      const text = 'Check the `script.js` file for errors';
      const refs = extractFileReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].path).toBe('script.js');
      expect(refs[0].type).toBe('backtick');
    });
    
    test('should extract double-quoted file references', () => {
      const text = 'The bug is in "game.js"';
      const refs = extractFileReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].path).toBe('game.js');
      expect(refs[0].type).toBe('quoted');
    });
    
    test('should extract file references with line numbers', () => {
      const text = 'Fix the issue in game.js line 346';
      const refs = extractFileReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].path).toBe('game.js');
      expect(refs[0].lineNumber).toBe(346);
    });
    
    test('should extract file references with colon line numbers', () => {
      const text = 'Error at script.js:42';
      const refs = extractFileReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].path).toBe('script.js');
      expect(refs[0].lineNumber).toBe(42);
    });
    
    test('should extract multiple file references', () => {
      const text = 'Check `index.html` and "styles.css" for issues';
      const refs = extractFileReferences(text);
      expect(refs.length).toBe(2);
      expect(refs.map(r => r.path)).toContain('index.html');
      expect(refs.map(r => r.path)).toContain('styles.css');
    });
    
    test('should not duplicate references', () => {
      const text = 'Check `script.js` and also "script.js"';
      const refs = extractFileReferences(text);
      expect(refs.length).toBe(1);
    });
    
    test('should extract path with directory', () => {
      const text = 'Look at `src/game.js`';
      const refs = extractFileReferences(text);
      expect(refs.length).toBe(1);
      expect(refs[0].path).toBe('src/game.js');
    });
  });
  
  describe('detectHallucinations', () => {
    const testWorkspace = path.resolve(__dirname, '..', '..');
    
    test('should detect non-existent file references', () => {
      const text = 'The bug is in `nonexistent-file-12345.js`';
      const report = detectHallucinations(text, testWorkspace);
      expect(report.hasHallucinations).toBe(true);
      expect(report.hallucinations.length).toBe(1);
      expect(report.hallucinations[0].claimedPath).toBe('nonexistent-file-12345.js');
    });
    
    test('should verify existing file references', () => {
      const text = 'Check the `package.json` file';
      const report = detectHallucinations(text, testWorkspace);
      expect(report.hasHallucinations).toBe(false);
      expect(report.verified.length).toBe(1);
      expect(report.verified[0].path).toBe('package.json');
    });
    
    test('should calculate hallucination rate', () => {
      const text = 'Check `package.json` and `fake-file.js`';
      const report = detectHallucinations(text, testWorkspace);
      expect(report.hallucinationRate).toBe(0.5);
    });
    
    test('should handle text with no file references', () => {
      const text = 'This is just plain text with no file references.';
      const report = detectHallucinations(text, testWorkspace);
      expect(report.hasHallucinations).toBe(false);
      expect(report.totalReferences).toBe(0);
      expect(report.hallucinationRate).toBe(0);
    });
  });
});

describe('Content Type Detection', () => {
  describe('detectContentType', () => {
    test('should detect game content', () => {
      const gameCode = `
        class Player {
          constructor() {
            this.score = 0;
            this.velocity = { x: 0, y: 0 };
          }
          
          update() {
            this.collision();
            requestAnimationFrame(() => this.gameLoop());
          }
        }
      `;
      const result = detectContentType(gameCode);
      expect(result.primaryType).toBe('game');
      expect(result.scores.game).toBeGreaterThan(0);
    });
    
    test('should detect portfolio content', () => {
      const portfolioCode = `
        <div class="hero">
          <h1>About Me</h1>
          <nav class="nav-menu">
            <button class="hamburger">Menu</button>
            <a href="#skills">Skills</a>
            <a href="#contact">Contact</a>
          </nav>
        </div>
      `;
      const result = detectContentType(portfolioCode);
      expect(result.primaryType).toBe('portfolio');
      expect(result.scores.portfolio).toBeGreaterThan(0);
    });
    
    test('should detect debugger/analyzer content', () => {
      const debuggerCode = `
        class CodeAnalyzer {
          constructor() {
            this.ast = null;
          }
          
          tokenize(source) {
            // Parse tree analysis
          }
          
          lint(code) {
            // Check for error patterns
          }
        }
      `;
      const result = detectContentType(debuggerCode);
      expect(result.primaryType).toBe('debugger');
      expect(result.scores.debugger).toBeGreaterThan(0);
    });
    
    test('should return unknown for ambiguous content', () => {
      const ambiguousCode = 'const x = 1;';
      const result = detectContentType(ambiguousCode);
      expect(result.primaryType).toBe('unknown');
    });
    
    test('should set high confidence for content with many indicators', () => {
      const strongGameCode = `
        game loop player enemy score level collision physics velocity sprite
        canvas requestAnimationFrame mesh scene renderer phaser
      `;
      const result = detectContentType(strongGameCode);
      expect(result.confidence).toBe('high');
    });
  });
});

describe('Integration Tests', () => {
  test('should correctly identify AgentPrime script.js as game code', () => {
    // This tests the exact scenario from the bug report
    const scriptContent = `
      class FruitCatcherGame {
        constructor() {
          this.score = 0;
          this.lives = 3;
          this.gameActive = false;
        }
        
        startGame() {
          this.gameActive = true;
          requestAnimationFrame(() => this.gameLoop());
        }
        
        dropFruit() {
          // Collision detection
        }
      }
    `;
    
    const result = detectContentType(scriptContent);
    
    // The bug was that AgentPrime claimed script.js was "portfolio code"
    // but it actually contains game code
    expect(result.primaryType).toBe('game');
    expect(result.scores.game).toBeGreaterThan(result.scores.portfolio);
  });
  
  test('should detect hallucination when claiming bugs in non-existent files', () => {
    // This tests the exact scenario from the bug report where AgentPrime
    // claimed there was a bug in game.js line 346, but game.js doesn't exist
    const testWorkspace = path.resolve(__dirname, '..', '..');
    
    const modelResponse = `
      ### Issue 2: Bug in game.js line 346 — incorrect velocity.scale() usage
      - Problem:
        velocity.scale(this.player.speed, velocity);  // ❌ WRONG - 2 parameters
    `;
    
    const report = detectHallucinations(modelResponse, testWorkspace);
    
    // There should be no game.js in the AgentPrime root
    // (unless someone created one, which they shouldn't)
    if (!fs.existsSync(path.join(testWorkspace, 'game.js'))) {
      expect(report.hasHallucinations).toBe(true);
      expect(report.hallucinations.some(h => h.claimedPath === 'game.js')).toBe(true);
    }
  });
  
  test('should detect portfolio code when todo app is requested', () => {
    // This is the EXACT bug that happened: user asked for todo app,
    // AgentPrime generated portfolio code in root script.js
    const portfolioCode = `
      document.addEventListener('DOMContentLoaded', function() {
        console.log('Portfolio initialized');
        
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        const navLinks = document.querySelectorAll('.nav-link');
        
        hamburger.addEventListener('click', () => {
          navMenu.classList.toggle('active');
        });
      });
    `;
    
    const result = detectContentType(portfolioCode);
    
    // Portfolio code should be detected
    expect(result.primaryType).toBe('portfolio');
    expect(result.scores.portfolio).toBeGreaterThan(0);
    
    // And it should NOT be detected as todo code
    expect(result.scores.portfolio).toBeGreaterThan(result.scores.game || 0);
  });
  
  test('should detect todo app code correctly', () => {
    const todoCode = `
      class TodoApp {
        constructor() {
          this.todos = this.loadTodos();
        }
        
        addTodo(text) {
          const todo = { id: Date.now(), text, completed: false };
          this.todos.push(todo);
          this.saveTodos();
        }
        
        deleteTodo(id) {
          this.todos = this.todos.filter(t => t.id !== id);
        }
        
        toggleTodo(id) {
          this.todos = this.todos.map(t => 
            t.id === id ? {...t, completed: !t.completed} : t
          );
        }
        
        loadTodos() {
          return JSON.parse(localStorage.getItem('todos')) || [];
        }
        
        saveTodos() {
          localStorage.setItem('todos', JSON.stringify(this.todos));
        }
      }
    `;
    
    // For now, just check it doesn't detect as portfolio
    const result = detectContentType(todoCode);
    expect(result.primaryType).not.toBe('portfolio');
  });
});
