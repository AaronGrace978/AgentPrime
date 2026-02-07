/**
 * OPUS TRAINING CORPUS
 * =====================
 * A comprehensive collection of reasoning patterns, planning techniques,
 * and coding best practices extracted from Claude Opus 4.5's approach.
 * 
 * This corpus is designed to be ingested into the Mirror Intelligence system
 * to help the agent mirror sophisticated AI reasoning and execution patterns.
 */

export interface OpusPattern {
  id: string;
  category: 'planning' | 'coding' | 'debugging' | 'architecture' | 'verification' | 'communication';
  name: string;
  description: string;
  technique: string;
  examples?: string[];
  antiPatterns?: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export const OPUS_TRAINING_PATTERNS: OpusPattern[] = [
  // ============================================
  // PLANNING PATTERNS
  // ============================================
  {
    id: 'planning-001',
    category: 'planning',
    name: 'Context-First Planning',
    description: 'Always gather context before making changes. Read files, understand architecture, then plan.',
    technique: `Before touching any code:
1. Read the relevant files completely
2. Understand the existing patterns and conventions
3. Identify dependencies and relationships
4. Map out what needs to change
5. Only then start implementing

NEVER guess what a file contains. ALWAYS read it first.`,
    examples: [
      'Read App.tsx before adding a new component to understand imports and patterns',
      'Check existing API handlers before creating a new one to match conventions',
      'Review CSS files to understand the styling approach before adding styles'
    ],
    antiPatterns: [
      'Writing code without reading the file first',
      'Assuming file structure without verification',
      'Making changes based on memory instead of current state'
    ],
    priority: 'critical'
  },
  {
    id: 'planning-002',
    category: 'planning',
    name: 'Divide and Conquer',
    description: 'Break complex tasks into small, verifiable steps. Complete each step fully before moving on.',
    technique: `For any task with more than 2-3 changes:
1. List all discrete subtasks
2. Order them by dependency (what needs to happen first)
3. Execute one subtask at a time
4. Verify each step works before proceeding
5. Keep track of completed vs pending items

Each step should be small enough to verify independently.`,
    examples: [
      'Adding a feature: 1) Create component 2) Add to parent 3) Wire up state 4) Add styles 5) Test',
      'Fixing a bug: 1) Reproduce 2) Identify root cause 3) Fix 4) Verify 5) Check for regressions'
    ],
    antiPatterns: [
      'Trying to do everything in one massive change',
      'Moving to next step before verifying current step works',
      'Losing track of what has been done vs what remains'
    ],
    priority: 'critical'
  },
  {
    id: 'planning-003',
    category: 'planning',
    name: 'Dependency Ordering',
    description: 'Execute tasks in dependency order. Create foundations before building on them.',
    technique: `Always identify the dependency chain:
- Types/interfaces come before implementations
- Utility functions come before components that use them
- Parent components come before child components
- CSS classes come before elements that use them
- IPC handlers come before renderer code that calls them

Never reference something that doesn't exist yet.`,
    examples: [
      'Create FileItem interface before creating FileExplorer component',
      'Register IPC handler before calling it from renderer',
      'Define CSS class before using it in JSX'
    ],
    antiPatterns: [
      'Creating a component that imports a non-existent file',
      'Calling an API that hasn\'t been implemented',
      'Using a CSS class that doesn\'t exist'
    ],
    priority: 'high'
  },

  // ============================================
  // CODING PATTERNS
  // ============================================
  {
    id: 'coding-001',
    category: 'coding',
    name: 'Selector Consistency',
    description: 'HTML selectors must EXACTLY match JavaScript selectors. No exceptions.',
    technique: `When writing HTML + JavaScript:
1. Define HTML first with clear class/id names
2. Copy the EXACT selector string to JavaScript
3. Use class selector (.) for classes, id selector (#) for ids
4. Never assume naming conventions - always verify

Rule: If HTML has class="my-button", JS must use ".my-button" - NOT ".myButton" or ".my_button"`,
    examples: [
      'HTML: class="toolbar-btn" → JS: querySelector(".toolbar-btn")',
      'HTML: id="submitBtn" → JS: getElementById("submitBtn")',
      'HTML: data-action="save" → JS: element.dataset.action === "save"'
    ],
    antiPatterns: [
      'Using .toolbar button when HTML has .toolbar-btn',
      'Using camelCase in JS when HTML uses kebab-case',
      'Mixing class and ID selectors incorrectly'
    ],
    priority: 'critical'
  },
  {
    id: 'coding-002',
    category: 'coding',
    name: 'Complete File Awareness',
    description: 'When editing a file, be aware of all its imports, exports, and dependencies.',
    technique: `Before editing any file:
1. Note all imports at the top
2. Note all exports at the bottom
3. Understand the file's role in the larger system
4. Check what other files import from this one
5. Make changes that preserve the contract with other files

Never break exports that other files depend on.`,
    examples: [
      'If utils.ts exports formatDate, changing its signature affects all importers',
      'If App.tsx imports useState, ensure React is imported',
      'If a type is used elsewhere, changing it requires updating all usages'
    ],
    antiPatterns: [
      'Changing function signatures without updating callers',
      'Removing exports that are used elsewhere',
      'Adding imports that create circular dependencies'
    ],
    priority: 'high'
  },
  {
    id: 'coding-003',
    category: 'coding',
    name: 'Error Handling First',
    description: 'Handle errors at every async boundary and external interaction.',
    technique: `For every async operation or external call:
1. Wrap in try/catch
2. Handle the error case explicitly
3. Provide meaningful error messages
4. Don't let errors crash the application
5. Log errors for debugging

Pattern:
try {
  const result = await operation();
  // handle success
} catch (error) {
  console.error('[Context] Operation failed:', error);
  // handle gracefully, show user-friendly message
}`,
    examples: [
      'File operations: handle ENOENT, EACCES, etc.',
      'API calls: handle network errors, timeouts, 4xx/5xx',
      'DOM queries: handle null when element not found'
    ],
    antiPatterns: [
      'Unhandled promise rejections',
      'Empty catch blocks',
      'Generic error messages that don\'t help debugging'
    ],
    priority: 'high'
  },
  {
    id: 'coding-004',
    category: 'coding',
    name: 'Null Safety',
    description: 'Always check for null/undefined before accessing properties or calling methods.',
    technique: `Assume any external data can be null:
1. DOM queries can return null
2. API responses can have missing fields
3. Optional parameters might not be provided
4. Array accesses can be out of bounds

Use optional chaining (?.) and nullish coalescing (??) liberally.
Better to be defensive than to crash.`,
    examples: [
      'const element = document.getElementById("x"); if (element) { element.click(); }',
      'const name = user?.profile?.name ?? "Unknown"',
      'const first = array?.[0] ?? defaultValue'
    ],
    antiPatterns: [
      'Assuming DOM queries always find elements',
      'Accessing nested properties without checking',
      'Not handling undefined array elements'
    ],
    priority: 'high'
  },

  // ============================================
  // VERIFICATION PATTERNS
  // ============================================
  {
    id: 'verify-001',
    category: 'verification',
    name: 'Pre-Change Verification',
    description: 'Verify the current state matches expectations before making changes.',
    technique: `Before editing:
1. Read the file to see current state
2. Verify the code you want to change exists exactly as expected
3. Check for any recent modifications
4. Confirm you're editing the right location

If the file doesn't look like you expected, STOP and reassess.`,
    examples: [
      'Read function before modifying to ensure it has expected structure',
      'Check import exists before adding new one in same location',
      'Verify CSS selector matches before modifying styles'
    ],
    antiPatterns: [
      'Editing based on assumptions about file contents',
      'Applying changes to wrong section of file',
      'Overwriting recent changes made by user'
    ],
    priority: 'critical'
  },
  {
    id: 'verify-002',
    category: 'verification',
    name: 'Post-Change Verification',
    description: 'After making changes, verify they work as intended.',
    technique: `After every change:
1. Check for linter/TypeScript errors
2. Verify the change compiles/builds
3. Test the specific functionality
4. Check for regressions in related areas
5. If errors occur, fix them immediately

Don't move on until current change is verified working.`,
    examples: [
      'Run npm run build after code changes',
      'Check linter output for new errors',
      'Test the feature in the UI'
    ],
    antiPatterns: [
      'Making multiple changes before testing any',
      'Ignoring linter warnings',
      'Moving on without building to verify syntax'
    ],
    priority: 'high'
  },
  {
    id: 'verify-003',
    category: 'verification',
    name: 'Cross-File Consistency',
    description: 'When changing one file, verify all related files are updated.',
    technique: `Changes often span multiple files:
1. Type changes → update all usages
2. Component interface changes → update all parents
3. API changes → update all callers
4. CSS class renames → update all HTML/JSX

Use grep/search to find all affected locations.
Update all of them in a single logical change.`,
    examples: [
      'Renaming a prop → update component and all usages',
      'Adding required field to type → update all object creations',
      'Changing function signature → update all call sites'
    ],
    antiPatterns: [
      'Changing a type without updating usages',
      'Renaming in one place but not others',
      'Adding required field without providing it everywhere'
    ],
    priority: 'high'
  },

  // ============================================
  // DEBUGGING PATTERNS
  // ============================================
  {
    id: 'debug-001',
    category: 'debugging',
    name: 'Systematic Debugging',
    description: 'Debug systematically by isolating the problem, not guessing.',
    technique: `When something doesn't work:
1. Read the error message completely
2. Identify the exact line/location of failure
3. Trace back to find the root cause
4. Verify your understanding by logging
5. Fix the root cause, not symptoms

Never guess. Always trace the execution path.`,
    examples: [
      'TypeError: undefined is not a function → find what is undefined and why',
      'Module not found → check path, file exists, and exports',
      'Network error → check URL, CORS, server status'
    ],
    antiPatterns: [
      'Random changes hoping something works',
      'Ignoring error messages',
      'Fixing symptoms without understanding cause'
    ],
    priority: 'high'
  },
  {
    id: 'debug-002',
    category: 'debugging',
    name: 'Minimal Reproduction',
    description: 'Reduce the problem to its simplest form to understand it.',
    technique: `To understand a bug:
1. Find the minimal code that reproduces it
2. Remove everything non-essential
3. The smaller the reproduction, the clearer the cause
4. Once understood, apply fix to original code

Complexity hides bugs. Simplicity reveals them.`,
    examples: [
      'Component not rendering → does a simple div render?',
      'API not working → does a simple fetch work?',
      'Style not applying → does an inline style work?'
    ],
    antiPatterns: [
      'Trying to debug complex interactions first',
      'Adding more code to "fix" without understanding',
      'Not isolating the problem'
    ],
    priority: 'medium'
  },

  // ============================================
  // ARCHITECTURE PATTERNS
  // ============================================
  {
    id: 'arch-001',
    category: 'architecture',
    name: 'Single Responsibility',
    description: 'Each file, function, and component should do one thing well.',
    technique: `Keep things focused:
1. One component = one responsibility
2. One function = one operation
3. One file = one concept

If a component does multiple things, split it.
If a function is too long, break it up.
If a file is too big, extract modules.`,
    examples: [
      'FileExplorer handles files, not AI chat',
      'formatDate() formats dates, doesn\'t fetch them',
      'utils.ts has utilities, not business logic'
    ],
    antiPatterns: [
      'God components that do everything',
      'Functions with 5+ responsibilities',
      'Files with 1000+ lines of mixed concerns'
    ],
    priority: 'medium'
  },
  {
    id: 'arch-002',
    category: 'architecture',
    name: 'Convention Over Configuration',
    description: 'Follow existing patterns. Consistency trumps personal preference.',
    technique: `When adding to a codebase:
1. Find existing similar code
2. Copy the pattern exactly
3. Maintain consistency with surroundings
4. If convention exists, follow it

Your code should look like it belongs.
Future readers shouldn't be able to tell who wrote what.`,
    examples: [
      'If components use named exports, use named exports',
      'If CSS uses BEM, use BEM',
      'If functions are arrow functions, use arrow functions'
    ],
    antiPatterns: [
      'Mixing coding styles in one file',
      'Introducing new patterns without need',
      'Personal style over project convention'
    ],
    priority: 'medium'
  },
  {
    id: 'arch-003',
    category: 'architecture',
    name: 'Explicit Over Implicit',
    description: 'Make behavior explicit and obvious. Avoid magic and hidden logic.',
    technique: `Code should be self-documenting:
1. Name things clearly
2. Make dependencies explicit (imports)
3. Document non-obvious behavior
4. Prefer verbose clarity over clever brevity

If someone reads the code, they should understand it without context.`,
    examples: [
      'handleUserLogin() vs handle()',
      'isLoading vs flag',
      'MAX_RETRY_COUNT = 3 vs 3'
    ],
    antiPatterns: [
      'Single letter variable names',
      'Magic numbers without constants',
      'Implicit behavior that requires external knowledge'
    ],
    priority: 'medium'
  },

  // ============================================
  // COMMUNICATION PATTERNS
  // ============================================
  {
    id: 'comm-001',
    category: 'communication',
    name: 'Explain Then Execute',
    description: 'Before making changes, explain what you\'re going to do and why.',
    technique: `For any significant action:
1. State what you understand the goal to be
2. Explain your planned approach
3. Call out any assumptions
4. Execute the plan
5. Summarize what was done

This builds trust and catches misunderstandings early.`,
    examples: [
      '"I\'ll add the button to the header by modifying App.tsx..."',
      '"To fix this, I need to update both the component and its parent..."',
      '"I\'m assuming you want X behavior. Let me know if Y instead."'
    ],
    antiPatterns: [
      'Making changes without explaining',
      'Not confirming understanding of requirements',
      'Silent failures without communication'
    ],
    priority: 'high'
  },
  {
    id: 'comm-002',
    category: 'communication',
    name: 'Progress Transparency',
    description: 'Keep the user informed of progress, blockers, and decisions.',
    technique: `During execution:
1. Indicate when starting a major step
2. Report completion of milestones
3. Flag any blockers or uncertainties
4. Explain decisions that might not be obvious
5. Provide summary at the end

The user should never wonder what's happening.`,
    examples: [
      '"Step 1 complete. Moving to step 2..."',
      '"I found an issue: X. Addressing it by doing Y."',
      '"Done! Here\'s what changed: ..."'
    ],
    antiPatterns: [
      'Long silences during complex work',
      'Surprising the user with unexpected changes',
      'Not explaining reasoning behind decisions'
    ],
    priority: 'medium'
  }
];

/**
 * Get all patterns as ingestible text for the mirror system
 */
export function getOpusTrainingCorpus(): string {
  let corpus = `# OPUS 4.5 TRAINING CORPUS
## AI Reasoning and Execution Patterns

This corpus contains patterns extracted from Claude Opus 4.5's approach to:
- Planning complex tasks
- Writing quality code
- Avoiding common mistakes
- Debugging issues systematically
- Communicating effectively

---

`;

  // Group by category
  const categories = ['planning', 'coding', 'verification', 'debugging', 'architecture', 'communication'];
  
  for (const category of categories) {
    const patterns = OPUS_TRAINING_PATTERNS.filter(p => p.category === category);
    
    corpus += `## ${category.toUpperCase()} PATTERNS\n\n`;
    
    for (const pattern of patterns) {
      corpus += `### ${pattern.name} [${pattern.priority.toUpperCase()}]\n`;
      corpus += `**Description:** ${pattern.description}\n\n`;
      corpus += `**Technique:**\n${pattern.technique}\n\n`;
      
      if (pattern.examples && pattern.examples.length > 0) {
        corpus += `**Examples:**\n`;
        pattern.examples.forEach(ex => {
          corpus += `- ${ex}\n`;
        });
        corpus += '\n';
      }
      
      if (pattern.antiPatterns && pattern.antiPatterns.length > 0) {
        corpus += `**Anti-Patterns (AVOID):**\n`;
        pattern.antiPatterns.forEach(ap => {
          corpus += `- ❌ ${ap}\n`;
        });
        corpus += '\n';
      }
      
      corpus += '---\n\n';
    }
  }

  return corpus;
}

/**
 * Get patterns by priority for quick reference
 */
export function getCriticalPatterns(): OpusPattern[] {
  return OPUS_TRAINING_PATTERNS.filter(p => p.priority === 'critical');
}

/**
 * Get patterns by category
 */
export function getPatternsByCategory(category: OpusPattern['category']): OpusPattern[] {
  return OPUS_TRAINING_PATTERNS.filter(p => p.category === category);
}

export default OPUS_TRAINING_PATTERNS;

