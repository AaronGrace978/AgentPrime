import React, { useState, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  tags: string[];
  assignee?: string;
  relatedFiles?: string[];
  subtasks?: Task[];
  parentTaskId?: string;
}

interface TaskManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskSelect?: (task: Task) => void;
}

interface TaskFormData {
  title: string;
  description: string;
  priority: Task['priority'];
  dueDate: string;
  tags: string;
}

const TaskManager: React.FC<TaskManagerProps> = ({
  isOpen,
  onClose,
  onTaskSelect
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'created' | 'due' | 'priority' | 'title'>('created');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
    tags: ''
  });

  // Load tasks from localStorage on mount
  useEffect(() => {
    const savedTasks = localStorage.getItem('agentprime-tasks');
    if (savedTasks) {
      try {
        const parsedTasks = JSON.parse(savedTasks).map((task: any) => ({
          ...task,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
          dueDate: task.dueDate ? new Date(task.dueDate) : undefined
        }));
        setTasks(parsedTasks);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      }
    }
  }, []);

  // Save tasks to localStorage whenever tasks change
  useEffect(() => {
    localStorage.setItem('agentprime-tasks', JSON.stringify(tasks));
  }, [tasks]);

  const createTask = (formData: TaskFormData): Task => {
    const newTask: Task = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      title: formData.title.trim(),
      description: formData.description.trim(),
      status: 'pending',
      priority: formData.priority,
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      subtasks: []
    };
    return newTask;
  };

  const handleCreateTask = () => {
    if (!formData.title.trim()) return;

    const newTask = createTask(formData);
    setTasks(prev => [...prev, newTask]);
    resetForm();
    setShowCreateForm(false);
  };

  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId
        ? { ...task, ...updates, updatedAt: new Date() }
        : task
    ));
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  const handleStatusChange = (taskId: string, status: Task['status']) => {
    handleUpdateTask(taskId, { status });
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      dueDate: '',
      tags: ''
    });
    setEditingTask(null);
  };

  const filteredTasks = tasks
    .filter(task => filter === 'all' || task.status === filter)
    .sort((a, b) => {
      switch (sortBy) {
        case 'created':
          return b.createdAt.getTime() - a.createdAt.getTime();
        case 'due':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        case 'priority':
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'cancelled': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getTaskStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const overdue = tasks.filter(t => t.dueDate && t.dueDate < new Date() && t.status !== 'completed').length;

    return { total, completed, inProgress, pending, overdue };
  };

  const stats = getTaskStats();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon">📋</span>
          <h3 className="modal-title">Task Manager</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="task-manager-content">
          {/* Stats Bar */}
          <div className="task-stats">
            <div className="stat-item">
              <span className="stat-label">Total:</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Pending:</span>
              <span className="stat-value text-yellow-600">{stats.pending}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">In Progress:</span>
              <span className="stat-value text-blue-600">{stats.inProgress}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Completed:</span>
              <span className="stat-value text-green-600">{stats.completed}</span>
            </div>
            {stats.overdue > 0 && (
              <div className="stat-item">
                <span className="stat-label">Overdue:</span>
                <span className="stat-value text-red-600">{stats.overdue}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="task-controls">
            <div className="control-group">
              <label>Filter:</label>
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                <option value="all">All Tasks</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="control-group">
              <label>Sort by:</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="created">Created Date</option>
                <option value="due">Due Date</option>
                <option value="priority">Priority</option>
                <option value="title">Title</option>
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={() => setShowCreateForm(true)}
            >
              ➕ New Task
            </button>
          </div>

          {/* Task List */}
          <div className="task-list">
            {filteredTasks.length === 0 ? (
              <div className="empty-state">
                <p>No tasks found</p>
                <button
                  className="btn-secondary"
                  onClick={() => setShowCreateForm(true)}
                >
                  Create your first task
                </button>
              </div>
            ) : (
              filteredTasks.map(task => (
                <div key={task.id} className="task-item">
                  <div className="task-header">
                    <div className="task-title-section">
                      <h4 className="task-title">{task.title}</h4>
                      <div className="task-meta">
                        <span className={`priority-badge ${getPriorityColor(task.priority)}`}>
                          {task.priority.toUpperCase()}
                        </span>
                        <span className={`status-badge ${getStatusColor(task.status)}`}>
                          {task.status.replace('_', ' ').toUpperCase()}
                        </span>
                        {task.dueDate && (
                          <span className={`due-date ${task.dueDate < new Date() && task.status !== 'completed' ? 'overdue' : ''}`}>
                            Due: {task.dueDate.toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="task-actions">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value as Task['status'])}
                        className="status-select"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>

                      <button
                        className="btn-icon"
                        onClick={() => onTaskSelect?.(task)}
                        title="Open Task"
                      >
                        📂
                      </button>

                      <button
                        className="btn-icon"
                        onClick={() => setEditingTask(task)}
                        title="Edit Task"
                      >
                        ✏️
                      </button>

                      <button
                        className="btn-icon delete"
                        onClick={() => handleDeleteTask(task.id)}
                        title="Delete Task"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {task.description && (
                    <div className="task-description">
                      {task.description}
                    </div>
                  )}

                  {task.tags.length > 0 && (
                    <div className="task-tags">
                      {task.tags.map(tag => (
                        <span key={tag} className="tag">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Create/Edit Task Form */}
        {(showCreateForm || editingTask) && (
          <div className="task-form-overlay">
            <div className="task-form">
              <h4>{editingTask ? 'Edit Task' : 'Create New Task'}</h4>

              <div className="form-group">
                <label htmlFor="task-title">Title:</label>
                <input
                  id="task-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Task title..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="task-description">Description:</label>
                <textarea
                  id="task-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Task description..."
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="task-priority">Priority:</label>
                  <select
                    id="task-priority"
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as Task['priority'] }))}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="task-due-date">Due Date:</label>
                  <input
                    id="task-due-date"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="task-tags">Tags (comma-separated):</label>
                <input
                  id="task-tags"
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="feature, bug, enhancement..."
                />
              </div>

              <div className="form-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    resetForm();
                    setShowCreateForm(false);
                    setEditingTask(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={editingTask ? () => {
                    if (editingTask) {
                      handleUpdateTask(editingTask.id, {
                        title: formData.title,
                        description: formData.description,
                        priority: formData.priority,
                        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
                        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
                      });
                      resetForm();
                      setEditingTask(null);
                    }
                  } : handleCreateTask}
                  disabled={!formData.title.trim()}
                >
                  {editingTask ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskManager;
