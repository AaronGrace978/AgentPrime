# AgentPrime Developer Guide

## Architecture Overview

AgentPrime is built with Electron, using a main process for system operations and a renderer process for the UI.

```
AgentPrime/
├── src/
│   ├── main/           # Electron main process
│   │   ├── ai-providers/   # AI provider implementations
│   │   ├── core/           # Core business logic
│   │   ├── ipc-handlers/   # IPC communication handlers
│   │   ├── mirror/         # Mirror Intelligence system
│   │   ├── modules/        # Modular features (activateprime)
│   │   ├── plugins/        # Plugin system
│   │   ├── search/         # Codebase indexing
│   │   └── security/       # Security utilities
│   ├── renderer/       # React UI components
│   └── types/          # TypeScript type definitions
├── backend/            # Python FastAPI backend
└── tests/              # Test suites
```

## Development Setup

### Prerequisites

- Node.js 16+
- npm or yarn
- Python 3.9+ (for backend)
- Git

### Installation

```bash
git clone <repository>
cd AgentPrime
npm install
cd backend && pip install -r requirements.txt && cd ..
```

### Running in Development

```bash
npm run dev          # Start watchers
npm run start:dev    # Start app with hot reload
```

## IPC Communication

### Adding a New IPC Handler

1. Create handler in `src/main/ipc-handlers/`:

```typescript
import { ipcMain } from 'electron';

export function registerMyHandler(): void {
  ipcMain.handle('my-channel', async (event, data) => {
    // Handle request
    return { success: true, data };
  });
}
```

2. Register in `src/main/ipc-handlers/index.ts`

3. Expose in `src/main/preload.ts`:

```typescript
myMethod: (data: any) => ipcRenderer.invoke('my-channel', data),
```

## Adding AI Providers

1. Create provider in `src/main/ai-providers/`:

```typescript
export class MyProvider extends BaseProvider {
  async chat(messages: Message[]): Promise<Response> {
    // Implement chat
  }
  
  async complete(prompt: string): Promise<string> {
    // Implement completion
  }
}
```

2. Register in the AI router

## Plugin Development

### Plugin Structure

```
my-plugin/
├── plugin.json     # Plugin manifest
├── index.js        # Entry point
└── README.md       # Documentation
```

### plugin.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "main": "index.js",
  "activationEvents": ["*"]
}
```

### Plugin Entry Point

```javascript
exports.activate = function(context) {
  context.commands.registerCommand('my-command', () => {
    context.editor.showInformationMessage('Hello from plugin!');
  });
};

exports.deactivate = function() {
  // Cleanup
};
```

## Testing

### Unit Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

### E2E Tests

```bash
npm run test:e2e         # Run Playwright tests
```

### Python Backend Tests

```bash
cd backend
pytest                   # Run Python tests
```

## Building for Production

### All Platforms

```bash
npm run dist:all
```

### Specific Platform

```bash
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

## Code Style

- Follow ESLint configuration
- Use TypeScript for type safety
- Write tests for new features
- Document public APIs with JSDoc

## Contributing

1. Create a feature branch
2. Write tests first (TDD)
3. Implement the feature
4. Submit a pull request

## Security Guidelines

- Never commit API keys
- Use secure IPC communication
- Validate all user inputs
- Use CSP headers for web content
