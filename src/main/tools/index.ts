/**
 * AgentPrime Tools - Central export for all agent tools
 * 
 * Tools give the AI the ability to interact with the world:
 * - Web Search: Look up information online
 * - Browser: Navigate, click, fill forms
 * - File Organizer: Categorize and organize files
 * - Document Parser: Read PDFs, DOCX, and other documents
 * - Clipboard: Read/write system clipboard
 */

// Base
export { BaseTool, ToolParameter, ToolMetadata } from './base-tool';
export { ToolRegistry } from './tool-registry';

// Web Tools
export { WebSearchTool, WebFetchTool } from './web-search-tool';

// Browser Automation
export {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserFillFormTool,
  BrowserScreenshotTool,
  BrowserExtractTool,
  BrowserCloseTool
} from './browser-tool';

// File Organization
export {
  FileOrganizerTool,
  FileAnalyzerTool,
  FileRenameTool,
  formatFileSize
} from './file-organizer-tool';

// Document Parsing
export {
  DocumentReaderTool,
  DocumentSearchTool,
  ResumeParserTool
} from './document-tool';

// Clipboard
export {
  ClipboardReadTool,
  ClipboardWriteTool,
  ClipboardClearTool,
  ClipboardHistoryTool
} from './clipboard-tool';

// Dependencies
export {
  NpmInstallTool,
  PipInstallTool,
  DetectPackageManagerTool,
  AddDependencyTool
} from './dependency-tool';

// Project Chapters
export {
  CreateProjectPlanTool,
  StartChapterTool,
  CompleteChapterTool,
  CompleteTaskTool,
  GetProjectProgressTool,
  ResumeProjectTool,
  ListProjectsTool
} from './chapter-tool';

// ============================================================================
// TOOL FACTORY - Create and register all tools
// ============================================================================

import { BaseTool } from './base-tool';
import { ToolRegistry } from './tool-registry';

// Import all tool classes
import { WebSearchTool, WebFetchTool } from './web-search-tool';
import {
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserFillFormTool,
  BrowserScreenshotTool,
  BrowserExtractTool,
  BrowserCloseTool
} from './browser-tool';
import {
  FileOrganizerTool,
  FileAnalyzerTool,
  FileRenameTool
} from './file-organizer-tool';
import {
  DocumentReaderTool,
  DocumentSearchTool,
  ResumeParserTool
} from './document-tool';
import {
  ClipboardReadTool,
  ClipboardWriteTool,
  ClipboardClearTool,
  ClipboardHistoryTool
} from './clipboard-tool';

import {
  NpmInstallTool,
  PipInstallTool,
  DetectPackageManagerTool,
  AddDependencyTool
} from './dependency-tool';

import {
  CreateProjectPlanTool,
  StartChapterTool,
  CompleteChapterTool,
  CompleteTaskTool,
  GetProjectProgressTool,
  ResumeProjectTool,
  ListProjectsTool
} from './chapter-tool';

/**
 * Create all available tools
 */
export function createAllTools(): BaseTool[] {
  return [
    // Web
    new WebSearchTool(),
    new WebFetchTool(),
    
    // Browser
    new BrowserNavigateTool(),
    new BrowserClickTool(),
    new BrowserTypeTool(),
    new BrowserFillFormTool(),
    new BrowserScreenshotTool(),
    new BrowserExtractTool(),
    new BrowserCloseTool(),
    
    // File Organization
    new FileOrganizerTool(),
    new FileAnalyzerTool(),
    new FileRenameTool(),
    
    // Documents
    new DocumentReaderTool(),
    new DocumentSearchTool(),
    new ResumeParserTool(),
    
    // Clipboard
    new ClipboardReadTool(),
    new ClipboardWriteTool(),
    new ClipboardClearTool(),
    new ClipboardHistoryTool(),
    
    // Dependencies
    new NpmInstallTool(),
    new PipInstallTool(),
    new DetectPackageManagerTool(),
    new AddDependencyTool(),
    
    // Project Chapters
    new CreateProjectPlanTool(),
    new StartChapterTool(),
    new CompleteChapterTool(),
    new CompleteTaskTool(),
    new GetProjectProgressTool(),
    new ResumeProjectTool(),
    new ListProjectsTool()
  ];
}

