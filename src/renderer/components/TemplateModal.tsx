import React, { useState } from 'react';
import TemplateGallery from './TemplateGallery';

interface Template {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  tags?: string[];
  variables?: Array<{ name: string; label: string; default: string }>;
}

// Complexity detection for project requests
const detectComplexity = (description: string): 'simple' | 'complex' => {
  const complexKeywords = [
    'three.js', 'webgl', 'particle', 'audio', 'reactive', 'real-time',
    'visualization', 'animation', '3d', 'shader', 'physics', 'simulation',
    'microphone', 'web audio', 'canvas', 'rendering', 'post-processing',
    'multiple modes', 'advanced', 'complex', 'sophisticated'
  ];

  const lowerDesc = description.toLowerCase();
  const complexMatches = complexKeywords.filter(keyword => lowerDesc.includes(keyword));

  // If description is long (>200 chars) or has multiple complex keywords, it's complex
  if (description.length > 200 || complexMatches.length >= 2) {
    return 'complex';
  }

  return 'simple';
};

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (template: Template) => Promise<void>;
  onSwitchToAIComposer?: (request: string) => void;
}

const TemplateModal: React.FC<TemplateModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
  onSwitchToAIComposer
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [projectDescription, setProjectDescription] = useState('');
  const [showComplexityCheck, setShowComplexityCheck] = useState(false);

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setProjectName(template.variables?.find((v: any) => v.name === 'projectName')?.default || '');
    setError(null);
  };

  const handleDescriptionSubmit = () => {
    if (!projectDescription.trim()) return;

    const complexity = detectComplexity(projectDescription);

    if (complexity === 'complex' && onSwitchToAIComposer) {
      // Route complex requests to AI Composer
      onSwitchToAIComposer(projectDescription);
      onClose();
      return;
    }

    // Show template selection for simple projects
    setShowComplexityCheck(false);
  };

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    setLoadingStatus('Preparing project...');
    setError(null);

    try {
      // Get project location
      let location = projectLocation;
      if (!location) {
        const result = await (window as any).agentAPI.selectDirectory();
        if (!result.success) {
          setLoading(false);
          setLoadingStatus('');
          return; // User cancelled
        }
        location = result.path;
      }

      // Create project variables
      const variables: Record<string, string> = {
        projectName: projectName.trim(),
        author: 'Developer',
        description: selectedTemplate.description
      };

      setLoadingStatus('Creating project files...');

      // Create project from template
      const createResult = await (window as any).agentAPI.createFromTemplate(
        selectedTemplate.id,
        location,
        variables
      );

      if (createResult.success) {
        // Show dependency installation status
        if (createResult.dependenciesInstalled) {
          setLoadingStatus('Dependencies installed! Opening project...');
        } else if (createResult.installOutput) {
          // Dependencies were attempted but may have had issues
          console.warn('Dependency installation note:', createResult.installOutput);
        }
        
        // Open the created project
        const projectPath = createResult.projectPath || `${location}/${projectName.trim()}`;
        await onCreateProject(selectedTemplate);
        onClose();
        // Reset state
        setSelectedTemplate(null);
        setProjectName('');
        setProjectLocation('');
        setLoadingStatus('');
      } else {
        setError(createResult.error || 'Failed to create project');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="template-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="template-modal-header">
          <h2>🚀 Create New Project</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="template-modal-body">
          {showComplexityCheck ? (
            <div className="complexity-check">
              <div className="complexity-header">
                <h3>🤔 Tell me about your project</h3>
                <p>Describe what you want to build, and I'll help you choose the right approach.</p>
              </div>

              <div className="description-input-group">
                <textarea
                  className="project-description-input"
                  placeholder="E.g., 'Build a Vue 3 single-page app with Three.js particle visualization and audio reactivity...'"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="complexity-actions">
                <button
                  className="complexity-btn primary"
                  onClick={handleDescriptionSubmit}
                  disabled={!projectDescription.trim()}
                >
                  🚀 Analyze & Create
                </button>
                <button
                  className="complexity-btn secondary"
                  onClick={() => setShowComplexityCheck(false)}
                >
                  ← Back to Templates
                </button>
              </div>

              <div className="complexity-info">
                <div className="info-item">
                  <span className="info-icon">📄</span>
                  <span><strong>Simple Projects:</strong> Basic websites, forms, simple apps</span>
                </div>
                <div className="info-item">
                  <span className="info-icon">🤖</span>
                  <span><strong>Complex Projects:</strong> Audio-reactive visualizations, 3D graphics, advanced features</span>
                </div>
              </div>
            </div>
          ) : !selectedTemplate ? (
            <div className="template-selection">
              <div className="template-intro">
                <h3>Choose a starting template</h3>
                <p>For complex projects with advanced features, try the AI Composer instead.</p>
                <button
                  className="ai-composer-btn"
                  onClick={() => setShowComplexityCheck(true)}
                >
                  🤖 Try AI Composer for Complex Projects
                </button>
              </div>
              <TemplateGallery onSelectTemplate={handleSelectTemplate} />
            </div>
          ) : (
            <div className="template-details">
              <div className="template-selected-header">
                <button 
                  className="back-button"
                  onClick={() => setSelectedTemplate(null)}
                  disabled={loading}
                >
                  ← Back to Templates
                </button>
                <div className="selected-template-info">
                  <span className="template-icon-large">{selectedTemplate.icon || '📄'}</span>
                  <div>
                    <h3>{selectedTemplate.name}</h3>
                    <p>{selectedTemplate.description}</p>
                  </div>
                </div>
              </div>

              <div className="project-form">
                <div className="form-group">
                  <label htmlFor="project-name">Project Name:</label>
                  <input
                    id="project-name"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-awesome-project"
                    disabled={loading}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="project-location">Location (optional):</label>
                  <div className="location-input-group">
                    <input
                      id="project-location"
                      type="text"
                      value={projectLocation}
                      onChange={(e) => setProjectLocation(e.target.value)}
                      placeholder="Leave empty to choose folder..."
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="browse-button"
                      onClick={async () => {
                        const result = await (window as any).agentAPI.selectDirectory();
                        if (result.success) {
                          setProjectLocation(result.path);
                        }
                      }}
                      disabled={loading}
                    >
                      Browse...
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="error-message">
                    ❌ {error}
                  </div>
                )}

                <div className="template-tags">
                  {selectedTemplate.tags?.slice(0, 5).map(tag => (
                    <span key={tag} className="tech-tag">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedTemplate && (
          <div className="template-modal-footer">
            <button 
              type="button" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={handleCreate}
              disabled={!projectName.trim() || loading}
              className="create-button"
            >
              {loading ? (loadingStatus || 'Creating...') : 'Create Project →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateModal;

