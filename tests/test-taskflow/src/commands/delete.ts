/**
 * TaskFlow - Delete Command
 * Removes tasks from storage
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { Task } from '../types';
import { loadTasks, saveTasks } from '../storage';
import { sortTasks } from '../utils';

export async function deleteTask(): Promise<void> {
  const tasks = loadTasks();

  if (tasks.length === 0) {
    console.log(chalk.gray('No tasks found.'));
    return;
  }

  const sortedTasks = sortTasks(tasks);

  const { selectedTasks } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedTasks',
      message: 'Select tasks to delete:',
      choices: sortedTasks.map(task => ({
        name: `${task.completed ? '✓' : '○'} ${task.title} [${task.priority}]`,
        value: task.id
      }))
    }
  ]);

  if (selectedTasks.length === 0) {
    console.log(chalk.gray('No tasks selected.'));
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to delete ${selectedTasks.length} task(s)?`,
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.gray('Deletion cancelled.'));
    return;
  }

  const updatedTasks = tasks.filter(task => !selectedTasks.includes(task.id));

  if (saveTasks(updatedTasks)) {
    console.log(chalk.green(`✅ Deleted ${selectedTasks.length} task(s)!`));
  } else {
    console.error(chalk.red('❌ Failed to save tasks'));
  }
}

