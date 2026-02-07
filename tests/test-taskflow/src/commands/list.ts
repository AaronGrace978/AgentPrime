/**
 * TaskFlow - List Command
 * Displays tasks with color-coded output
 */

import chalk from 'chalk';
import { Task, TaskFilter } from '../types';
import { loadTasks } from '../storage';
import { filterTasks, sortTasks, formatDate, isOverdue } from '../utils';

const PRIORITY_COLORS = {
  high: chalk.red.bold,
  medium: chalk.yellow,
  low: chalk.green
};

const STATUS_COLORS = {
  completed: chalk.gray.strikethrough,
  pending: chalk.white,
  overdue: chalk.red.bold
};

export function listTasks(filter?: TaskFilter): void {
  let tasks = loadTasks();

  if (filter) {
    tasks = filterTasks(tasks, filter);
  }

  tasks = sortTasks(tasks);

  if (tasks.length === 0) {
    console.log(chalk.gray('No tasks found.'));
    return;
  }

  console.log(chalk.bold.underline(`\n📋 Tasks (${tasks.length})\n`));

  tasks.forEach((task, index) => {
    const status = task.completed 
      ? 'completed' 
      : isOverdue(task) 
        ? 'overdue' 
        : 'pending';

    const statusColor = STATUS_COLORS[status];
    const priorityColor = PRIORITY_COLORS[task.priority];
    
    const checkbox = task.completed ? chalk.green('✓') : chalk.gray('○');
    const priorityBadge = priorityColor(`[${task.priority.toUpperCase()}]`);
    const title = statusColor(task.title);
    
    let line = `${checkbox} ${priorityBadge} ${title}`;

    if (task.dueDate) {
      const dueDateStr = formatDate(task.dueDate);
      const dueColor = isOverdue(task) ? chalk.red : chalk.gray;
      line += ` ${dueColor(`(due: ${dueDateStr})`)}`;
    }

    console.log(line);

    if (task.description) {
      console.log(chalk.gray(`   ${task.description}`));
    }

    if (index < tasks.length - 1) {
      console.log(); // Spacing between tasks
    }
  });

  console.log(); // Final spacing
}

