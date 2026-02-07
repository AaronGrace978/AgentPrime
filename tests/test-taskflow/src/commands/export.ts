/**
 * TaskFlow - Export Command
 * Exports tasks to JSON or CSV format
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Task } from '../types';
import { loadTasks } from '../storage';
import { formatDate } from '../utils';

export async function exportTasks(): Promise<void> {
  const tasks = loadTasks();

  if (tasks.length === 0) {
    console.log(chalk.gray('No tasks to export.'));
    return;
  }

  const { format, filePath } = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: 'Export format:',
      choices: [
        { name: 'JSON', value: 'json' },
        { name: 'CSV', value: 'csv' }
      ]
    },
    {
      type: 'input',
      name: 'filePath',
      message: 'Output file path:',
      default: (answers: any) => `tasks.${answers.format}`,
      validate: (input: string) => {
        if (!input.trim()) {
          return 'File path cannot be empty';
        }
        return true;
      }
    }
  ]);

  try {
    let content: string;

    if (format === 'json') {
      content = JSON.stringify(tasks, null, 2);
    } else {
      // CSV format
      const headers = ['ID', 'Title', 'Description', 'Priority', 'Due Date', 'Completed', 'Created At'];
      const rows = tasks.map(task => [
        task.id,
        task.title,
        task.description || '',
        task.priority,
        task.dueDate ? formatDate(task.dueDate) : '',
        task.completed ? 'Yes' : 'No',
        formatDate(task.createdAt)
      ]);

      content = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      ].join('\n');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(chalk.green(`✅ Exported ${tasks.length} task(s) to ${filePath}`));
  } catch (error: any) {
    console.error(chalk.red(`❌ Failed to export: ${error.message}`));
  }
}

