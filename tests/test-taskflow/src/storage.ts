/**
 * TaskFlow - Storage Management
 * Handles persistent storage of tasks in JSON format
 */

import * as fs from 'fs';
import * as path from 'path';
import { Task, StorageData } from './types';

const STORAGE_FILE = path.join(process.cwd(), 'tasks.json');
const STORAGE_VERSION = '1.0.0';

/**
 * Load tasks from storage file
 */
export function loadTasks(): Task[] {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return [];
    }

    const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed: StorageData = JSON.parse(data);

    // Validate version compatibility
    if (parsed.version !== STORAGE_VERSION) {
      console.warn('Storage version mismatch. Migrating...');
      // In a real app, you'd have migration logic here
    }

    return parsed.tasks || [];
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
}

/**
 * Save tasks to storage file
 */
export function saveTasks(tasks: Task[]): boolean {
  try {
    const data: StorageData = {
      tasks,
      version: STORAGE_VERSION
    };

    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving tasks:', error);
    return false;
  }
}

/**
 * Get storage file path (for export functionality)
 */
export function getStoragePath(): string {
  return STORAGE_FILE;
}

