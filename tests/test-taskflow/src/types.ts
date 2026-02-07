/**
 * TaskFlow - Type Definitions
 * Core types for the task management system
 */

export type Priority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string; // ISO date string
  completed: boolean;
  createdAt: string; // ISO date string
  completedAt?: string; // ISO date string
}

export interface TaskFilter {
  completed?: boolean;
  priority?: Priority;
  search?: string;
  dueBefore?: string; // ISO date string
}

export interface StorageData {
  tasks: Task[];
  version: string;
}

