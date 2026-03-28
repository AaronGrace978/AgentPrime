/**
 * Project Memory — Per-workspace persistent intelligence
 * 
 * Stores decisions, preferences, and learned context per project
 * in .agentprime/memory.json at the workspace root.
 * 
 * This is what makes AgentPrime get SMARTER the more you use it
 * on each project — unlike Cursor/Lovable which start fresh every time.
 */

import { IpcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface Decision {
  id: string;
  context: string;
  choice: string;
  reason?: string;
  timestamp: number;
}

interface ProjectMemory {
  version: 1;
  projectName: string;
  createdAt: number;
  updatedAt: number;
  preferences: Record<string, any>;
  decisions: Decision[];
  corrections: Array<{ original: string; corrected: string; timestamp: number }>;
  techStack: string[];
  conventions: string[];
}

function getMemoryPath(workspacePath: string): string {
  return path.join(workspacePath, '.agentprime', 'memory.json');
}

function loadMemory(workspacePath: string): ProjectMemory {
  const memPath = getMemoryPath(workspacePath);
  if (fs.existsSync(memPath)) {
    try {
      return JSON.parse(fs.readFileSync(memPath, 'utf-8'));
    } catch {
      // Corrupted, create fresh
    }
  }

  return {
    version: 1,
    projectName: path.basename(workspacePath),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    preferences: {},
    decisions: [],
    corrections: [],
    techStack: [],
    conventions: [],
  };
}

function saveMemory(workspacePath: string, memory: ProjectMemory): void {
  const memPath = getMemoryPath(workspacePath);
  const dir = path.dirname(memPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Add .agentprime to .gitignore if not already there
  const gitignorePath = path.join(workspacePath, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.agentprime')) {
      fs.appendFileSync(gitignorePath, '\n# AgentPrime project memory\n.agentprime/\n');
    }
  }

  memory.updatedAt = Date.now();
  fs.writeFileSync(memPath, JSON.stringify(memory, null, 2));
}

function autoDetectTechStack(workspacePath: string): string[] {
  const stack: string[] = [];
  const check = (file: string, tech: string) => {
    if (fs.existsSync(path.join(workspacePath, file))) stack.push(tech);
  };

  check('package.json', 'node');
  check('tsconfig.json', 'typescript');
  check('vite.config.ts', 'vite');
  check('next.config.js', 'nextjs');
  check('next.config.ts', 'nextjs');
  check('tailwind.config.js', 'tailwind');
  check('tailwind.config.ts', 'tailwind');
  check('requirements.txt', 'python');
  check('Cargo.toml', 'rust');
  check('go.mod', 'go');
  check('Gemfile', 'ruby');
  check('.eslintrc.js', 'eslint');
  check('.prettierrc', 'prettier');
  check('docker-compose.yml', 'docker');
  check('Dockerfile', 'docker');

  // Check package.json for frameworks
  const pkgPath = path.join(workspacePath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps.react) stack.push('react');
      if (allDeps.vue) stack.push('vue');
      if (allDeps.svelte) stack.push('svelte');
      if (allDeps.express) stack.push('express');
      if (allDeps.fastify) stack.push('fastify');
      if (allDeps['@prisma/client']) stack.push('prisma');
      if (allDeps.mongoose) stack.push('mongodb');
    } catch {}
  }

  return [...new Set(stack)];
}

interface ProjectMemoryDeps {
  ipcMain: IpcMain;
  getWorkspacePath: () => string | null;
}

export function registerProjectMemoryHandlers(deps: ProjectMemoryDeps): void {
  const { ipcMain, getWorkspacePath } = deps;

  ipcMain.handle('project-memory:get', async () => {
    const wp = getWorkspacePath();
    if (!wp) return { success: false, error: 'No workspace' };

    const memory = loadMemory(wp);

    if (memory.techStack.length === 0) {
      memory.techStack = autoDetectTechStack(wp);
      saveMemory(wp, memory);
    }

    return { success: true, memory };
  });

  ipcMain.handle('project-memory:update', async (_event, key: string, value: any) => {
    const wp = getWorkspacePath();
    if (!wp) return { success: false, error: 'No workspace' };

    const memory = loadMemory(wp);

    if (key === 'preferences') {
      memory.preferences = { ...memory.preferences, ...value };
    } else if (key === 'conventions') {
      if (Array.isArray(value)) {
        memory.conventions = [...new Set([...memory.conventions, ...value])];
      }
    } else if (key === 'techStack') {
      if (Array.isArray(value)) {
        memory.techStack = [...new Set([...memory.techStack, ...value])];
      }
    } else {
      (memory as any)[key] = value;
    }

    saveMemory(wp, memory);
    return { success: true };
  });

  ipcMain.handle('project-memory:record-decision', async (_event, decision: { context: string; choice: string; reason?: string }) => {
    const wp = getWorkspacePath();
    if (!wp) return { success: false, error: 'No workspace' };

    const memory = loadMemory(wp);
    memory.decisions.push({
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...decision,
      timestamp: Date.now(),
    });

    if (memory.decisions.length > 200) {
      memory.decisions = memory.decisions.slice(-200);
    }

    saveMemory(wp, memory);
    console.log(`[ProjectMemory] Recorded decision: ${decision.choice.substring(0, 50)}`);
    return { success: true };
  });

  console.log('[ProjectMemory] Per-workspace memory handlers registered');
}
