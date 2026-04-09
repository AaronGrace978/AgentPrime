/**
 * Project Pattern Knowledge Base
 * Captures successful project patterns so agent can replicate quality
 * 
 * When agent builds a project successfully, we extract patterns and store them.
 * Future projects of the same type can use these patterns.
 */

export interface ProjectPattern {
  id: string;
  type: 'threejs' | 'express' | 'react' | 'vue' | 'python' | 'html' | 'game' | 'cli' | 'complex_web_app';
  name: string;
  description: string;
  structure: {
    requiredFiles: string[];
    optionalFiles: string[];
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts: Record<string, string>;
  };
  codePatterns: {
    file: string;
    patterns: string[]; // Key code patterns to include
    antiPatterns: string[]; // Things to avoid
  }[];
  launchConfig: {
    command: string;
    port?: number;
    needsBuild?: boolean;
    staticServer?: boolean;
  };
  qualityChecks: string[]; // What to validate before marking done
  successCriteria: string[]; // How to know it's complete
}

/**
 * Pre-defined project patterns based on successful projects
 */
export const PROJECT_PATTERNS: Record<string, ProjectPattern> = {
  threejs_viewer: {
    id: 'threejs_viewer',
    type: 'threejs',
    name: 'Three.js 3D Viewer',
    description: 'Interactive 3D scene with Three.js, OrbitControls, particles, and animations',
    structure: {
      requiredFiles: ['index.html', 'script.js', 'package.json'],
      optionalFiles: ['styles.css', 'README.md'],
      dependencies: {
        'three': '^0.154.0',
        '@types/three': '^0.154.0'
      },
      devDependencies: {
        'http-server': '^14.1.1'
      },
      scripts: {
        'start': 'http-server .'
      }
    },
    codePatterns: [
      {
        file: 'index.html',
        patterns: [
          'ES6 module importmap for Three.js',
          'Container div for renderer',
          'Module script tag',
          'Controls/instructions UI'
        ],
        antiPatterns: [
          'CDN links (use importmap instead)',
          'Missing container element'
        ]
      },
      {
        file: 'script.js',
        patterns: [
          'import * as THREE from three',
          'import OrbitControls from three/addons',
          'Scene, Camera, Renderer setup',
          'Lighting (ambient + directional + point lights)',
          'OrbitControls with damping',
          'Animation loop with requestAnimationFrame',
          'Window resize handler',
          'Complete function bodies (no => )',
          'Proper material properties (metalness, roughness)'
        ],
        antiPatterns: [
          'Incomplete arrow functions',
          'Missing animation loop',
          'No resize handler',
          'Empty function bodies'
        ]
      },
      {
        file: 'package.json',
        patterns: [
          'http-server as dev dependency',
          'start script for static server',
          'Three.js dependencies'
        ],
        antiPatterns: [
          'Missing http-server',
          'Wrong start command'
        ]
      }
    ],
    launchConfig: {
      command: 'npm start',
      port: 8080,
      staticServer: true,
      needsBuild: false
    },
    qualityChecks: [
      'All arrow functions have complete bodies',
      'Animation loop is properly set up',
      'Controls are initialized',
      'No syntax errors in script.js',
      'HTML has proper importmap',
      'Container element exists'
    ],
    successCriteria: [
      'Server starts without errors',
      '3D scene renders in browser',
      'Mouse controls work (rotate, pan, zoom)',
      'Animation is smooth',
      'No console errors'
    ]
  },

  threejs_platformer: {
    id: 'threejs_platformer',
    type: 'threejs',
    name: 'Three.js Platformer',
    description: 'Side-scrolling Three.js platformer with deterministic movement, jumping, collectibles, and a handcrafted course',
    structure: {
      requiredFiles: ['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/game/Game.ts'],
      optionalFiles: ['src/styles.css', 'src/game/entities/Player.ts', 'src/game/world/World.ts', 'README.md'],
      dependencies: {
        'three': '^0.160.0',
        'react': '^18.2.0',
        'react-dom': '^18.2.0'
      },
      devDependencies: {
        'vite': '^5.0.0',
        'typescript': '^5.2.2',
        '@vitejs/plugin-react': '^4.2.0'
      },
      scripts: {
        'dev': 'vite',
        'build': 'tsc && vite build',
        'preview': 'vite preview'
      }
    },
    codePatterns: [
      {
        file: 'src/game/Game.ts',
        patterns: [
          'requestAnimationFrame game loop',
          'camera follows player from a side-on angle',
          'collectibles update HUD score',
          'restart flow for falls or reset input'
        ],
        antiPatterns: [
          'prototype monkey-patching',
          'duplicated input listeners across files',
          'strict-mode property initialization errors'
        ]
      },
      {
        file: 'src/game/entities/Player.ts',
        patterns: [
          'deterministic movement using input state',
          'grounded jump logic',
          'platform collision checks against world surfaces'
        ],
        antiPatterns: [
          'window-global key state',
          'hidden implicit dependencies on camera-only movement'
        ]
      }
    ],
    launchConfig: {
      command: 'npm run dev',
      port: 5173,
      staticServer: false,
      needsBuild: true
    },
    qualityChecks: [
      'npm run build passes',
      'player can move with keyboard input',
      'jump only triggers when grounded',
      'collectibles and goal update the HUD state'
    ],
    successCriteria: [
      'Vite app starts without errors',
      'platformer scene renders in browser',
      'WASD movement and Space jump work',
      'score progresses when collectibles are gathered'
    ]
  },
  
  express_api: {
    id: 'express_api',
    type: 'express',
    name: 'Express.js REST API',
    description: 'RESTful API with Express, JSON responses, and proper error handling',
    structure: {
      requiredFiles: ['server.js', 'package.json'],
      optionalFiles: ['README.md', '.env'],
      dependencies: {
        'express': '^4.18.2'
      },
      scripts: {
        'start': 'node server.js'
      }
    },
    codePatterns: [
      {
        file: 'server.js',
        patterns: [
          'const express = require(\'express\')',
          'app.use(express.json())',
          'Complete route handlers with proper responses',
          'app.listen() with port and callback',
          'Error handling middleware',
          'Proper HTTP status codes'
        ],
        antiPatterns: [
          'Incomplete arrow functions (req, res) => )',
          'Missing response.send() or response.json()',
          'No error handling',
          'Incomplete listen callback'
        ]
      }
    ],
    launchConfig: {
      command: 'node server.js',
      port: 3000,
      staticServer: false,
      needsBuild: false
    },
    qualityChecks: [
      'All route handlers have complete bodies',
      'app.listen() has complete callback',
      'No syntax errors',
      'Proper middleware setup'
    ],
    successCriteria: [
      'Server starts on specified port',
      'Routes respond correctly',
      'JSON parsing works',
      'No syntax errors'
    ]
  },
  
  html_game: {
    id: 'html_game',
    type: 'game',
    name: 'HTML5 Canvas Game',
    description: 'Interactive game with Canvas, game loop, and proper state management',
    structure: {
      requiredFiles: ['index.html', 'game.js', 'styles.css'],
      optionalFiles: ['package.json', 'README.md', 'assets/'],
      dependencies: {},
      devDependencies: {
        'http-server': '^14.1.1'
      },
      scripts: {
        'start': 'http-server . -p 8080 -o'
      }
    },
    codePatterns: [
      {
        file: 'index.html',
        patterns: [
          'Canvas element with id',
          'Link to styles.css',
          'Script tag for game.js (defer or at end of body)',
          'Start button or instructions'
        ],
        antiPatterns: [
          'Script src pointing to non-existent file',
          'CSS link to non-existent stylesheet',
          'Missing canvas element'
        ]
      },
      {
        file: 'game.js',
        patterns: [
          'Canvas context setup (getContext 2d)',
          'Game loop with requestAnimationFrame',
          'Proper state management object',
          'Event listeners for keyboard/mouse input',
          'Complete class methods with implementations',
          'Global startGame() function accessible from HTML',
          'Update and render functions',
          'Collision detection logic'
        ],
        antiPatterns: [
          'Missing game loop',
          'Incomplete methods or empty functions',
          'No global access for button handlers',
          'requestAnimationFrame without proper loop',
          'Missing canvas context'
        ]
      },
      {
        file: 'styles.css',
        patterns: [
          'Canvas styling (border, background)',
          'Body/container centering',
          'Button styling',
          'Score/UI element styling'
        ],
        antiPatterns: [
          'Empty stylesheet',
          'Only comments'
        ]
      }
    ],
    launchConfig: {
      command: 'npx http-server . -p 8080 -o',
      port: 8080,
      staticServer: true,
      needsBuild: false
    },
    qualityChecks: [
      'Game loop is complete with requestAnimationFrame',
      'Start button triggers startGame() correctly',
      'No syntax errors in game.js',
      'Canvas is properly initialized with context',
      'All referenced files (css, js) exist',
      'Game state is properly managed'
    ],
    successCriteria: [
      'Game starts when button clicked',
      'Game loop runs smoothly at 60fps',
      'Controls work (keyboard/mouse)',
      'No console errors',
      'Visual feedback for game events'
    ]
  },
  
  phaser_game: {
    id: 'phaser_game',
    type: 'game',
    name: 'Phaser.js Game',
    description: 'HTML5 game built with Phaser 3 framework - great for platformers, shooters, puzzles',
    structure: {
      requiredFiles: ['index.html', 'game.js', 'package.json', 'styles.css'],
      optionalFiles: ['README.md', 'assets/', 'scenes/', 'config.js'],
      dependencies: {
        'phaser': '^3.70.0'
      },
      devDependencies: {
        'http-server': '^14.1.1'
      },
      scripts: {
        'start': 'http-server . -p 8080 -o',
        'dev': 'http-server . -p 8080 -o -c-1'
      }
    },
    codePatterns: [
      {
        file: 'index.html',
        patterns: [
          'Phaser CDN script or local reference',
          'Container div for game (id="game-container")',
          'Script tag loading game.js after Phaser',
          'Proper load order: Phaser first, then game code'
        ],
        antiPatterns: [
          'Using Phaser before loading it',
          'Missing Phaser script tag',
          'game.js loaded before Phaser'
        ]
      },
      {
        file: 'game.js',
        patterns: [
          'Phaser.Game configuration object',
          'Scene class with preload, create, update methods',
          'Proper physics configuration (arcade, matter, etc.)',
          'Asset loading in preload()',
          'Game object creation in create()',
          'Game logic in update()',
          'Input handling with this.input',
          'Complete method implementations'
        ],
        antiPatterns: [
          'Phaser undefined errors',
          'Empty scene methods',
          'Missing scene registration in config',
          'Assets loaded outside preload()',
          'Incomplete arrow functions'
        ]
      },
      {
        file: 'package.json',
        patterns: [
          'phaser in dependencies',
          'http-server in devDependencies',
          'start script for serving'
        ],
        antiPatterns: [
          'Missing phaser dependency',
          'Generic project name',
          'Empty dependencies'
        ]
      }
    ],
    launchConfig: {
      command: 'npm start',
      port: 8080,
      staticServer: true,
      needsBuild: false
    },
    qualityChecks: [
      'Phaser is properly loaded before game code',
      'Scene has preload, create, update methods',
      'Physics is configured correctly',
      'All assets referenced exist or use placeholders',
      'No Phaser undefined errors',
      'Game config has valid scene reference'
    ],
    successCriteria: [
      'Game initializes without errors',
      'Scene loads and displays',
      'Physics objects work correctly',
      'Input controls respond',
      'No console errors'
    ]
  },
  
  pixi_game: {
    id: 'pixi_game',
    type: 'game',
    name: 'PixiJS Game/Animation',
    description: 'High-performance 2D rendering with PixiJS - great for animations and visual effects',
    structure: {
      requiredFiles: ['index.html', 'app.js', 'package.json', 'styles.css'],
      optionalFiles: ['README.md', 'assets/'],
      dependencies: {
        'pixi.js': '^7.3.0'
      },
      devDependencies: {
        'http-server': '^14.1.1'
      },
      scripts: {
        'start': 'http-server . -p 8080 -o'
      }
    },
    codePatterns: [
      {
        file: 'index.html',
        patterns: [
          'PixiJS CDN or local script',
          'Container div for canvas',
          'app.js loaded after PIXI'
        ],
        antiPatterns: [
          'PIXI undefined',
          'app.js before PIXI'
        ]
      },
      {
        file: 'app.js',
        patterns: [
          'new PIXI.Application() setup',
          'document.body.appendChild(app.view)',
          'Sprite/Graphics creation',
          'app.ticker for animation loop',
          'Asset loading with PIXI.Assets'
        ],
        antiPatterns: [
          'Missing app.view append',
          'Empty ticker callback'
        ]
      }
    ],
    launchConfig: {
      command: 'npm start',
      port: 8080,
      staticServer: true,
      needsBuild: false
    },
    qualityChecks: [
      'PIXI.Application initialized',
      'Canvas appended to DOM',
      'Animation loop running'
    ],
    successCriteria: [
      'Canvas renders',
      'Animations play',
      'No console errors'
    ]
  },
  
  python_fastapi: {
    id: 'python_fastapi',
    type: 'python',
    name: 'FastAPI Web Application',
    description: 'Python FastAPI REST API with proper structure, virtual environment, and requirements.txt',
    structure: {
      requiredFiles: ['main.py', 'requirements.txt'],
      optionalFiles: ['app.py', 'run.bat', 'README.md', '.env'],
      dependencies: {
        'fastapi': '^0.104.0',
        'uvicorn': '^0.24.0'
      },
      scripts: {}
    },
    codePatterns: [
      {
        file: 'main.py',
        patterns: [
          'from fastapi import FastAPI',
          'app = FastAPI()',
          'Complete route handlers with proper decorators',
          'if __name__ == "__main__": uvicorn.run(...)',
          'Proper type hints',
          'Error handling'
        ],
        antiPatterns: [
          'Incomplete function definitions',
          'Missing uvicorn.run()',
          'No error handling',
          'Missing type hints'
        ]
      },
      {
        file: 'requirements.txt',
        patterns: [
          'fastapi>=',
          'uvicorn>=',
          'Version pinning'
        ],
        antiPatterns: [
          'Missing fastapi',
          'Missing uvicorn'
        ]
      }
    ],
    launchConfig: {
      command: 'python main.py',
      port: 8000,
      staticServer: false,
      needsBuild: false
    },
    qualityChecks: [
      'All functions have complete bodies',
      'uvicorn.run() is properly configured',
      'Virtual environment is set up',
      'requirements.txt includes all dependencies',
      'No syntax errors'
    ],
    successCriteria: [
      'Server starts on port 8000',
      'API endpoints respond correctly',
      'No import errors',
      'Virtual environment activated'
    ]
  },
  
  python_script: {
    id: 'python_script',
    type: 'python',
    name: 'Python Script/CLI',
    description: 'Standalone Python script with proper structure and dependencies',
    structure: {
      requiredFiles: ['main.py'],
      optionalFiles: ['requirements.txt', 'run.bat', 'README.md'],
      dependencies: {},
      scripts: {}
    },
    codePatterns: [
      {
        file: 'main.py',
        patterns: [
          'if __name__ == "__main__":',
          'Complete function definitions',
          'Proper error handling',
          'Main execution block'
        ],
        antiPatterns: [
          'Incomplete functions',
          'Missing main block',
          'No error handling'
        ]
      }
    ],
    launchConfig: {
      command: 'python main.py',
      port: undefined,
      staticServer: false,
      needsBuild: false
    },
    qualityChecks: [
      'All functions are complete',
      'Main execution block exists',
      'No syntax errors',
      'Proper imports'
    ],
    successCriteria: [
      'Script runs without errors',
      'All imports resolve',
      'No syntax errors',
      'Output is correct'
    ]
  },

  react_vite: {
    id: 'react_vite',
    type: 'react',
    name: 'React + Vite + TypeScript',
    description: 'Modern React application with Vite bundler and TypeScript',
    structure: {
      requiredFiles: [
        'index.html',           // CRITICAL: Vite entry point - MUST be in root
        'package.json',
        'vite.config.ts',
        'tsconfig.json',
        'src/main.tsx',         // React DOM render entry
        'src/App.tsx',          // Main App component
        'src/index.css'         // Global styles
      ],
      optionalFiles: [
        'tsconfig.node.json',
        'README.md',
        '.gitignore',
        'src/vite-env.d.ts'
      ],
      dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0'
      },
      devDependencies: {
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@vitejs/plugin-react': '^4.0.0',
        'typescript': '^5.0.0',
        'vite': '^4.3.0'
      },
      scripts: {
        'dev': 'vite',
        'build': 'tsc && vite build',
        'preview': 'vite preview'
      }
    },
    codePatterns: [
      {
        file: 'index.html',
        patterns: [
          '<!DOCTYPE html>',
          '<html lang="en">',
          '<div id="root"></div>',
          '<script type="module" src="./src/main.tsx"></script>',
          'viewport meta tag'
        ],
        antiPatterns: [
          'Missing doctype',
          'No root div element',
          'Script src pointing to wrong file (.tsxx instead of .tsx)',
          'Missing viewport meta tag'
        ]
      },
      {
        file: 'src/main.tsx',
        patterns: [
          'import React from \'react\'',
          'import ReactDOM from \'react-dom/client\'',
          'import App from \'./App\'',
          'ReactDOM.createRoot(document.getElementById(\'root\')!).render(',
          '<React.StrictMode>',
          '</React.StrictMode>'
        ],
        antiPatterns: [
          'Missing React import',
          'Using ReactDOM.render instead of createRoot (React 18)',
          'Missing StrictMode'
        ]
      },
      {
        file: 'src/App.tsx',
        patterns: [
          'import React',
          'function App() or const App: React.FC',
          'export default App',
          'Complete JSX return statement'
        ],
        antiPatterns: [
          'Missing export',
          'Incomplete component',
          'TODO comments',
          'Empty return'
        ]
      },
      {
        file: 'tsconfig.json',
        patterns: [
          '"jsx": "react-jsx"',
          '"strict": true',
          '"target": "ES2020"',
          '"module": "ESNext"',
          '"moduleResolution": "bundler"'
        ],
        antiPatterns: [
          'Missing jsx option',
          'jsx set to "preserve" (wrong for Vite)',
          'Missing strict mode'
        ]
      },
      {
        file: 'vite.config.ts',
        patterns: [
          'import { defineConfig } from \'vite\'',
          'import react from \'@vitejs/plugin-react\'',
          'export default defineConfig({',
          'plugins: [react()]'
        ],
        antiPatterns: [
          'Missing react plugin',
          'Wrong import syntax'
        ]
      },
      {
        file: 'package.json',
        patterns: [
          '"react": "^18',
          '"react-dom": "^18',
          '"vite": "^',
          '"@vitejs/plugin-react"',
          '"dev": "vite"'
        ],
        antiPatterns: [
          'Missing react dependency',
          'Missing vite devDependency',
          'Missing dev script'
        ]
      }
    ],
    launchConfig: {
      command: 'npm run dev',
      port: 5173,
      needsBuild: false,
      staticServer: false
    },
    qualityChecks: [
      'index.html exists in project root (NOT in src/)',
      'index.html has <div id="root"></div>',
      'index.html has <script type="module" src="./src/main.tsx"></script>',
      'tsconfig.json has "jsx": "react-jsx"',
      'All imports resolve correctly',
      'package.json has all required dependencies',
      'Components use proper React 18 patterns'
    ],
    successCriteria: [
      'npm run dev starts without errors',
      'Page loads in browser at localhost:5173',
      'React components render correctly',
      'Hot module replacement works',
      'No TypeScript errors',
      'No console errors'
    ]
  },

  complex_vue_threejs_audio: {
    id: 'complex_vue_threejs_audio',
    type: 'complex_web_app',
    name: 'Vue 3 + Three.js Audio-Reactive Visualization',
    description: 'Complex single-page application with real-time audio analysis, Three.js particle systems, multiple visualization modes, and interactive controls',
    structure: {
      requiredFiles: [
        'package.json',
        'src/main.ts',
        'src/App.vue',
        'src/components/ParticleSystem.vue',
        'src/components/ControlPanel.vue',
        'index.html',
        'vite.config.ts'
      ],
      optionalFiles: [
        'src/components/AudioManager.vue',
        'src/components/AISidebar.vue',
        'README.md',
        'tsconfig.node.json'
      ],
      dependencies: {
        'vue': '^3.4.0',
        'three': '^0.160.0',
        '@types/three': '^0.160.0',
        'vue-router': '^4.2.0'
      },
      devDependencies: {
        '@vitejs/plugin-vue': '^5.0.0',
        'typescript': '^5.3.0',
        'vite': '^5.0.0',
        'vue-tsc': '^1.8.0'
      },
      scripts: {
        'dev': 'vite',
        'build': 'vue-tsc && vite build',
        'preview': 'vite preview'
      }
    },
    codePatterns: [
      {
        file: 'src/App.vue',
        patterns: [
          'import ParticleSystem from \'./components/ParticleSystem.vue\'',
          'const audioContext = ref<AudioContext | null>(null)',
          'const analyser = ref<AnalyserNode | null>(null)',
          'getUserMedia({ audio: true })',
          'audioContext.value = new AudioContext()',
          'analyser.value = audioContext.value.createAnalyser()',
          'analyser.value.getByteFrequencyData(audioData.value)',
          'onMounted(async () => { await initializeAudio() })'
        ],
        antiPatterns: [
          'TODO',
          'FIXME',
          'implement this',
          'console.log(\'temp\')'
        ]
      },
      {
        file: 'src/components/ParticleSystem.vue',
        patterns: [
          'import * as THREE from \'three\'',
          'const scene = new THREE.Scene()',
          'const camera = new THREE.PerspectiveCamera(',
          'const renderer = new THREE.WebGLRenderer({ antialias: true })',
          'new THREE.BufferGeometry()',
          'new THREE.PointsMaterial({',
          'vertexColors: true',
          'requestAnimationFrame(animate)',
          'geometry.setAttribute(\'position\', new THREE.BufferAttribute(positions, 3))',
          'geometry.setAttribute(\'color\', new THREE.BufferAttribute(colors, 3))'
        ],
        antiPatterns: [
          'TODO: implement particles',
          'FIXME: add Three.js',
          'console.log(\'debug\')'
        ]
      },
      {
        file: 'package.json',
        patterns: [
          '"three": "^0.160.0"',
          '"@types/three": "^0.160.0"',
          '"vue": "^3.4.0"'
        ],
        antiPatterns: []
      }
    ],
    launchConfig: {
      command: 'npm run dev',
      port: 5173,
      needsBuild: false,
      staticServer: false
    },
    qualityChecks: [
      'All Vue components use Composition API properly',
      'Three.js scene, camera, and renderer are properly initialized',
      'Web Audio API is implemented with proper error handling',
      'Particle system uses GPU-accelerated BufferGeometry',
      'Real-time audio analysis updates particle behavior',
      'Multiple visualization modes are implemented',
      'UI controls are fully functional',
      'No console.log statements in production code',
      'Proper TypeScript interfaces for all complex objects',
      'Memory cleanup in onUnmounted hooks'
    ],
    successCriteria: [
      'Application starts without errors',
      'Audio permission request works properly',
      '25,000+ particles render at 60fps',
      'Audio input affects particle behavior in real-time',
      'All three visualization modes work (Breath, Music, Fireworks)',
      'Control panel sliders update particle parameters',
      'Fullscreen mode works correctly',
      'No WebGL or audio context errors',
      'Responsive design works on different screen sizes',
      'All UI interactions are smooth and responsive'
    ]
  }
};

