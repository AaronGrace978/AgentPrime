/**
 * AgentPrime - Project Completeness Validator Tests
 * Tests for validating project structure and completeness
 */

const path = require('path');
const fs = require('fs');

// Mock fs module
jest.mock('fs');

describe('Project Completeness Validator', () => {
  // Helper functions matching the actual implementation
  function extractHtmlReferences(content, filePath) {
    const refs = [];
    
    const scriptMatches = content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
    for (const match of scriptMatches) {
      const ref = match[1];
      if (!ref.startsWith('http') && !ref.startsWith('//') && !ref.startsWith('data:')) {
        refs.push({ sourceFile: filePath, reference: ref, type: 'script' });
      }
    }
    
    const linkMatches = content.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi);
    for (const match of linkMatches) {
      const ref = match[1];
      if (!ref.startsWith('http') && !ref.startsWith('//')) {
        refs.push({ sourceFile: filePath, reference: ref, type: 'stylesheet' });
      }
    }
    
    const imgMatches = content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
    for (const match of imgMatches) {
      const ref = match[1];
      if (!ref.startsWith('http') && !ref.startsWith('//') && !ref.startsWith('data:')) {
        refs.push({ sourceFile: filePath, reference: ref, type: 'image' });
      }
    }
    
    return refs;
  }

  function isFileEffectivelyEmpty(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let codeContent = content;
    
    if (['.js', '.ts', '.jsx', '.tsx', '.css'].includes(ext)) {
      codeContent = codeContent.replace(/\/\/.*$/gm, '');
      codeContent = codeContent.replace(/\/\*[\s\S]*?\*\//g, '');
    } else if (['.py'].includes(ext)) {
      codeContent = codeContent.replace(/#.*$/gm, '');
      codeContent = codeContent.replace(/"""[\s\S]*?"""/g, '');
    } else if (['.html'].includes(ext)) {
      codeContent = codeContent.replace(/<!--[\s\S]*?-->/g, '');
    }
    
    const meaningfulContent = codeContent.replace(/\s+/g, '').trim();
    return meaningfulContent.length < 20;
  }

  function detectIncompleteCode(content, filePath) {
    const issues = [];
    const ext = path.extname(filePath).toLowerCase();
    
    if (['.js', '.ts'].includes(ext)) {
      if (/\([^)]*\)\s*=>\s*[);,]/.test(content)) {
        issues.push('Incomplete arrow functions detected (empty bodies)');
      }
      
      const emptyFuncs = (content.match(/(?:function\s*\w*\s*\([^)]*\)|=>\s*)\s*\{\s*\}/g) || []).length;
      if (emptyFuncs > 2) {
        issues.push(`${emptyFuncs} empty function bodies detected`);
      }
      
      if (/\/\/\s*TODO|\/\/\s*FIXME|\/\*\s*TODO/.test(content)) {
        issues.push('Contains TODO/FIXME comments - code is incomplete');
      }
      
      if (/placeholder|implement|your code here/i.test(content)) {
        issues.push('Contains placeholder text');
      }
    }
    
    if (ext === '.py') {
      const passCount = (content.match(/^\s*pass\s*$/gm) || []).length;
      if (passCount > 2) {
        issues.push(`${passCount} 'pass' statements - likely incomplete implementation`);
      }
      
      if (/^\s*\.\.\.\s*$/m.test(content)) {
        issues.push('Contains ... placeholder');
      }
    }
    
    if (ext === '.html') {
      if (/<body[^>]*>\s*<\/body>/i.test(content)) {
        issues.push('Empty body element');
      }
    }
    
    return issues;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractHtmlReferences', () => {
    it('should extract script sources', () => {
      const html = '<script src="game.js"></script>';
      const refs = extractHtmlReferences(html, 'index.html');
      
      expect(refs).toHaveLength(1);
      expect(refs[0].reference).toBe('game.js');
      expect(refs[0].type).toBe('script');
    });

    it('should extract stylesheet links', () => {
      const html = '<link rel="stylesheet" href="styles.css">';
      const refs = extractHtmlReferences(html, 'index.html');
      
      expect(refs).toHaveLength(1);
      expect(refs[0].reference).toBe('styles.css');
      expect(refs[0].type).toBe('stylesheet');
    });

    it('should extract image sources', () => {
      const html = '<img src="logo.png" alt="Logo">';
      const refs = extractHtmlReferences(html, 'index.html');
      
      expect(refs).toHaveLength(1);
      expect(refs[0].reference).toBe('logo.png');
      expect(refs[0].type).toBe('image');
    });

    it('should skip external URLs', () => {
      const html = `
        <script src="https://cdn.example.com/lib.js"></script>
        <link href="//cdn.example.com/styles.css" rel="stylesheet">
        <img src="https://example.com/image.png">
      `;
      const refs = extractHtmlReferences(html, 'index.html');
      
      expect(refs).toHaveLength(0);
    });

    it('should skip data URLs', () => {
      const html = '<script src="data:text/javascript,console.log(1)"></script>';
      const refs = extractHtmlReferences(html, 'index.html');
      
      expect(refs).toHaveLength(0);
    });

    it('should extract multiple references', () => {
      const html = `
        <link href="reset.css" rel="stylesheet">
        <link href="styles.css" rel="stylesheet">
        <script src="vendor.js"></script>
        <script src="app.js"></script>
      `;
      const refs = extractHtmlReferences(html, 'index.html');
      
      expect(refs).toHaveLength(4);
      expect(refs.filter(r => r.type === 'stylesheet')).toHaveLength(2);
      expect(refs.filter(r => r.type === 'script')).toHaveLength(2);
    });

    it('should handle both quote styles', () => {
      const html = `
        <script src='single.js'></script>
        <script src="double.js"></script>
      `;
      const refs = extractHtmlReferences(html, 'index.html');
      
      expect(refs).toHaveLength(2);
    });
  });

  describe('isFileEffectivelyEmpty', () => {
    it('should detect empty JavaScript file', () => {
      const content = '// Just a comment\n/* Another comment */';
      expect(isFileEffectivelyEmpty(content, 'file.js')).toBe(true);
    });

    it('should detect file with only whitespace', () => {
      const content = '   \n\n\t\t   \n';
      expect(isFileEffectivelyEmpty(content, 'file.js')).toBe(true);
    });

    it('should accept file with meaningful content', () => {
      const content = 'const x = 1;\nconsole.log(x);';
      expect(isFileEffectivelyEmpty(content, 'file.js')).toBe(false);
    });

    it('should detect empty Python file', () => {
      const content = '# Comment\n"""Docstring"""\n# Another comment';
      expect(isFileEffectivelyEmpty(content, 'file.py')).toBe(true);
    });

    it('should detect empty HTML file', () => {
      const content = '<!-- Just a comment -->';
      expect(isFileEffectivelyEmpty(content, 'file.html')).toBe(true);
    });

    it('should accept HTML with content', () => {
      const content = '<html><body><h1>Hello</h1></body></html>';
      expect(isFileEffectivelyEmpty(content, 'file.html')).toBe(false);
    });
  });

  describe('detectIncompleteCode', () => {
    describe('JavaScript', () => {
      it('should detect incomplete arrow functions', () => {
        const code = 'const fn = (x) => );';
        const issues = detectIncompleteCode(code, 'file.js');
        
        expect(issues.some(i => i.includes('arrow functions'))).toBe(true);
      });

      it('should detect empty function bodies', () => {
        const code = `
          function a() {}
          function b() {}
          function c() {}
        `;
        const issues = detectIncompleteCode(code, 'file.js');
        
        expect(issues.some(i => i.includes('empty function bodies'))).toBe(true);
      });

      it('should detect TODO comments', () => {
        const code = '// TODO: implement this\nfunction todo() {}';
        const issues = detectIncompleteCode(code, 'file.js');
        
        expect(issues.some(i => i.includes('TODO'))).toBe(true);
      });

      it('should detect FIXME comments', () => {
        const code = '// FIXME: broken\nconst x = 1;';
        const issues = detectIncompleteCode(code, 'file.js');
        
        expect(issues.some(i => i.includes('TODO') || i.includes('FIXME'))).toBe(true);
      });

      it('should detect placeholder text', () => {
        const code = 'function doSomething() { /* implement your code here */ }';
        const issues = detectIncompleteCode(code, 'file.js');
        
        expect(issues.some(i => i.includes('placeholder'))).toBe(true);
      });

      it('should accept complete code', () => {
        const code = `
          function greet(name) {
            return 'Hello, ' + name;
          }
          console.log(greet('World'));
        `;
        const issues = detectIncompleteCode(code, 'file.js');
        
        expect(issues).toHaveLength(0);
      });
    });

    describe('Python', () => {
      it('should detect multiple pass statements', () => {
        const code = `
def a():
    pass

def b():
    pass

def c():
    pass
        `;
        const issues = detectIncompleteCode(code, 'file.py');
        
        expect(issues.some(i => i.includes('pass'))).toBe(true);
      });

      it('should detect ellipsis placeholder', () => {
        const code = `
def not_implemented():
    ...
        `;
        const issues = detectIncompleteCode(code, 'file.py');
        
        expect(issues.some(i => i.includes('...'))).toBe(true);
      });

      it('should accept complete Python code', () => {
        const code = `
def greet(name):
    return f"Hello, {name}"

print(greet("World"))
        `;
        const issues = detectIncompleteCode(code, 'file.py');
        
        expect(issues).toHaveLength(0);
      });
    });

    describe('HTML', () => {
      it('should detect empty body', () => {
        const code = '<html><body></body></html>';
        const issues = detectIncompleteCode(code, 'file.html');
        
        expect(issues.some(i => i.includes('Empty body'))).toBe(true);
      });

      it('should accept HTML with content', () => {
        const code = '<html><body><h1>Hello</h1></body></html>';
        const issues = detectIncompleteCode(code, 'file.html');
        
        expect(issues).toHaveLength(0);
      });
    });
  });

  describe('Package.json Validation', () => {
    function checkPackageJson(packageJson, expectedDeps) {
      if (!packageJson) {
        return { exists: false, missing: Object.keys(expectedDeps), isGeneric: false };
      }
      
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const missing = [];
      
      for (const dep of Object.keys(expectedDeps)) {
        if (!allDeps[dep]) {
          missing.push(dep);
        }
      }
      
      const isGeneric = packageJson.name === 'project' || 
                        packageJson.name === 'my-project' ||
                        packageJson.description === 'Generated project' ||
                        (Object.keys(packageJson.dependencies || {}).length === 0 && 
                         Object.keys(packageJson.devDependencies || {}).length === 0);
      
      return { exists: true, missing, isGeneric };
    }

    it('should detect missing dependencies', () => {
      const pkg = {
        name: 'my-game',
        dependencies: {}
      };
      const expected = { phaser: '^3.70.0' };
      
      const result = checkPackageJson(pkg, expected);
      
      expect(result.missing).toContain('phaser');
    });

    it('should detect generic package.json', () => {
      const pkg = {
        name: 'project',
        description: 'Generated project',
        dependencies: {}
      };
      
      const result = checkPackageJson(pkg, {});
      
      expect(result.isGeneric).toBe(true);
    });

    it('should accept proper package.json', () => {
      const pkg = {
        name: 'my-awesome-game',
        description: 'A cool game',
        dependencies: {
          phaser: '^3.70.0'
        },
        devDependencies: {
          'http-server': '^14.0.0'
        }
      };
      const expected = { phaser: '^3.70.0' };
      
      const result = checkPackageJson(pkg, expected);
      
      expect(result.isGeneric).toBe(false);
      expect(result.missing).toHaveLength(0);
    });

    it('should find dependencies in devDependencies', () => {
      const pkg = {
        name: 'my-app',
        devDependencies: {
          'http-server': '^14.0.0'
        }
      };
      const expected = { 'http-server': '^14.0.0' };
      
      const result = checkPackageJson(pkg, expected);
      
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('Completeness Score Calculation', () => {
    function calculateScore(validation) {
      let score = 100;
      
      score -= validation.missingFiles.length * 15;
      score -= validation.brokenReferences.length * 10;
      score -= validation.emptyFiles.length * 10;
      score -= validation.issues.length * 5;
      
      return Math.max(0, Math.min(100, score));
    }

    it('should give 100 for perfect project', () => {
      const validation = {
        missingFiles: [],
        brokenReferences: [],
        emptyFiles: [],
        issues: []
      };
      
      expect(calculateScore(validation)).toBe(100);
    });

    it('should deduct for missing files', () => {
      const validation = {
        missingFiles: ['game.js', 'styles.css'],
        brokenReferences: [],
        emptyFiles: [],
        issues: []
      };
      
      expect(calculateScore(validation)).toBe(70); // 100 - 30
    });

    it('should deduct for broken references', () => {
      const validation = {
        missingFiles: [],
        brokenReferences: [{ reference: 'missing.js' }],
        emptyFiles: [],
        issues: []
      };
      
      expect(calculateScore(validation)).toBe(90);
    });

    it('should deduct for empty files', () => {
      const validation = {
        missingFiles: [],
        brokenReferences: [],
        emptyFiles: ['empty.js'],
        issues: []
      };
      
      expect(calculateScore(validation)).toBe(90);
    });

    it('should deduct for code issues', () => {
      const validation = {
        missingFiles: [],
        brokenReferences: [],
        emptyFiles: [],
        issues: ['TODO comment', 'Empty function']
      };
      
      expect(calculateScore(validation)).toBe(90);
    });

    it('should not go below 0', () => {
      const validation = {
        missingFiles: Array(10).fill('file.js'),
        brokenReferences: Array(10).fill({ reference: 'ref' }),
        emptyFiles: Array(10).fill('empty.js'),
        issues: Array(20).fill('issue')
      };
      
      expect(calculateScore(validation)).toBe(0);
    });

    it('should combine all deductions', () => {
      const validation = {
        missingFiles: ['missing.js'],      // -15
        brokenReferences: [{ ref: 'x' }],  // -10
        emptyFiles: ['empty.js'],          // -10
        issues: ['TODO']                   // -5
      };
      
      expect(calculateScore(validation)).toBe(60);
    });
  });
});

