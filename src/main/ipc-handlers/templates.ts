/**
 * AgentPrime - Template IPC Handlers
 * Handles project template operations via IPC
 */

import { IpcMain, Dialog, BrowserWindow, OpenDialogReturnValue } from 'electron';

interface TemplateEngine {
  getTemplates(): any[];
  getCategories(): string[];
  getTemplate(templateId: string): any;
  createProject(templateId: string, targetDir: string, variables: Record<string, any>): Promise<any>;
}

interface TemplateHandlersDeps {
  ipcMain: IpcMain;
  dialog: Dialog;
  mainWindow: () => BrowserWindow | null;
  templateEngine: TemplateEngine;
}

/**
 * Register template-related IPC handlers
 */
export function register(deps: TemplateHandlersDeps): void {
  const { ipcMain, dialog, mainWindow, templateEngine } = deps;

  console.log('[TemplateHandlers] Registering template IPC handlers...');

  // Get all templates
  ipcMain.handle('template:list', async () => {
    console.log('[TemplateHandlers] template:list called');
    try {
      const templates = templateEngine.getTemplates();
      const categoryObjects = templateEngine.getCategories();
      // Extract category IDs as strings for UI compatibility
      const categories = categoryObjects.map((cat: any) => typeof cat === 'string' ? cat : cat.id);
      console.log(`[TemplateHandlers] template:list success - ${templates.length} templates, ${categories.length} categories`);
      return { success: true, templates, categories };
    } catch (e: any) {
      console.error(`[TemplateHandlers] template:list error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  // Get single template
  ipcMain.handle('template:get', async (event, templateId: string) => {
    console.log(`[TemplateHandlers] template:get called with templateId: ${templateId}`);
    try {
      const template = templateEngine.getTemplate(templateId);
      if (template) {
        console.log(`[TemplateHandlers] template:get success - found template: ${template.name}`);
        return { success: true, template };
      }
      console.warn(`[TemplateHandlers] template:get - template not found: ${templateId}`);
      return { success: false, error: 'Template not found' };
    } catch (e: any) {
      console.error(`[TemplateHandlers] template:get error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  // Create project from template
  ipcMain.handle('template:create', async (event, templateId: string, targetDir: string, variables: Record<string, any>) => {
    console.log(`[TemplateHandlers] template:create called - templateId: ${templateId}, targetDir: ${targetDir}`);
    console.log(`[TemplateHandlers] template:create variables:`, JSON.stringify(variables, null, 2));
    try {
      const result = await templateEngine.createProject(templateId, targetDir, variables);
      console.log(`[TemplateHandlers] template:create success - project created at: ${result.projectPath}`);
      return { success: true, ...result };
    } catch (e: any) {
      console.error(`[TemplateHandlers] template:create error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  // Select directory for template creation
  ipcMain.handle('template:select-directory', async () => {
    console.log('[TemplateHandlers] template:select-directory called');
    try {
      const window = mainWindow();
      if (!window) {
        console.warn('[TemplateHandlers] template:select-directory - no main window available');
        return { success: false, error: 'Main window not available' };
      }
      
      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Location for New Project'
      }) as any;
      
      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        console.log(`[TemplateHandlers] template:select-directory success - selected: ${result.filePaths[0]}`);
        return { success: true, path: result.filePaths[0] };
      }
      console.log('[TemplateHandlers] template:select-directory - user cancelled');
      return { success: false };
    } catch (e: any) {
      console.error(`[TemplateHandlers] template:select-directory error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  // Get template categories
  ipcMain.handle('template:categories', async () => {
    console.log('[TemplateHandlers] template:categories called');
    try {
      const categoryObjects = templateEngine.getCategories();
      // Extract category IDs as strings for UI compatibility
      const categories = categoryObjects.map((cat: any) => typeof cat === 'string' ? cat : cat.id);
      console.log(`[TemplateHandlers] template:categories success - ${categories.length} categories`);
      return { success: true, categories };
    } catch (e: any) {
      console.error(`[TemplateHandlers] template:categories error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  console.log('[TemplateHandlers] ✅ All template IPC handlers registered');
}
