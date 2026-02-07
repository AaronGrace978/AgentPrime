/**
 * Project Chapters System
 * 
 * Breaks large projects into manageable "chapters" to avoid token limits
 * and enable incremental, resumable project development.
 * 
 * Key Features:
 * - Automatic project decomposition into chapters
 * - State persistence between sessions
 * - Resume from where you left off
 * - Progress tracking
 * - Token-aware chunking
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectChapter {
  id: string;
  number: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  estimatedTokens: number;
  dependencies: string[];  // IDs of chapters that must complete first
  deliverables: string[];  // Files/features to be created
  tasks: ChapterTask[];
  startedAt?: Date;
  completedAt?: Date;
  notes?: string;
}

export interface ChapterTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  type: 'file' | 'feature' | 'config' | 'test' | 'docs';
  filePath?: string;
  completedAt?: Date;
}

export interface ProjectPlan {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'planning' | 'in_progress' | 'completed' | 'paused';
  workspacePath: string;
  chapters: ProjectChapter[];
  currentChapter: number;
  totalChapters: number;
  completedChapters: number;
  tokenBudgetPerChapter: number;
  metadata: {
    projectType: string;
    complexity: 'simple' | 'medium' | 'complex' | 'enterprise';
    estimatedTotalTokens: number;
    tags: string[];
  };
}

// ============================================================================
// PROJECT CHAPTER MANAGER
// ============================================================================

export class ProjectChapterManager {
  private dataDir: string;
  private currentPlan: ProjectPlan | null = null;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data', 'project-chapters');
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // ============================================================================
  // PLAN CREATION
  // ============================================================================

  /**
   * Create a new project plan from a description
   */
  createPlan(
    name: string,
    description: string,
    workspacePath: string,
    options: {
      projectType?: string;
      complexity?: 'simple' | 'medium' | 'complex' | 'enterprise';
      tokenBudgetPerChapter?: number;
    } = {}
  ): ProjectPlan {
    const plan: ProjectPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'planning',
      workspacePath,
      chapters: [],
      currentChapter: 0,
      totalChapters: 0,
      completedChapters: 0,
      tokenBudgetPerChapter: options.tokenBudgetPerChapter || 8000, // Conservative default
      metadata: {
        projectType: options.projectType || 'unknown',
        complexity: options.complexity || 'medium',
        estimatedTotalTokens: 0,
        tags: []
      }
    };

    this.currentPlan = plan;
    this.savePlan(plan);
    console.log(`[Chapters] Created plan: ${plan.id} - ${name}`);
    return plan;
  }

  /**
   * Decompose a project into chapters based on complexity
   */
  decomposeProject(
    plan: ProjectPlan,
    components: {
      title: string;
      description: string;
      deliverables: string[];
      estimatedComplexity: 'low' | 'medium' | 'high';
      dependencies?: string[];
    }[]
  ): ProjectPlan {
    const tokenEstimates: Record<string, number> = {
      low: 2000,
      medium: 5000,
      high: 10000
    };

    // Sort components by dependencies (topological sort)
    const sortedComponents = this.topologicalSort(components);

    // Create chapters, potentially splitting high-complexity items
    const chapters: ProjectChapter[] = [];
    let chapterNumber = 1;

    for (const component of sortedComponents) {
      const estimatedTokens = tokenEstimates[component.estimatedComplexity] || 5000;
      
      // If estimated tokens exceed budget, split into sub-chapters
      if (estimatedTokens > plan.tokenBudgetPerChapter) {
        const subChapters = this.splitIntoSubChapters(
          component,
          plan.tokenBudgetPerChapter,
          chapterNumber
        );
        chapters.push(...subChapters);
        chapterNumber += subChapters.length;
      } else {
        chapters.push({
          id: `chapter-${chapterNumber}`,
          number: chapterNumber,
          title: component.title,
          description: component.description,
          status: 'pending',
          estimatedTokens,
          dependencies: component.dependencies || [],
          deliverables: component.deliverables,
          tasks: component.deliverables.map((d, i) => ({
            id: `task-${chapterNumber}-${i + 1}`,
            description: `Create ${d}`,
            status: 'pending' as const,
            type: this.inferTaskType(d),
            filePath: d
          }))
        });
        chapterNumber++;
      }
    }

    plan.chapters = chapters;
    plan.totalChapters = chapters.length;
    plan.metadata.estimatedTotalTokens = chapters.reduce((sum, c) => sum + c.estimatedTokens, 0);
    plan.updatedAt = new Date();
    
    this.currentPlan = plan;
    this.savePlan(plan);
    
    console.log(`[Chapters] Decomposed into ${chapters.length} chapters`);
    return plan;
  }

  /**
   * Auto-decompose a project description into chapters using heuristics
   */
  autoDecompose(plan: ProjectPlan): ProjectPlan {
    const description = plan.description.toLowerCase();
    const components: Parameters<typeof this.decomposeProject>[1] = [];

    // Chapter 1: Project Setup (always first)
    components.push({
      title: 'Project Setup & Configuration',
      description: 'Initialize project structure, package.json, configs, and dependencies',
      deliverables: ['package.json', 'tsconfig.json', '.gitignore', 'README.md'],
      estimatedComplexity: 'low',
      dependencies: []
    });

    // Detect and add feature-specific chapters
    if (description.includes('react') || description.includes('frontend') || description.includes('ui')) {
      components.push({
        title: 'Core UI Components',
        description: 'Create the main React/UI components and layout',
        deliverables: ['src/App.tsx', 'src/components/', 'src/styles/'],
        estimatedComplexity: 'medium',
        dependencies: ['chapter-1']
      });
    }

    if (description.includes('api') || description.includes('backend') || description.includes('server')) {
      components.push({
        title: 'Backend API Setup',
        description: 'Create API endpoints, routes, and middleware',
        deliverables: ['src/api/', 'src/routes/', 'src/middleware/'],
        estimatedComplexity: 'medium',
        dependencies: ['chapter-1']
      });
    }

    if (description.includes('database') || description.includes('data') || description.includes('storage')) {
      components.push({
        title: 'Data Layer',
        description: 'Set up database models, schemas, and data access',
        deliverables: ['src/models/', 'src/database/', 'migrations/'],
        estimatedComplexity: 'medium',
        dependencies: ['chapter-1']
      });
    }

    if (description.includes('auth') || description.includes('login') || description.includes('user')) {
      components.push({
        title: 'Authentication & Authorization',
        description: 'Implement user authentication, sessions, and permissions',
        deliverables: ['src/auth/', 'src/middleware/auth.ts'],
        estimatedComplexity: 'high',
        dependencies: ['chapter-1']
      });
    }

    if (description.includes('game') || description.includes('canvas') || description.includes('animation')) {
      components.push({
        title: 'Game/Canvas Core',
        description: 'Set up game loop, canvas rendering, and core mechanics',
        deliverables: ['src/game/', 'src/engine/'],
        estimatedComplexity: 'high',
        dependencies: ['chapter-1']
      });
    }

    // Chapter: Core Logic (always needed)
    components.push({
      title: 'Core Business Logic',
      description: 'Implement the main functionality and features',
      deliverables: ['src/core/', 'src/services/', 'src/utils/'],
      estimatedComplexity: 'high',
      dependencies: components.slice(1).map((_, i) => `chapter-${i + 2}`)
    });

    // Chapter: Integration & Polish
    components.push({
      title: 'Integration & Polish',
      description: 'Connect all parts, add error handling, and polish UX',
      deliverables: ['Integration tests', 'Error handling', 'Loading states'],
      estimatedComplexity: 'medium',
      dependencies: [`chapter-${components.length}`]
    });

    // Chapter: Testing (if complex)
    if (plan.metadata.complexity === 'complex' || plan.metadata.complexity === 'enterprise') {
      components.push({
        title: 'Testing & Documentation',
        description: 'Write tests and documentation',
        deliverables: ['tests/', 'docs/', 'README.md updates'],
        estimatedComplexity: 'medium',
        dependencies: [`chapter-${components.length}`]
      });
    }

    return this.decomposeProject(plan, components);
  }

  // ============================================================================
  // CHAPTER MANAGEMENT
  // ============================================================================

  /**
   * Get the current chapter to work on
   */
  getCurrentChapter(): ProjectChapter | null {
    if (!this.currentPlan) return null;
    
    // Find first non-completed chapter whose dependencies are met
    for (const chapter of this.currentPlan.chapters) {
      if (chapter.status === 'completed') continue;
      
      const depsComplete = chapter.dependencies.every(depId => {
        const dep = this.currentPlan!.chapters.find(c => c.id === depId);
        return dep?.status === 'completed';
      });
      
      if (depsComplete) {
        return chapter;
      }
    }
    
    return null;
  }

  /**
   * Start working on a chapter
   */
  startChapter(chapterId: string): ProjectChapter | null {
    if (!this.currentPlan) return null;
    
    const chapter = this.currentPlan.chapters.find(c => c.id === chapterId);
    if (!chapter) return null;
    
    chapter.status = 'in_progress';
    chapter.startedAt = new Date();
    this.currentPlan.status = 'in_progress';
    this.currentPlan.currentChapter = chapter.number;
    this.currentPlan.updatedAt = new Date();
    
    this.savePlan(this.currentPlan);
    console.log(`[Chapters] Started: ${chapter.title}`);
    return chapter;
  }

  /**
   * Complete a chapter
   */
  completeChapter(chapterId: string, notes?: string): ProjectChapter | null {
    if (!this.currentPlan) return null;
    
    const chapter = this.currentPlan.chapters.find(c => c.id === chapterId);
    if (!chapter) return null;
    
    chapter.status = 'completed';
    chapter.completedAt = new Date();
    if (notes) chapter.notes = notes;
    
    // Mark all tasks as completed
    chapter.tasks.forEach(task => {
      if (task.status !== 'skipped') {
        task.status = 'completed';
        task.completedAt = new Date();
      }
    });
    
    this.currentPlan.completedChapters++;
    this.currentPlan.updatedAt = new Date();
    
    // Check if project is complete
    if (this.currentPlan.completedChapters >= this.currentPlan.totalChapters) {
      this.currentPlan.status = 'completed';
    }
    
    this.savePlan(this.currentPlan);
    console.log(`[Chapters] Completed: ${chapter.title} (${this.currentPlan.completedChapters}/${this.currentPlan.totalChapters})`);
    return chapter;
  }

  /**
   * Complete a specific task within a chapter
   */
  completeTask(chapterId: string, taskId: string): ChapterTask | null {
    if (!this.currentPlan) return null;
    
    const chapter = this.currentPlan.chapters.find(c => c.id === chapterId);
    if (!chapter) return null;
    
    const task = chapter.tasks.find(t => t.id === taskId);
    if (!task) return null;
    
    task.status = 'completed';
    task.completedAt = new Date();
    this.currentPlan.updatedAt = new Date();
    
    // Check if all tasks are complete
    const allComplete = chapter.tasks.every(t => t.status === 'completed' || t.status === 'skipped');
    if (allComplete && chapter.status !== 'completed') {
      this.completeChapter(chapterId);
    } else {
      this.savePlan(this.currentPlan);
    }
    
    return task;
  }

  /**
   * Get chapter summary for context injection
   */
  getChapterContext(chapterId: string): string {
    if (!this.currentPlan) return '';
    
    const chapter = this.currentPlan.chapters.find(c => c.id === chapterId);
    if (!chapter) return '';
    
    const completedChapters = this.currentPlan.chapters
      .filter(c => c.status === 'completed')
      .map(c => `- ${c.title}: ${c.deliverables.join(', ')}`);
    
    return `
## Project Context

**Project:** ${this.currentPlan.name}
**Current Chapter:** ${chapter.number}/${this.currentPlan.totalChapters} - ${chapter.title}

### Completed So Far:
${completedChapters.length > 0 ? completedChapters.join('\n') : '(Starting fresh)'}

### Current Chapter Goals:
${chapter.description}

### Deliverables for This Chapter:
${chapter.deliverables.map(d => `- ${d}`).join('\n')}

### Tasks:
${chapter.tasks.map(t => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.description}`).join('\n')}

