import React, { useState, useEffect } from 'react';

interface Template {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  tags?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  tech?: string[];
}

interface TemplateCategory {
  id: string;
  name: string;
  icon?: string;
}

interface TemplateGalleryProps {
  onSelectTemplate: (template: Template) => void;
}

// Helper to get category icon by ID
  const getCategoryIconById = (categoryId: string): string => {
  const iconMap: Record<string, string> = {
    desktop: '🖥️',
    fullstack: '🌐',
    frontend: '💻',
    backend: '🔗',
    web: '🌐',
    cli: '🐚',
    mobile: '📱',
    game: '🎮',
    games: '🎮',
    all: '📚'
  };
  return iconMap[categoryId] || '📄';
};

const TemplateGallery: React.FC<TemplateGalleryProps> = ({ onSelectTemplate }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Load templates from API
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const result = await window.agentAPI.getTemplates();
        if (result.success) {
          setTemplates(result.templates || []);
          // Convert string categories to TemplateCategory objects
          const categoryStrings = result.categories || [];
          const categoryObjects: TemplateCategory[] = categoryStrings.map((cat: string) => ({
            id: cat,
            name: cat.charAt(0).toUpperCase() + cat.slice(1),
            icon: getCategoryIconById(cat)
          }));
          setCategories(categoryObjects);
        }
      } catch (error) {
        console.error('Failed to load templates:', error);
      } finally {
        setLoading(false);
      }
    };
    loadTemplates();
  }, []);

  // Fallback templates if API fails
  const fallbackTemplates: Template[] = [
    {
      id: 'react-app',
      name: 'React App',
      description: 'Full-stack React application with modern tooling',
      icon: '⚡',
      category: 'web',
      difficulty: 'intermediate',
      tech: ['React', 'TypeScript', 'Vite']
    },
    {
      id: 'express-api',
      name: 'Express API',
      description: 'RESTful API with Express.js and database integration',
      icon: '🔗',
      category: 'backend',
      difficulty: 'intermediate',
      tech: ['Node.js', 'Express', 'MongoDB']
    },
    {
      id: 'python-cli',
      name: 'Python CLI Tool',
      description: 'Command-line tool with argument parsing and rich output',
      icon: '🐍',
      category: 'cli',
      difficulty: 'beginner',
      tech: ['Python', 'Click', 'Rich']
    },
    {
      id: 'electron-app',
      name: 'Electron Desktop App',
      description: 'Cross-platform desktop application',
      icon: '💻',
      category: 'desktop',
      difficulty: 'advanced',
      tech: ['Electron', 'React', 'Node.js']
    },
    {
      id: 'vue-spa',
      name: 'Vue.js SPA',
      description: 'Single-page application with Vue 3 and Composition API',
      icon: '💚',
      category: 'web',
      difficulty: 'intermediate',
      tech: ['Vue.js', 'Vue Router', 'Pinia']
    },
    {
      id: 'fastapi-backend',
      name: 'FastAPI Backend',
      description: 'High-performance Python web API with automatic docs',
      icon: '🚀',
      category: 'backend',
      difficulty: 'intermediate',
      tech: ['Python', 'FastAPI', 'SQLAlchemy']
    },
    {
      id: 'react-native-app',
      name: 'React Native App',
      description: 'Cross-platform mobile application',
      icon: '📱',
      category: 'mobile',
      difficulty: 'advanced',
      tech: ['React Native', 'Expo', 'TypeScript']
    },
    {
      id: 'game-html5',
      name: 'HTML5 Game',
      description: 'Browser-based game with Canvas API',
      icon: '🎮',
      category: 'game',
      difficulty: 'intermediate',
      tech: ['HTML5', 'Canvas', 'JavaScript']
    }
  ];

  const allCategories = categories.length > 0 
    ? [{ id: 'all', name: 'All Templates', icon: '📚' }, ...categories]
    : [
        { id: 'all', name: 'All Templates', icon: '📚' },
        { id: 'desktop', name: 'Desktop', icon: '🖥️' },
        { id: 'fullstack', name: 'Full-Stack', icon: '🌐' },
        { id: 'frontend', name: 'Frontend', icon: '💻' },
        { id: 'backend', name: 'Backend', icon: '🔗' }
      ];

  const displayTemplates = templates.length > 0 ? templates : fallbackTemplates;
  const filteredTemplates = selectedCategory === 'all'
    ? displayTemplates
    : displayTemplates.filter(t => t.category === selectedCategory);

  const getCategoryIcon = (categoryId: string) => {
    const category = allCategories.find(c => c.id === categoryId);
    return category?.icon || '📄';
  };

  const getTemplateIcon = (template: Template) => {
    if (template.icon) return template.icon;
    // Map category to icon
    const iconMap: Record<string, string> = {
      desktop: '💻',
      fullstack: '🌐',
      frontend: '⚛️',
      backend: '🔗'
    };
    return iconMap[template.category] || '📄';
  };

  if (loading) {
    return (
      <div className="template-gallery">
        <div className="gallery-loading">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="template-gallery">
      <div className="gallery-header">
        <h2>🚀 Project Templates</h2>
        <span className="gallery-subtitle">Choose a starting point for your project</span>
      </div>

      <div className="gallery-categories">
        {allCategories.map(category => (
          <button
            key={category.id}
            className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category.id)}
          >
            <span className="category-icon">{category.icon || '📄'}</span>
            <span className="category-name">{category.name}</span>
          </button>
        ))}
      </div>

      <div className="gallery-grid">
        {filteredTemplates.length === 0 ? (
          <div className="gallery-empty">
            <p>No templates found in this category.</p>
          </div>
        ) : (
          filteredTemplates.map(template => (
            <div
              key={template.id}
              className="template-card"
              onClick={() => onSelectTemplate(template)}
            >
              <div className="template-icon">
                {getTemplateIcon(template)}
              </div>

              <div className="template-content">
                <h3 className="template-name">{template.name}</h3>
                <p className="template-description">{template.description}</p>

                {template.tags && template.tags.length > 0 && (
                  <div className="tech-stack">
                    {template.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="tech-tag">{tag}</span>
                    ))}
                    {template.tags.length > 3 && (
                      <span className="tech-more">+{template.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>

              <button className="template-use-btn">
                Use Template →
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TemplateGallery;
