#!/usr/bin/env node

/**
 * TaskFlow - Modern CLI Task Management Tool
 * Main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { addTask } from './commands/add';
import { listTasks } from './commands/list';
import { completeTask } from './commands/complete';
import { deleteTask } from './commands/delete';
import { exportTasks } from './commands/export';
import { TaskFilter, Priority } from './types';

const program = new Command();

program
  .name('taskflow')
  .description('A modern CLI task management tool')
  .version('1.0.0');

program
  .command('add')
  .description('Add a new task')
  .action(async () => {
    await addTask();
  });

program
  .command('list')
  .description('List all tasks')
  .option('-c, --completed', 'Show only completed tasks')
  .option('-i, --incomplete', 'Show only incomplete tasks')
  .option('-p, --priority <priority>', 'Filter by priority (low, medium, high)')
  .option('-s, --search <term>', 'Search tasks by title or description')
  .action((options) => {
    const filter: TaskFilter = {};

    if (options.completed) {
      filter.completed = true;
    } else if (options.incomplete) {
      filter.completed = false;
    }

    if (options.priority) {
      filter.priority = options.priority as Priority;
    }

    if (options.search) {
      filter.search = options.search;
    }

    listTasks(Object.keys(filter).length > 0 ? filter : undefined);
  });

program
  .command('complete')
  .alias('done')
  .description('Mark tasks as completed')
  .action(async () => {
    await completeTask();
  });

program
  .command('delete')
  .alias('remove')
  .description('Delete tasks')
  .action(async () => {
    await deleteTask();
  });

program
  .command('export')
  .description('Export tasks to JSON or CSV')
  .action(async () => {
    await exportTasks();
  });

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse();