**Token Budget:** ~${chapter.estimatedTokens} tokens
**Focus on completing THIS chapter only. Do not work on future chapters.**
`;
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Save plan to disk
   */
  savePlan(plan: ProjectPlan): void {
    const filePath = path.join(this.dataDir, `${plan.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(plan, null, 2), 'utf-8');
  }

  /**
   * Load plan from disk
   */
  loadPlan(planId: string): ProjectPlan | null {
    const filePath = path.join(this.dataDir, `${planId}.json`);
    if (!fs.existsSync(filePath)) return null;
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.currentPlan = data;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Load plan by workspace path
   */
  loadPlanByWorkspace(workspacePath: string): ProjectPlan | null {
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
        if (data.workspacePath === workspacePath && data.status !== 'completed') {
          this.currentPlan = data;
          return data;
        }
      } catch {
        continue;
      }
    }
    
    return null;
  }

  /**
   * List all plans
   */
  listPlans(): ProjectPlan[] {
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    const plans: ProjectPlan[] = [];
    
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
        plans.push(data);
      } catch {
        continue;
      }
    }
    
    return plans.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get progress summary
   */
  getProgress(): {
    plan: string;
    status: string;
    completed: number;
    total: number;
    percentage: number;
    currentChapter: string;
    nextSteps: string[];
  } | null {
    if (!this.currentPlan) return null;
    
    const current = this.getCurrentChapter();
    const percentage = Math.round((this.currentPlan.completedChapters / this.currentPlan.totalChapters) * 100);
    
    return {
      plan: this.currentPlan.name,
      status: this.currentPlan.status,
      completed: this.currentPlan.completedChapters,
      total: this.currentPlan.totalChapters,
      percentage,
      currentChapter: current ? `${current.number}. ${current.title}` : 'Complete!',
      nextSteps: current ? current.tasks.filter(t => t.status === 'pending').map(t => t.description).slice(0, 3) : []
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private topologicalSort(
    components: {
      title: string;
      description: string;
      deliverables: string[];
      estimatedComplexity: 'low' | 'medium' | 'high';
      dependencies?: string[];
    }[]
  ): typeof components {
    // Simple sort - components with fewer dependencies come first
    return [...components].sort((a, b) => 
      (a.dependencies?.length || 0) - (b.dependencies?.length || 0)
    );
  }

  private splitIntoSubChapters(
    component: { title: string; description: string; deliverables: string[]; estimatedComplexity: string },
    budgetPerChapter: number,
    startNumber: number
  ): ProjectChapter[] {
    const chapters: ProjectChapter[] = [];
    const itemsPerChapter = Math.ceil(component.deliverables.length / 2);
    
    for (let i = 0; i < component.deliverables.length; i += itemsPerChapter) {
      const subDeliverables = component.deliverables.slice(i, i + itemsPerChapter);
      const partNumber = Math.floor(i / itemsPerChapter) + 1;
      
      chapters.push({
        id: `chapter-${startNumber + chapters.length}`,
        number: startNumber + chapters.length,
        title: `${component.title} (Part ${partNumber})`,
        description: component.description,
        status: 'pending',
        estimatedTokens: budgetPerChapter,
        dependencies: chapters.length > 0 ? [`chapter-${startNumber + chapters.length - 1}`] : [],
        deliverables: subDeliverables,
        tasks: subDeliverables.map((d, j) => ({
          id: `task-${startNumber + chapters.length}-${j + 1}`,
          description: `Create ${d}`,
          status: 'pending' as const,
          type: this.inferTaskType(d),
          filePath: d
        }))
      });
    }
    
    return chapters;
  }

  private inferTaskType(deliverable: string): ChapterTask['type'] {
    const lower = deliverable.toLowerCase();
    if (lower.includes('test') || lower.includes('spec')) return 'test';
    if (lower.includes('doc') || lower.includes('readme')) return 'docs';
    if (lower.includes('config') || lower.includes('.json') || lower.includes('.yaml')) return 'config';
    if (lower.includes('/') || lower.includes('.')) return 'file';
    return 'feature';
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let chapterManager: ProjectChapterManager | null = null;

export function getChapterManager(): ProjectChapterManager {
  if (!chapterManager) {
    chapterManager = new ProjectChapterManager();
  }
  return chapterManager;
}

export function initChapterManager(dataDir?: string): ProjectChapterManager {
  chapterManager = new ProjectChapterManager(dataDir);
  return chapterManager;
}

