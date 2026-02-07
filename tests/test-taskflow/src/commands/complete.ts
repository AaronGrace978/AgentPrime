/**
 * TaskFlow - Complete Command
 * Marks tasks as completed
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { Task } from '../types';
import { loadTasks, saveTasks } from '../storage';
import { filterTasks, sortTasks } from '../utils';

export async function completeTask(): Promise<void> {
  const tasks = loadTasks();
  const incompleteTasks = filterTasks(tasks, { completed: false });

  if (incompleteTasks.length === 0) {
    console.log(chalk.gray('No incomplete tasks found.'));
    return;
  }

  const sortedTasks = sortTasks(incompleteTasks);

  const { selectedTasks } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedTasks',
      message: 'Select tasks to complete:',
      choices: sortedTasks.map(task => ({
        name: `${task.title} ${task.priority ? `[${task.priority}]` : ''}`,
        value: task.id
      }))
    }
  ]);

  if (selectedTasks.length === 0) {
    console.log(chalk.gray('No tasks selected.'));
    return;
  }

  const updatedTasks = tasks.map(task => {
    if (selectedTasks.includes(task.id) && !task.completed) {
      return {
        ...task,
        completed: true,
        completedAt: new Date().toISOString()
      };
    }
    return task;
  });

  if (saveTasks(updatedTasks)) {
    console.log(chalk.green(`✅ Completed ${selectedTasks.length} task(s)!`));
  } else {
    console.error(chalk.red('❌ Failed to save tasks'));
  }
}

