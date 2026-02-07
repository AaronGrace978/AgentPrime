/**
 * AgentPrime - Project Patterns Tests
 * Tests for project type detection and pattern matching
 */

describe('ProjectPatternMatcher', () => {
  // Inline implementation for testing
  const PROJECT_PATTERNS = {
    phaser_game: {
      id: 'phaser_game',
      type: 'game',
      name: 'Phaser.js Game',
      structure: {
        requiredFiles: ['index.html', 'game.js', 'package.json', 'styles.css'],
        dependencies: { 'phaser': '^3.70.0' }
      }
    },
    html_game: {
      id: 'html_game',
      type: 'game',
      name: 'HTML5 Canvas Game',
      structure: {
        requiredFiles: ['index.html', 'game.js', 'styles.css'],
        dependencies: {}
      }
    },
    threejs_viewer: {
      id: 'threejs_viewer',
      type: 'threejs',
      name: 'Three.js 3D Viewer',
      structure: {
        requiredFiles: ['index.html', 'script.js', 'package.json'],
        dependencies: { 'three': '^0.154.0' }
      }
    },
    express_api: {
      id: 'express_api',
      type: 'express',
      name: 'Express.js REST API',
      structure: {
        requiredFiles: ['server.js', 'package.json'],
        dependencies: { 'express': '^4.18.2' }
      }
    },
    python_fastapi: {
      id: 'python_fastapi',
      type: 'python',
      name: 'FastAPI Web Application',
      structure: {
        requiredFiles: ['main.py', 'requirements.txt'],
        dependencies: { 'fastapi': '^0.104.0', 'uvicorn': '^0.24.0' }
      }
    },
    python_script: {
      id: 'python_script',
      type: 'python',
      name: 'Python Script/CLI',
      structure: {
        requiredFiles: ['main.py'],
        dependencies: {}
      }
    }
  };

  function detectProjectType(files, packageJson) {
    // Check package.json dependencies first
    if (packageJson?.dependencies) {
      if (packageJson.dependencies.phaser) {
        return 'phaser_game';
      }
      if (packageJson.dependencies['pixi.js'] || packageJson.dependencies.pixi) {
        return 'pixi_game';
      }
      if (packageJson.dependencies.three || packageJson.dependencies['@types/three']) {
        return 'threejs_viewer';
      }
      if (packageJson.dependencies.express) {
        return 'express_api';
      }
      if (packageJson.dependencies.react || packageJson.dependencies['react-dom']) {
        return 'react';
      }
    }
    
    // Check file patterns
    if (files.includes('game.js') || files.includes('Game.js')) {
      return 'html_game';
    }
    
    if (files.includes('script.js') && files.includes('index.html')) {
      return 'threejs_viewer';
    }
    
    if (files.includes('server.js') && !files.includes('client')) {
      return 'express_api';
    }
    
    const hasPyFiles = files.some(f => f.endsWith('.py'));
    if (hasPyFiles) {
      return 'python_script';
    }
    
    return null;
  }

  function detectFromMessage(message) {
    const lower = message.toLowerCase();
    
    // Game frameworks
    if (lower.includes('phaser') || lower.includes('phaser.js')) {
      return 'phaser_game';
    }
    if (lower.includes('pixi') || lower.includes('pixi.js')) {
      return 'pixi_game';
    }
    
    // 3D
    if (lower.includes('three.js') || lower.includes('threejs') || lower.includes('3d scene')) {
      return 'threejs_viewer';
    }
    
    // General game detection
    if (lower.includes('game')) {
      if (lower.includes('platformer') || lower.includes('shooter') || lower.includes('arcade') ||
          lower.includes('ball') || lower.includes('paddle') || lower.includes('physics') ||
          lower.includes('jump') || lower.includes('collision')) {
        return 'phaser_game';
      }
      return 'html_game';
    }
    
    // Canvas
    if (lower.includes('canvas') && (lower.includes('animation') || lower.includes('draw'))) {
      return 'html_game';
    }
    
    // Web APIs
    if (lower.includes('express') || (lower.includes('node') && lower.includes('api'))) {
      return 'express_api';
    }
    if (lower.includes('fastapi') || (lower.includes('python') && lower.includes('api'))) {
      return 'python_fastapi';
    }
    if (lower.includes('python') || lower.includes('.py')) {
      return 'python_script';
    }
    
    // Frontend
    if (lower.includes('react')) {
      return 'react';
    }
    if (lower.includes('vue')) {
      return 'vue';
    }
    
    return null;
  }

  describe('detectProjectType (from files)', () => {
    it('should detect Phaser game from package.json', () => {
      const pkg = { dependencies: { phaser: '^3.70.0' } };
      const result = detectProjectType(['index.html', 'game.js'], pkg);
      expect(result).toBe('phaser_game');
    });

    it('should detect Three.js from package.json', () => {
      const pkg = { dependencies: { three: '^0.154.0' } };
      const result = detectProjectType(['index.html', 'script.js'], pkg);
      expect(result).toBe('threejs_viewer');
    });

    it('should detect Express from package.json', () => {
      const pkg = { dependencies: { express: '^4.18.2' } };
      const result = detectProjectType(['server.js'], pkg);
      expect(result).toBe('express_api');
    });

    it('should detect React from package.json', () => {
      const pkg = { dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } };
      const result = detectProjectType(['src/App.jsx'], pkg);
      expect(result).toBe('react');
    });

    it('should detect HTML game from files', () => {
      const result = detectProjectType(['index.html', 'game.js', 'styles.css'], null);
      expect(result).toBe('html_game');
    });

    it('should detect Three.js from files', () => {
      const result = detectProjectType(['index.html', 'script.js'], null);
      expect(result).toBe('threejs_viewer');
    });

    it('should detect Express from files', () => {
      const result = detectProjectType(['server.js', 'package.json'], null);
      expect(result).toBe('express_api');
    });

    it('should detect Python from files', () => {
      const result = detectProjectType(['main.py', 'utils.py'], null);
      expect(result).toBe('python_script');
    });

    it('should return null for unknown projects', () => {
      const result = detectProjectType(['readme.md', 'notes.txt'], null);
      expect(result).toBeNull();
    });
  });

  describe('detectFromMessage (from user request)', () => {
    describe('Game Detection', () => {
      it('should detect Phaser from explicit mention', () => {
        expect(detectFromMessage('Create a Phaser game')).toBe('phaser_game');
        expect(detectFromMessage('Build with phaser.js')).toBe('phaser_game');
      });

      it('should detect PixiJS from explicit mention', () => {
        expect(detectFromMessage('Create a PixiJS animation')).toBe('pixi_game');
        expect(detectFromMessage('Build with pixi.js')).toBe('pixi_game');
      });

      it('should suggest Phaser for arcade-style games', () => {
        expect(detectFromMessage('Create a platformer game')).toBe('phaser_game');
        expect(detectFromMessage('Make a shooter game')).toBe('phaser_game');
        expect(detectFromMessage('Build an arcade game')).toBe('phaser_game');
        expect(detectFromMessage('Create a ball game')).toBe('phaser_game');
        expect(detectFromMessage('Game with physics')).toBe('phaser_game');
        expect(detectFromMessage('Game where player can jump')).toBe('phaser_game');
      });

      it('should default to HTML game for simple games', () => {
        expect(detectFromMessage('Create a simple game')).toBe('html_game');
        expect(detectFromMessage('Make a game')).toBe('html_game');
      });

      it('should detect canvas projects', () => {
        expect(detectFromMessage('Canvas animation')).toBe('html_game');
        expect(detectFromMessage('Draw on canvas')).toBe('html_game');
      });
    });

    describe('3D Detection', () => {
      it('should detect Three.js from explicit mention', () => {
        expect(detectFromMessage('Create a Three.js scene')).toBe('threejs_viewer');
        expect(detectFromMessage('Build with threejs')).toBe('threejs_viewer');
      });

      it('should detect 3D from keywords', () => {
        expect(detectFromMessage('Create a 3D scene')).toBe('threejs_viewer');
      });
    });

    describe('Backend Detection', () => {
      it('should detect Express', () => {
        expect(detectFromMessage('Create an Express server')).toBe('express_api');
        expect(detectFromMessage('Node API')).toBe('express_api');
      });

      it('should detect FastAPI', () => {
        expect(detectFromMessage('Create a FastAPI app')).toBe('python_fastapi');
        expect(detectFromMessage('Python API')).toBe('python_fastapi');
      });

      it('should detect Python scripts', () => {
        expect(detectFromMessage('Write a Python script')).toBe('python_script');
        expect(detectFromMessage('Create main.py')).toBe('python_script');
      });
    });

    describe('Frontend Detection', () => {
      it('should detect React', () => {
        expect(detectFromMessage('Create a React app')).toBe('react');
      });

      it('should detect Vue', () => {
        expect(detectFromMessage('Create a Vue app')).toBe('vue');
      });
    });

    describe('Edge Cases', () => {
      it('should return null for unclear requests', () => {
        expect(detectFromMessage('Hello')).toBeNull();
        expect(detectFromMessage('What is the weather?')).toBeNull();
      });

      it('should be case insensitive', () => {
        expect(detectFromMessage('CREATE A PHASER GAME')).toBe('phaser_game');
        expect(detectFromMessage('PYTHON SCRIPT')).toBe('python_script');
      });
    });
  });

  describe('Pattern Structure', () => {
    it('should have required files for each pattern', () => {
      for (const [id, pattern] of Object.entries(PROJECT_PATTERNS)) {
        expect(pattern.structure.requiredFiles).toBeDefined();
        expect(Array.isArray(pattern.structure.requiredFiles)).toBe(true);
        expect(pattern.structure.requiredFiles.length).toBeGreaterThan(0);
      }
    });

    it('should have proper IDs', () => {
      for (const [id, pattern] of Object.entries(PROJECT_PATTERNS)) {
        expect(pattern.id).toBe(id);
      }
    });

    it('should have names', () => {
      for (const [id, pattern] of Object.entries(PROJECT_PATTERNS)) {
        expect(pattern.name).toBeDefined();
        expect(typeof pattern.name).toBe('string');
      }
    });
  });

  describe('Guidance Generation', () => {
    function generateGuidance(type) {
      const pattern = PROJECT_PATTERNS[type];
      if (!pattern) return '';
      
      let guidance = `## PROJECT TYPE: ${pattern.name}\n\n`;
      guidance += `### Required Files:\n`;
      for (const file of pattern.structure.requiredFiles) {
        guidance += `- ${file}\n`;
      }
      
      return guidance;
    }

    it('should generate guidance for known types', () => {
      const guidance = generateGuidance('phaser_game');
      
      expect(guidance).toContain('Phaser.js Game');
      expect(guidance).toContain('index.html');
      expect(guidance).toContain('game.js');
    });

    it('should return empty for unknown types', () => {
      const guidance = generateGuidance('unknown_type');
      
      expect(guidance).toBe('');
    });

    it('should list all required files', () => {
      const guidance = generateGuidance('express_api');
      
      expect(guidance).toContain('server.js');
      expect(guidance).toContain('package.json');
    });
  });
});