export class ProjectPatternMatcher {
  /**
   * Detect what type of project is being built based on files and content
   */
  static detectProjectType(files: string[], packageJson?: any): string | null {
    // Check package.json dependencies first (most reliable)
    if (packageJson?.dependencies) {
      // Game frameworks
      if (packageJson.dependencies.phaser) {
        return 'phaser_game';
      }
      if (packageJson.dependencies['pixi.js'] || packageJson.dependencies.pixi) {
        return 'pixi_game';
      }
      
      // 3D frameworks
      if (packageJson.dependencies.three || packageJson.dependencies['@types/three']) {
        return 'threejs_viewer';
      }
      
      // Web frameworks
      if (packageJson.dependencies.express) {
        return 'express_api';
      }
      if (packageJson.dependencies.react || packageJson.dependencies['react-dom']) {
        // Check if it's a Vite project
        if (packageJson.devDependencies?.vite || packageJson.dependencies?.vite) {
          return 'react_vite';
        }
        return 'react_vite'; // Default React projects to Vite pattern (modern standard)
      }
      if (packageJson.dependencies.vue) {
        return 'vue';
      }
    }
    
    // Check file patterns
    if (files.includes('game.js') || files.includes('Game.js')) {
      return 'html_game';
    }
    
    if (files.includes('script.js') && files.includes('index.html')) {
      // Could be Three.js or game
      return 'threejs_viewer'; // Default to Three.js if unclear
    }
    
    if (files.includes('server.js') && !files.includes('client')) {
      return 'express_api';
    }
    
    if (files.includes('app.js') && files.includes('index.html')) {
      // Could be PixiJS or generic
      return 'pixi_game';
    }
    
    // Check for Python projects
    const hasPyFiles = files.some(f => f.endsWith('.py'));
    if (hasPyFiles) {
      // Check requirements.txt for FastAPI
      if (files.includes('requirements.txt')) {
        try {
          const fs = require('fs');
          const path = require('path');
          const reqPath = path.join(process.cwd(), 'requirements.txt');
          if (fs.existsSync(reqPath)) {
            const reqContent = fs.readFileSync(reqPath, 'utf-8').toLowerCase();
            if (reqContent.includes('fastapi')) {
              return 'python_fastapi';
            }
          }
        } catch (e) {
          // Ignore
        }
      }
      return 'python_script';
    }
    
    return null;
  }
  
