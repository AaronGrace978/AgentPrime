/**
 * AgentPrime - Team Patterns Component
 * UI for viewing and managing team-shared patterns
 */

import React, { useState, useEffect } from 'react';

// TeamPattern type (shared with main process team-mirror)
interface TeamPattern {
  id: string;
  category?: string;
  pattern?: string;
  examples?: string[];
  confidence?: number;
  extractedFrom?: string;
  characteristics?: Record<string, unknown>;
  description?: string;
  type?: string;
  successRate?: number;
  useCount?: number;
  usageCount?: number;
  lastUsed?: number;
  created?: number;
  metadata?: Record<string, unknown>;
  teamId: string;
  userId: string;
  visibility: 'public' | 'team' | 'private';
  sharedAt: number;
  teamUsageCount: number;
  teamSuccessRate: number;
  version: number;
}

interface TeamPatternsProps {
  teamId: string;
  userId: string;
}

export const TeamPatterns: React.FC<TeamPatternsProps> = ({ teamId, userId }) => {
  const [patterns, setPatterns] = useState<TeamPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{
    language?: string;
    projectType?: string;
    visibility?: 'public' | 'team' | 'private';
  }>({});

  useEffect(() => {
    loadTeamPatterns();
  }, [teamId, filter]);

  const loadTeamPatterns = async () => {
    setLoading(true);
    try {
      const response = await window.agentAPI.getTeamPatterns(teamId, filter);
      if (response.success) {
        setPatterns(response.patterns);
      }
    } catch (error) {
      console.error('Failed to load team patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  const sharePattern = async (patternId: string, visibility: 'public' | 'team' | 'private') => {
    try {
      const response = await window.agentAPI.sharePatternWithTeam(teamId, patternId, visibility);
      if (response.success) {
        await loadTeamPatterns();
      }
    } catch (error) {
      console.error('Failed to share pattern:', error);
    }
  };

  if (loading) {
    return (
      <div className="team-patterns-loading">
        <div className="loading-spinner" />
        <p>Loading team patterns...</p>
      </div>
    );
  }

  return (
    <div className="team-patterns">
      <div className="team-patterns-header">
        <h2>Team Patterns</h2>
        <div className="team-patterns-filters">
          <select
            value={filter.language || ''}
            onChange={(e) => setFilter({ ...filter, language: e.target.value || undefined })}
          >
            <option value="">All Languages</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
          </select>
          <select
            value={filter.visibility || ''}
            onChange={(e) => setFilter({ ...filter, visibility: e.target.value as any || undefined })}
          >
            <option value="">All Visibility</option>
            <option value="public">Public</option>
            <option value="team">Team</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>

      <div className="team-patterns-list">
        {patterns.length === 0 ? (
          <div className="team-patterns-empty">
            <p>No team patterns found. Share your first pattern!</p>
          </div>
        ) : (
          patterns.map((pattern) => (
            <div key={pattern.id} className="team-pattern-card">
              <div className="pattern-header">
                <h3>{pattern.type || 'Pattern'}</h3>
                <span className={`visibility-badge ${pattern.visibility}`}>
                  {pattern.visibility}
                </span>
              </div>
              <p className="pattern-description">{pattern.description}</p>
              <div className="pattern-stats">
                <span>Used {pattern.teamUsageCount} times</span>
                <span>{(pattern.teamSuccessRate * 100).toFixed(0)}% success</span>
                <span>v{pattern.version}</span>
              </div>
              {pattern.examples && pattern.examples.length > 0 && (
                <div className="pattern-examples">
                  <pre>{pattern.examples[0].substring(0, 200)}...</pre>
                </div>
              )}
              <div className="pattern-actions">
                <button onClick={() => sharePattern(pattern.id || '', pattern.visibility)}>
                  Update Sharing
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TeamPatterns;