/**
 * Create a fully configured tool registry with all tools registered
 */
export function createToolRegistry(workspacePath: string, aiRouter?: any): ToolRegistry {
  const registry = new ToolRegistry(workspacePath, aiRouter);
  
  const tools = createAllTools();
  for (const tool of tools) {
    registry.registerTool(tool);
  }
  
  console.log(`[ToolRegistry] Registered ${tools.length} tools:`);
  console.log(`  - Web: web_search, web_fetch`);
  console.log(`  - Browser: browser_navigate, browser_click, browser_type, browser_fill_form, browser_screenshot, browser_extract, browser_close`);
  console.log(`  - Files: organize_folder, analyze_folder, batch_rename`);
  console.log(`  - Documents: read_document, search_documents, parse_resume`);
  console.log(`  - Clipboard: clipboard_read, clipboard_write, clipboard_clear, clipboard_history`);
  console.log(`  - Dependencies: npm_install, pip_install, detect_package_manager, add_dependency`);
  console.log(`  - Chapters: create_project_plan, start_chapter, complete_chapter, complete_task, get_project_progress, resume_project, list_projects`);
  
  return registry;
}

/**
 * Get tool descriptions for LLM system prompt
 */
export function getToolDescriptionsForLLM(): string {
  const tools = createAllTools();
  
  let description = `You have access to the following tools to help accomplish tasks:\n\n`;
  
  // Group by category
  const categories: Record<string, BaseTool[]> = {
    'Web & Research': [],
    'Browser Automation': [],
    'File Organization': [],
    'Document Processing': [],
    'Dependencies': [],
    'Project Chapters': [],
    'System': []
  };
  
  for (const tool of tools) {
    if (tool.name.startsWith('web_')) {
      categories['Web & Research'].push(tool);
    } else if (tool.name.startsWith('browser_')) {
      categories['Browser Automation'].push(tool);
    } else if (tool.name.includes('folder') || tool.name.includes('rename')) {
      categories['File Organization'].push(tool);
    } else if (tool.name.includes('document') || tool.name.includes('resume')) {
      categories['Document Processing'].push(tool);
    } else if (tool.name.includes('npm') || tool.name.includes('pip') || tool.name.includes('dependency') || tool.name.includes('package_manager')) {
      categories['Dependencies'].push(tool);
    } else if (tool.name.includes('chapter') || tool.name.includes('project_plan') || tool.name.includes('task') || tool.name.includes('progress') || tool.name.includes('resume_project') || tool.name.includes('list_projects')) {
      categories['Project Chapters'].push(tool);
    } else {
      categories['System'].push(tool);
    }
  }
  
  for (const [category, categoryTools] of Object.entries(categories)) {
    if (categoryTools.length === 0) continue;
    
    description += `## ${category}\n\n`;
    
    for (const tool of categoryTools) {
      description += `### ${tool.name}\n`;
      description += `${tool.description}\n`;
      description += `Parameters:\n`;
      
      if (Object.keys(tool.parameters).length === 0) {
        description += `  (none)\n`;
      } else {
        for (const [paramName, paramSpec] of Object.entries(tool.parameters)) {
          const required = paramSpec.required ? '(required)' : '(optional)';
          description += `  - ${paramName} ${required}: ${paramSpec.description || ''}\n`;
        }
      }
      description += '\n';
    }
  }
  
  description += `\nTo use a tool, respond with JSON:\n`;
  description += `{ "tool": "tool_name", "args": { "param1": "value1" } }\n`;
  description += `\nFor multiple tools:\n`;
  description += `{ "actions": [{ "tool": "tool1", "args": {...} }, { "tool": "tool2", "args": {...} }] }\n`;
  
  return description;
}