  /**
   * Detect project type from user message/task description
   * More intelligent keyword matching for better scaffolding
   */
  static detectFromMessage(message: string): string | null {
    const lower = message.toLowerCase();
    
    // Game frameworks (check specific first)
    if (lower.includes('phaser') || lower.includes('phaser.js') || lower.includes('phaserjs')) {
      return 'phaser_game';
    }
    if (lower.includes('pixi') || lower.includes('pixi.js') || lower.includes('pixijs')) {
      return 'pixi_game';
    }
    
    const mentionsThreeJs = lower.includes('three.js') || lower.includes('threejs');
    const wantsPlatformer =
      lower.includes('side scroller') ||
      lower.includes('sidescroller') ||
      lower.includes('platformer') ||
      lower.includes('jump') ||
      lower.includes('wasd');

    // 3D
    if (mentionsThreeJs && wantsPlatformer) {
      return 'threejs_platformer';
    }
    if (mentionsThreeJs || lower.includes('3d scene') || lower.includes('3d viewer')) {
      return 'threejs_viewer';
    }
    
    // General game detection - suggest Phaser for arcade-style games
    if (lower.includes('game')) {
      // Arcade-style keywords suggest Phaser
      if (lower.includes('platformer') || lower.includes('shooter') || lower.includes('arcade') ||
          lower.includes('ball') || lower.includes('paddle') || lower.includes('player') ||
          lower.includes('enemy') || lower.includes('sprite') || lower.includes('physics') ||
          lower.includes('jump') || lower.includes('collision')) {
        return 'phaser_game';
      }
      // Simple games can use vanilla canvas
      return 'html_game';
    }
    
    // Canvas-based
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
    
    // Frontend frameworks
    if (lower.includes('react') || lower.includes('tsx') || lower.includes('jsx')) {
      return 'react_vite'; // Default to Vite (modern standard)
    }
    if (lower.includes('vue')) {
      return 'vue';
    }
    
    // Generic component/todo/app requests often imply React
    if ((lower.includes('component') || lower.includes('todo') || lower.includes('app')) && 
        (lower.includes('typescript') || lower.includes('.tsx'))) {
      return 'react_vite';
    }
    
    return null;
  }
  
