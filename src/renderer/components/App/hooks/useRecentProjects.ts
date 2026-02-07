/**
 * useRecentProjects - Hook for managing recent projects list
 */

import { useState, useEffect, useCallback } from 'react';
import { RecentProject } from '../types';

const STORAGE_KEY = 'agentprime-recent-projects';
const MAX_RECENT = 5;

interface UseRecentProjectsReturn {
  recentProjects: RecentProject[];
  addRecentProject: (path: string) => void;
  clearRecentProjects: () => void;
}

export function useRecentProjects(workspacePath: string | null): UseRecentProjectsReturn {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  // Load recent projects from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentProjects(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load recent projects:', e);
    }
  }, []);

  // Save to recent projects when workspace changes
  useEffect(() => {
    if (workspacePath) {
      addRecentProject(workspacePath);
    }
  }, [workspacePath]);

  // Add a project to recent list
  const addRecentProject = useCallback((path: string) => {
    const projectName = path.split(/[/\\]/).pop() || 'Unknown';
    const newRecent: RecentProject = {
      path,
      name: projectName,
      lastOpened: Date.now()
    };
    
    setRecentProjects(prev => {
      const filtered = prev.filter(p => p.path !== path);
      const updated = [newRecent, ...filtered].slice(0, MAX_RECENT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear all recent projects
  const clearRecentProjects = useCallback(() => {
    setRecentProjects([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    recentProjects,
    addRecentProject,
    clearRecentProjects
  };
}

export default useRecentProjects;

