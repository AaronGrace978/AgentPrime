/**
 * TaskFlow - Add Command
 * Handles adding new tasks
 */

import inquirer from 'inquirer';
import { Task, Priority } from '../types';
import { generateId } from '../utils';
import { loadTasks, saveTasks } from '../storage';

export async function addTask(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'Task title:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Title cannot be empty';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'description',
      message: 'Task description (optional):',
    },
    {
      type: 'list',
      name: 'priority',
      message: 'Priority:',
      choices: [
        { name: 'Low', value: 'low' },
        { name: 'Medium', value: 'medium' },
        { name: 'High', value: 'high' }
      ],
      default: 'medium'
    },
    {
      type: 'input',
      name: 'dueDate',
      message: 'Due date (YYYY-MM-DD, optional):',
      validate: (input: string) => {
        if (!input.trim()) {
          return true; // Optional
        }
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(input)) {
          return 'Please enter a valid date in YYYY-MM-DD format';
        }
        const date = new Date(input);
        if (isNaN(date.getTime())) {
          return 'Please enter a valid date';
        }
        return true;
      }
    }
  ]);

  const tasks = loadTasks();
  const newTask: Task = {
    id: generateId(),
    title: answers.title.trim(),
    description: answers.description?.trim() || undefined,
    priority: answers.priority as Priority,
    dueDate: answers.dueDate?.trim() || undefined,
    completed: false,
    createdAt: new Date().toISOString()
  };

  tasks.push(newTask);
  
  if (saveTasks(tasks)) {
    console.log(`✅ Task "${newTask.title}" added successfully!`);
  } else {
    console.error('❌ Failed to save task');
  }
}

