/**
 * Chapter Tool - AI interface for the Project Chapters system
 * Allows the AI to create, manage, and navigate project chapters
 */

import { BaseTool } from './base-tool';
import { 
  getChapterManager, 
  ProjectPlan, 
  ProjectChapter 
} from '../agent/project-chapters';

/**
 * Create Project Plan Tool
 */
export class CreateProjectPlanTool extends BaseTool {
  constructor() {
    super(
      'create_project_plan',
      'Create a new project plan that breaks a complex project into manageable chapters. Use this for large projects to avoid token limits.',
      {
        name: {
          type: 'string',
          required: true,
          description: 'Name of the project'
        },
        description: {
          type: 'string',
          required: true,
          description: 'Full description of what the project should do'
        },
        complexity: {
          type: 'string',
          required: false,
          description: 'Project complexity: "simple", "medium", "complex", "enterprise" (default: auto-detect)'
        },
        projectType: {
          type: 'string',
          required: false,
          description: 'Type of project: "web", "api", "game", "cli", "library", etc.'
        },
        tokenBudget: {
          type: 'number',
          required: false,
          description: 'Max tokens per chapter (default: 8000)'
        }
      }
    );
  }

  async execute(args: {
    name: string;
    description: string;
    complexity?: 'simple' | 'medium' | 'complex' | 'enterprise';
    projectType?: string;
    tokenBudget?: number;
  }): Promise<{
    success: boolean;
    plan: ProjectPlan | null;
    summary: string;
  }> {
    const { name, description, complexity, projectType, tokenBudget } = args;
    
    console.log(`[ChapterTool] Creating project plan: ${name}`);
    
    const manager = getChapterManager();
    const workspacePath = process.cwd();
    
    // Create the plan
    const plan = manager.createPlan(name, description, workspacePath, {
      complexity: complexity || 'medium',
      projectType: projectType || 'unknown',
      tokenBudgetPerChapter: tokenBudget || 8000
    });
    
    // Auto-decompose into chapters
    const decomposed = manager.autoDecompose(plan);
    
    const summary = `
📋 Project Plan Created: "${name}"

📊 Overview:
- Total Chapters: ${decomposed.totalChapters}
- Complexity: ${decomposed.metadata.complexity}
- Estimated Total Tokens: ${decomposed.metadata.estimatedTotalTokens.toLocaleString()}
- Token Budget Per Chapter: ${decomposed.tokenBudgetPerChapter.toLocaleString()}

📚 Chapters:
${decomposed.chapters.map((c, i) => `  ${i + 1}. ${c.title} (~${c.estimatedTokens} tokens)`).join('\n')}

✅ Ready to start! Use 'start_chapter' to begin Chapter 1.
`;
    
    return {
      success: true,
      plan: decomposed,
      summary
    };
  }
}

/**
 * Start Chapter Tool
 */
export class StartChapterTool extends BaseTool {
  constructor() {
    super(
      'start_chapter',
      'Start working on a specific chapter. Returns the chapter context and tasks to complete.',
      {
        chapterId: {
          type: 'string',
          required: false,
          description: 'Chapter ID to start (default: next available chapter)'
        }
      }
    );
  }

  async execute(args: { chapterId?: string }): Promise<{
    success: boolean;
    chapter: ProjectChapter | null;
    context: string;
    tasks: string[];
  }> {
    const manager = getChapterManager();
    
    let chapter: ProjectChapter | null = null;
    
    if (args.chapterId) {
      chapter = manager.startChapter(args.chapterId);
    } else {
      // Get and start the next available chapter
      chapter = manager.getCurrentChapter();
      if (chapter) {
        chapter = manager.startChapter(chapter.id);
      }
    }
    
    if (!chapter) {
      return {
        success: false,
        chapter: null,
        context: 'No chapter available to start. Create a project plan first or all chapters are complete.',
        tasks: []
      };
    }
    
    const context = manager.getChapterContext(chapter.id);
    const tasks = chapter.tasks
      .filter(t => t.status === 'pending')
      .map(t => t.description);
    
    console.log(`[ChapterTool] Started chapter: ${chapter.title}`);
    
    return {
      success: true,
      chapter,
      context,
      tasks
    };
  }
}

/**
 * Complete Chapter Tool
 */
export class CompleteChapterTool extends BaseTool {
  constructor() {
    super(
      'complete_chapter',
      'Mark a chapter as complete. Call this when all deliverables for the chapter are done.',
      {
        chapterId: {
          type: 'string',
          required: true,
          description: 'Chapter ID to complete'
        },
        notes: {
          type: 'string',
          required: false,
          description: 'Optional notes about what was accomplished'
        }
      }
    );
  }

