/**
 * Asset Manager - Browse and download free game assets
 * 
 * Integrates with free asset libraries:
 * - 3D Models: Poly Pizza, Sketchfab (CC0), Kenney.nl
 * - Textures: Polyhaven, Ambientcg
 * - Sprites: OpenGameArt, Itch.io
 * - Audio: Freesound.org, Kenney.nl
 */

import React, { useState, useEffect } from 'react';

// @ts-ignore
declare const window: any;

interface AssetSource {
  id: string;
  name: string;
  type: 'models' | 'textures' | 'sprites' | 'audio';
  url: string;
  description: string;
  license: string;
  api?: string; // API endpoint if available
}

const ASSET_SOURCES: AssetSource[] = [
  // 3D Models
  {
    id: 'poly-pizza',
    name: 'Poly Pizza',
    type: 'models',
    url: 'https://poly.pizza',
    description: 'Free low-poly 3D models',
    license: 'CC0'
  },
  {
    id: 'kenney-models',
    name: 'Kenney.nl - Models',
    type: 'models',
    url: 'https://kenney.nl/assets',
    description: 'High-quality game assets',
    license: 'CC0'
  },
  {
    id: 'sketchfab-cc0',
    name: 'Sketchfab (CC0)',
    type: 'models',
    url: 'https://sketchfab.com/features/free-3d-models',
    description: 'CC0 licensed 3D models',
    license: 'CC0'
  },
  
  // Textures
  {
    id: 'polyhaven',
    name: 'Polyhaven',
    type: 'textures',
    url: 'https://polyhaven.com/textures',
    description: 'Free PBR textures (CC0)',
    license: 'CC0',
    api: 'https://api.polyhaven.com'
  },
  {
    id: 'ambientcg',
    name: 'AmbientCG',
    type: 'textures',
    url: 'https://ambientcg.com',
    description: 'Free PBR materials',
    license: 'CC0'
  },
  
  // Sprites
  {
    id: 'opengameart',
    name: 'OpenGameArt',
    type: 'sprites',
    url: 'https://opengameart.org',
    description: 'Free game art and sprites',
    license: 'Various (CC0, CC-BY)'
  },
  {
    id: 'kenney-sprites',
    name: 'Kenney.nl - Sprites',
    type: 'sprites',
    url: 'https://kenney.nl/assets',
    description: 'Game sprites and UI elements',
    license: 'CC0'
  },
  {
    id: 'itchio',
    name: 'Itch.io Free Assets',
    type: 'sprites',
    url: 'https://itch.io/game-assets/free',
    description: 'Free game assets marketplace',
    license: 'Various'
  },
  
  // Audio
  {
    id: 'freesound',
    name: 'Freesound.org',
    type: 'audio',
    url: 'https://freesound.org',
    description: 'Free sound effects and music',
    license: 'Various (CC0, CC-BY)',
    api: 'https://freesound.org/apiv2'
  },
  {
    id: 'kenney-audio',
    name: 'Kenney.nl - Audio',
    type: 'audio',
    url: 'https://kenney.nl/assets',
    description: 'Free game audio',
    license: 'CC0'
  }
];

interface AssetManagerProps {
  isOpen: boolean;
  onClose: () => void;
  targetFolder?: string; // Where to download assets
}

