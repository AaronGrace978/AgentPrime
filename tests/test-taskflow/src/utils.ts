/**
 * TaskFlow - Utility Functions
 * Helper functions for task management
 */

import { Task, TaskFilter, Priority } from './types';
import { format, parseISO, isBefore, isAfter } from 'date-fns';

/**
 * Generate a unique ID for tasks
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Filter tasks based on criteria
 */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  return tasks.filter(task => {
    // Filter by completion status
    if (filter.completed !== undefined && task.completed !== filter.completed) {
      return false;
    }

    // Filter by priority
    if (filter.priority && task.priority !== filter.priority) {
      return false;
    }

    // Filter by search term
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const matchesTitle = task.title.toLowerCase().includes(searchLower);
      const matchesDescription = task.description?.toLowerCase().includes(searchLower);
      if (!matchesTitle && !matchesDescription) {
        return false;
      }
    }

    // Filter by due date
    if (filter.dueBefore && task.dueDate) {
      try {
        const dueDate = parseISO(task.dueDate);
        const beforeDate = parseISO(filter.dueBefore);
        if (isAfter(dueDate, beforeDate)) {
          return false;
        }
      } catch {
        // Invalid date, skip this filter
      }
    }

    return true;
  });
}

/**
 * Sort tasks by priority and due date
 */
export function sortTasks(tasks: Task[]): Task[] {
  const priorityOrder: Record<Priority, number> = {
    high: 3,
    medium: 2,
    low: 1
  };

  return [...tasks].sort((a, b) => {
    // Incomplete tasks first
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    // Then by priority
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    // Then by due date
    if (a.dueDate && b.dueDate) {
      try {
        const dateA = parseISO(a.dueDate);
        const dateB = parseISO(b.dueDate);
        return dateA.getTime() - dateB.getTime();
      } catch {
        return 0;
      }
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;

    // Finally by creation date
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return format(date, 'MMM dd, yyyy');
  } catch {
    return dateString;
  }
}

/**
 * Check if task is overdue
 */
export function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.completed) {
    return false;
  }

  try {
    const dueDate = parseISO(task.dueDate);
    return isBefore(dueDate, new Date());
  } catch {
    return false;
  }
}