  /**
   * Get the pattern for a project type
   */
  static getPattern(type: string): ProjectPattern | null {
    return PROJECT_PATTERNS[type] || null;
  }
  
  /**
   * Get quality checklist for a project type
   */
  static getQualityChecks(type: string): string[] {
    const pattern = this.getPattern(type);
    return pattern?.qualityChecks || [];
  }
  
  /**
   * Get success criteria for a project type
   */
  static getSuccessCriteria(type: string): string[] {
    const pattern = this.getPattern(type);
    return pattern?.successCriteria || [];
  }
  
  /**
   * Validate a file against its pattern
   */
  static validateFile(filePath: string, content: string, pattern: ProjectPattern): {
    valid: boolean;
    issues: string[];
    missingPatterns: string[];
  } {
    const issues: string[] = [];
    const missingPatterns: string[] = [];
    
    const filePattern = pattern.codePatterns.find(p => 
      filePath.includes(p.file) || filePath.endsWith(p.file)
    );
    
    if (!filePattern) {
      return { valid: true, issues: [], missingPatterns: [] };
    }
    
    // Check for anti-patterns
    for (const antiPattern of filePattern.antiPatterns) {
      if (antiPattern.includes('Incomplete arrow functions')) {
        if (content.match(/\([^)]+\)\s*=>\s*\)/g)) {
          issues.push('Incomplete arrow functions detected');
        }
      }
      if (antiPattern.includes('Empty function bodies')) {
        if ((content.match(/\w+\s*\([^)]*\)\s*{\s*}/g)?.length ?? 0) > 2) {
          issues.push('Multiple empty function bodies');
        }
      }
    }
    
    // Check for required patterns (simplified - just check key indicators)
    for (const requiredPattern of filePattern.patterns) {
      if (requiredPattern.includes('Complete function bodies')) {
        // Check if there are incomplete functions
        if (content.match(/=>\s*[);,]/g)) {
          missingPatterns.push('Some functions are incomplete');
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
      missingPatterns
    };
  }
  
  /**
   * Generate guidance for building a specific project type
   */
  static generateGuidance(type: string): string {
    const pattern = this.getPattern(type);
    if (!pattern) {
      return '';
    }
    
    let guidance = `\n\n## PROJECT TYPE: ${pattern.name}\n`;
    guidance += `${pattern.description}\n\n`;
    
    guidance += `### Required Files:\n`;
    for (const file of pattern.structure.requiredFiles) {
      guidance += `- ${file}\n`;
    }
    
    guidance += `\n### Code Quality Requirements:\n`;
    for (const check of pattern.qualityChecks) {
      guidance += `- ✅ ${check}\n`;
    }
    
    guidance += `\n### Success Criteria (must ALL pass before marking done):\n`;
    for (const criteria of pattern.successCriteria) {
      guidance += `- ✅ ${criteria}\n`;
    }
    
    guidance += `\n### Common Mistakes to Avoid:\n`;
    for (const codePattern of pattern.codePatterns) {
      for (const antiPattern of codePattern.antiPatterns) {
        guidance += `- ❌ ${antiPattern}\n`;
      }
    }
    
    return guidance;
  }
}