const AssetManager: React.FC<AssetManagerProps> = ({ isOpen, onClose, targetFolder: propTargetFolder }) => {
  const [selectedType, setSelectedType] = useState<'all' | 'models' | 'textures' | 'sprites' | 'audio'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<AssetSource | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [targetFolder, setTargetFolder] = useState<string | undefined>(propTargetFolder);

  // Get workspace path from API if not provided
  useEffect(() => {
    const getWorkspace = async () => {
      if (!propTargetFolder && window.agentAPI?.getWorkspace) {
        try {
          const workspace = await window.agentAPI.getWorkspace();
          if (workspace) {
            setTargetFolder(workspace);
          }
        } catch (e) {
          console.log('Could not get workspace:', e);
        }
      }
    };
    if (isOpen) {
      getWorkspace();
    }
  }, [isOpen, propTargetFolder]);

  const filteredSources = ASSET_SOURCES.filter(source => {
    if (selectedType !== 'all' && source.type !== selectedType) return false;
    if (searchQuery && !source.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleDownload = async (source: AssetSource, assetUrl: string, filename: string) => {
    if (!targetFolder) {
      alert('Please select a target folder first!');
      return;
    }

    setDownloading(source.id);
    try {
      // Use the asset download API
      const result = await window.agentAPI.assetsDownload(assetUrl, targetFolder, filename);
      
      if (result.success) {
        alert(`✅ Asset downloaded to ${result.path}`);
      } else {
        alert(`❌ Download failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const openInBrowser = (url: string) => {
    window.agentAPI?.runCommand?.(`start "" "${url}"`) || window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="asset-manager-overlay" onClick={onClose}>
      <div className="asset-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="asset-manager-header">
          <h2>🎨 Asset Manager</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="asset-manager-content">
          {/* Search and Filter */}
          <div className="asset-manager-controls">
            <input
              type="text"
              placeholder="Search asset sources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="asset-search-input"
            />
            
            <div className="asset-type-filters">
              <button
                className={selectedType === 'all' ? 'active' : ''}
                onClick={() => setSelectedType('all')}
              >
                All
              </button>
              <button
                className={selectedType === 'models' ? 'active' : ''}
                onClick={() => setSelectedType('models')}
              >
                🎭 3D Models
              </button>
              <button
                className={selectedType === 'textures' ? 'active' : ''}
                onClick={() => setSelectedType('textures')}
              >
                🖼️ Textures
              </button>
              <button
                className={selectedType === 'sprites' ? 'active' : ''}
                onClick={() => setSelectedType('sprites')}
              >
                🎨 Sprites
              </button>
              <button
                className={selectedType === 'audio' ? 'active' : ''}
                onClick={() => setSelectedType('audio')}
              >
                🔊 Audio
              </button>
            </div>
          </div>

          {/* Target Folder Info */}
          {targetFolder && (
            <div className="target-folder-info">
              📁 Target: <code>{targetFolder}</code>
            </div>
          )}

          {/* Asset Sources List */}
          <div className="asset-sources-list">
            {filteredSources.map(source => (
              <div key={source.id} className="asset-source-card">
                <div className="asset-source-header">
                  <h3>{source.name}</h3>
                  <span className="asset-license">{source.license}</span>
                </div>
                <p className="asset-description">{source.description}</p>
                <div className="asset-source-actions">
                  <button
                    className="browse-btn"
                    onClick={() => openInBrowser(source.url)}
                  >
                    🌐 Browse Website
                  </button>
                  {source.api && (
                    <button
                      className="api-btn"
                      onClick={() => setSelectedSource(source)}
                    >
                      🔌 API Access
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* API Integration Info */}
          {selectedSource && (
            <div className="api-info-panel">
              <h3>API Integration: {selectedSource.name}</h3>
              <p>Some sources have APIs for programmatic access:</p>
              <ul>
                <li><strong>Polyhaven:</strong> Direct download links via API</li>
                <li><strong>Freesound:</strong> Search and download via API (requires API key)</li>
              </ul>
              <button onClick={() => setSelectedSource(null)}>Close</button>
            </div>
          )}

          {/* Instructions */}
          <div className="asset-manager-instructions">
            <h3>📖 How to Use</h3>
            <ol>
              <li>Browse the asset source website</li>
              <li>Find the asset you want</li>
              <li>Copy the direct download URL</li>
              <li>Use Words to Code to download: <code>Download asset from [URL] to assets/</code></li>
              <li>Or manually download and place in your project folder</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetManager;