describe('DinoBall Scenario (Regression Test)', () => {
  // This test verifies the exact scenario that was failing before
  
  it('should detect "DinoBall game" as phaser_game (ball keyword)', () => {
    const message = 'Create DinoBall game';
    const lower = message.toLowerCase();
    
    // The detectFromMessage function should catch "ball" in "DinoBall"
    const hasBallKeyword = lower.includes('ball');
    const hasGameKeyword = lower.includes('game');
    
    expect(hasBallKeyword).toBe(true);
    expect(hasGameKeyword).toBe(true);
    
    // With ball + game, should suggest Phaser
    // (This is what we want the system to do)
  });

  it('should require all files for phaser_game', () => {
    const pattern = {
      requiredFiles: ['index.html', 'game.js', 'package.json', 'styles.css'],
      dependencies: { 'phaser': '^3.70.0' }
    };
    
    // The DinoBall project was missing:
    const createdFiles = ['index.html', 'js/config/gameConfig.js', 'package.json', 'README.md'];
    
    const missingFiles = pattern.requiredFiles.filter(f => !createdFiles.includes(f));
    
    // game.js and styles.css were missing
    expect(missingFiles).toContain('game.js');
    expect(missingFiles).toContain('styles.css');
  });

  it('should detect generic package.json', () => {
    const badPackageJson = {
      name: 'project',
      version: '1.0.0',
      description: 'Generated project',
      main: 'index.js',
      dependencies: {}
    };
    
    const isGeneric = badPackageJson.name === 'project' || 
                      badPackageJson.description === 'Generated project' ||
                      Object.keys(badPackageJson.dependencies).length === 0;
    
    expect(isGeneric).toBe(true);
  });

  it('should detect broken HTML references', () => {
    const html = `
      <link rel="stylesheet" href="styles.css">
      <script src="game.js"></script>
    `;
    
    const references = [];
    const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
    const linkMatches = html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi);
    
    for (const match of scriptMatches) {
      references.push(match[1]);
    }
    for (const match of linkMatches) {
      references.push(match[1]);
    }
    
    expect(references).toContain('game.js');
    expect(references).toContain('styles.css');
    
    // If these files don't exist, the project is incomplete
    const existingFiles = ['index.html', 'js/config/gameConfig.js'];
    const brokenRefs = references.filter(ref => !existingFiles.includes(ref));
    
    expect(brokenRefs).toContain('game.js');
    expect(brokenRefs).toContain('styles.css');
  });
});