  async execute(args: { chapterId: string; notes?: string }): Promise<{
    success: boolean;
    message: string;
    progress: any;
    nextChapter: ProjectChapter | null;
  }> {
    const manager = getChapterManager();
    
    const chapter = manager.completeChapter(args.chapterId, args.notes);
    
    if (!chapter) {
      return {
        success: false,
        message: 'Chapter not found',
        progress: null,
        nextChapter: null
      };
    }
    
    const progress = manager.getProgress();
    const nextChapter = manager.getCurrentChapter();
    
    const message = nextChapter
      ? `✅ Chapter "${chapter.title}" complete! Progress: ${progress?.percentage}%\n\n🔜 Next: ${nextChapter.title}`
      : `🎉 All chapters complete! Project finished!`;
    
    return {
      success: true,
      message,
      progress,
      nextChapter
    };
  }
}

/**
 * Complete Task Tool
 */
export class CompleteTaskTool extends BaseTool {
  constructor() {
    super(
      'complete_task',
      'Mark a specific task within a chapter as complete.',
      {
        chapterId: {
          type: 'string',
          required: true,
          description: 'Chapter ID containing the task'
        },
        taskId: {
          type: 'string',
          required: true,
          description: 'Task ID to complete'
        }
      }
    );
  }

  async execute(args: { chapterId: string; taskId: string }): Promise<{
    success: boolean;
    message: string;
  }> {
    const manager = getChapterManager();
    const task = manager.completeTask(args.chapterId, args.taskId);
    
    if (!task) {
      return { success: false, message: 'Task not found' };
    }
    
    return {
      success: true,
      message: `✅ Task completed: ${task.description}`
    };
  }
}

/**
 * Get Project Progress Tool
 */
export class GetProjectProgressTool extends BaseTool {
  constructor() {
    super(
      'get_project_progress',
      'Get the current progress of the project plan, including completed chapters and next steps.',
      {}
    );
  }

  async execute(): Promise<{
    hasActivePlan: boolean;
    progress: any;
    currentChapter: ProjectChapter | null;
    summary: string;
  }> {
    const manager = getChapterManager();
    const progress = manager.getProgress();
    const currentChapter = manager.getCurrentChapter();
    
    if (!progress) {
      return {
        hasActivePlan: false,
        progress: null,
        currentChapter: null,
        summary: 'No active project plan. Use create_project_plan to start a new project.'
      };
    }
    
    const summary = `
📊 Project Progress: ${progress.plan}

Status: ${progress.status}
Progress: ${progress.completed}/${progress.total} chapters (${progress.percentage}%)
${'█'.repeat(Math.floor(progress.percentage / 5))}${'░'.repeat(20 - Math.floor(progress.percentage / 5))}

Current Chapter: ${progress.currentChapter}

Next Steps:
${progress.nextSteps.map(s => `  • ${s}`).join('\n') || '  (All tasks complete!)'}
`;
    
    return {
      hasActivePlan: true,
      progress,
      currentChapter,
      summary
    };
  }
}

/**
 * Resume Project Tool
 */
export class ResumeProjectTool extends BaseTool {
  constructor() {
    super(
      'resume_project',
      'Resume an existing project plan. Use this to continue working on a project from a previous session.',
      {
        workspacePath: {
          type: 'string',
          required: false,
          description: 'Workspace path to find the project plan (default: current directory)'
        }
      }
    );
  }

  async execute(args: { workspacePath?: string }): Promise<{
    success: boolean;
    plan: ProjectPlan | null;
    summary: string;
  }> {
    const manager = getChapterManager();
    const workspacePath = args.workspacePath || process.cwd();
    
    const plan = manager.loadPlanByWorkspace(workspacePath);
    
    if (!plan) {
      return {
        success: false,
        plan: null,
        summary: 'No active project plan found for this workspace. Use create_project_plan to start a new project.'
      };
    }
    
    const progress = manager.getProgress();
    const currentChapter = manager.getCurrentChapter();
    
    const summary = `
🔄 Resumed Project: "${plan.name}"

Progress: ${progress?.completed}/${progress?.total} chapters (${progress?.percentage}%)

${currentChapter ? `
📖 Current Chapter: ${currentChapter.number}. ${currentChapter.title}
${currentChapter.description}

Remaining Tasks:
${currentChapter.tasks.filter(t => t.status === 'pending').map(t => `  • ${t.description}`).join('\n')}
` : '🎉 Project is complete!'}
`;
    
    return {
      success: true,
      plan,
      summary
    };
  }
}

/**
 * List Projects Tool
 */
export class ListProjectsTool extends BaseTool {
  constructor() {
    super(
      'list_projects',
      'List all project plans, including completed and in-progress projects.',
      {}
    );
  }

  async execute(): Promise<{
    projects: { id: string; name: string; status: string; progress: string; updatedAt: Date }[];
  }> {
    const manager = getChapterManager();
    const plans = manager.listPlans();
    
    return {
      projects: plans.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        progress: `${p.completedChapters}/${p.totalChapters} chapters`,
        updatedAt: p.updatedAt
      }))
    };
  }
}

