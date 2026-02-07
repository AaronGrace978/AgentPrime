import React, { useState } from 'react';

interface Command {
  id: string;
  command: string;
  description: string;
  category: string;
  example: string;
}

const NaturalLanguageCommands: React.FC = () => {
  const [recentCommands, setRecentCommands] = useState<string[]>([
    'move Pictures to Desktop',
    'copy music to Downloads',
    'delete old files',
    'create new folder projects',
    'rename file old_name.txt to new_name.txt'
  ]);

  const [commandInput, setCommandInput] = useState('');

  const commandExamples: Command[] = [
    {
      id: 'file-move',
      command: 'move [source] to [destination]',
      description: 'Move files or folders',
      category: 'File Operations',
      example: 'move Pictures to Desktop'
    },
    {
      id: 'file-copy',
      command: 'copy [source] to [destination]',
      description: 'Copy files or folders',
      category: 'File Operations',
      example: 'copy music to Downloads'
    },
    {
      id: 'file-delete',
      command: 'delete [target]',
      description: 'Delete files or folders',
      category: 'File Operations',
      example: 'delete old files'
    },
    {
      id: 'folder-create',
      command: 'create [type] [name]',
      description: 'Create new files or folders',
      category: 'File Operations',
      example: 'create folder projects'
    },
    {
      id: 'file-rename',
      command: 'rename [old] to [new]',
      description: 'Rename files or folders',
      category: 'File Operations',
      example: 'rename old_name.txt to new_name.txt'
    },
    {
      id: 'search-files',
      command: 'find [pattern] in [location]',
      description: 'Search for files',
      category: 'Search',
      example: 'find *.js in src'
    },
    {
      id: 'system-info',
      command: 'show system info',
      description: 'Display system information',
      category: 'System',
      example: 'show system info'
    },
    {
      id: 'open-app',
      command: 'open [application]',
      description: 'Launch applications',
      category: 'System',
      example: 'open calculator'
    }
  ];

  const handleCommandSubmit = (command: string) => {
    if (!command.trim()) return;

    // Add to recent commands
    setRecentCommands(prev => [command, ...prev.slice(0, 4)]);

    // Here you would process the natural language command
    console.log('Processing command:', command);

    // Clear input
    setCommandInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommandSubmit(commandInput);
    }
  };

  return (
    <div className="natural-language-commands">
      <div className="commands-header">
        <h3>🗣️ Natural Language Commands</h3>
        <p>Try commands like "move Pictures to Desktop" or "copy music to Downloads"</p>
      </div>

      <div className="command-input-section">
        <div className="command-input-container">
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="What would you like me to do?"
            className="command-input"
          />
          <button
            onClick={() => handleCommandSubmit(commandInput)}
            className="command-submit-btn"
            disabled={!commandInput.trim()}
          >
            🚀
          </button>
        </div>
      </div>

      <div className="commands-content">
        <div className="command-examples">
          <h4>💡 Try These Commands</h4>
          <div className="examples-grid">
            {commandExamples.map(cmd => (
              <div
                key={cmd.id}
                className="command-example-card"
                onClick={() => setCommandInput(cmd.example)}
              >
                <div className="command-text">
                  <code>{cmd.command}</code>
                </div>
                <div className="command-description">{cmd.description}</div>
                <div className="command-example">
                  Example: "{cmd.example}"
                </div>
                <span className="command-category">{cmd.category}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="recent-commands">
          <h4>📝 Recent Commands</h4>
          <div className="recent-list">
            {recentCommands.map((cmd, index) => (
              <div
                key={index}
                className="recent-command-item"
                onClick={() => setCommandInput(cmd)}
              >
                <span className="command-text">{cmd}</span>
                <button className="reuse-btn">↻</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="commands-footer">
        <div className="command-tips">
          <p>💡 <strong>Pro tip:</strong> Commands work with natural language - try "clean up my downloads folder" or "organize my photos by date"</p>
        </div>
      </div>
    </div>
  );
};

export default NaturalLanguageCommands;
