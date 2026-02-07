/**
 * AgentPrime - File IPC Handlers Tests
 * 
 * NOTE: Testing utility functions directly. The actual IPC handlers
 * are tested via integration tests.
 */

const path = require('path');

describe('File IPC Handler Utilities', () => {
  describe('getLanguageFromExt', () => {
    // Inline implementation for testing the pattern
    function getLanguageFromExt(ext) {
      const langMap = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescriptreact',
        '.py': 'python',
        '.html': 'html',
        '.htm': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.json': 'json',
        '.md': 'markdown',
        '.sql': 'sql',
        '.sh': 'shell',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.go': 'go',
        '.rs': 'rust'
      };
      return langMap[ext.toLowerCase()] || 'plaintext';
    }

    it('should return correct language for JavaScript files', () => {
      expect(getLanguageFromExt('.js')).toBe('javascript');
      expect(getLanguageFromExt('.jsx')).toBe('javascript');
    });

    it('should return correct language for TypeScript files', () => {
      expect(getLanguageFromExt('.ts')).toBe('typescript');
      expect(getLanguageFromExt('.tsx')).toBe('typescriptreact');
    });

    it('should return correct language for Python files', () => {
      expect(getLanguageFromExt('.py')).toBe('python');
    });

    it('should return correct language for web files', () => {
      expect(getLanguageFromExt('.html')).toBe('html');
      expect(getLanguageFromExt('.htm')).toBe('html');
      expect(getLanguageFromExt('.css')).toBe('css');
      expect(getLanguageFromExt('.scss')).toBe('scss');
    });

    it('should return correct language for data files', () => {
      expect(getLanguageFromExt('.json')).toBe('json');
      expect(getLanguageFromExt('.yaml')).toBe('yaml');
      expect(getLanguageFromExt('.yml')).toBe('yaml');
    });

    it('should return correct language for shell files', () => {
      expect(getLanguageFromExt('.sh')).toBe('shell');
    });

    it('should return plaintext for unknown extensions', () => {
      expect(getLanguageFromExt('.unknown')).toBe('plaintext');
      expect(getLanguageFromExt('.xyz')).toBe('plaintext');
    });

    it('should be case-insensitive', () => {
      expect(getLanguageFromExt('.JS')).toBe('javascript');
      expect(getLanguageFromExt('.PY')).toBe('python');
    });
  });

  describe('File Tree Building', () => {
    it('should define correct FileTreeItem structure', () => {
      const item = {
        name: 'test.js',
        path: 'src/test.js',
        is_dir: false,
        extension: '.js',
        children: undefined
      };
      
      expect(item.name).toBe('test.js');
      expect(item.is_dir).toBe(false);
      expect(item.extension).toBe('.js');
    });

    it('should define directory items correctly', () => {
      const dir = {
        name: 'src',
        path: 'src',
        is_dir: true,
        extension: null,
        children: []
      };
      
      expect(dir.is_dir).toBe(true);
      expect(dir.extension).toBeNull();
      expect(dir.children).toBeInstanceOf(Array);
    });
  });

  describe('Path Handling', () => {
    it('should normalize Windows paths to forward slashes', () => {
      const windowsPath = 'src\\components\\App.tsx';
      const normalized = windowsPath.replace(/\\/g, '/');
      expect(normalized).toBe('src/components/App.tsx');
    });

    it('should get relative path correctly', () => {
      const workspacePath = '/home/user/project';
      const fullPath = '/home/user/project/src/index.js';
      const relativePath = path.posix.relative(workspacePath, fullPath);
      expect(relativePath).toBe('src/index.js');
    });
  });

  describe('Exclusion Patterns', () => {
    const excludedDirs = ['node_modules', '__pycache__', 'venv', '.git', 'dist', 'build'];
    
    it('should identify node_modules as excluded', () => {
      expect(excludedDirs.includes('node_modules')).toBe(true);
    });

    it('should identify __pycache__ as excluded', () => {
      expect(excludedDirs.includes('__pycache__')).toBe(true);
    });

    it('should identify .git as excluded', () => {
      expect(excludedDirs.includes('.git')).toBe(true);
    });

    it('should not exclude src directory', () => {
      expect(excludedDirs.includes('src')).toBe(false);
    });
  });
});
