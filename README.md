# AgentPrime - AI Coding Assistant IDE

A sophisticated AI-powered desktop IDE that works like Cursor, featuring multiple AI providers, intelligent code assistance, and advanced development tools.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn
- Git

### Installation & Running

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd AgentPrime
   npm install
   ```

2. **Quick development start (recommended):**
   ```bash
   npm run quick-start
   ```
   This builds the project and starts development mode with hot reloading.

3. **Or manually:**
   ```bash
   # Build the project
   npm run build

   # Start in development mode (with hot reloading)
   npm run start:dev

   # Or just run the built version
   npm start
   ```

## 🎯 Features

### 🤖 AI Integration
- **Multiple AI Providers**: Anthropic Claude, OpenAI GPT, Ollama, OpenRouter
- **Smart Model Routing**: Automatically selects the best model for each task
- **Intelligent Context**: Automatic file discovery and context building (Cursor-style)
- **Streaming Responses**: Real-time AI responses for better UX

### 📝 Code Intelligence
- **Semantic Search**: Find code by meaning, not just text
- **Context Compression**: Intelligent summarization for infinite memory
- **Codebase Introspection**: Automatic dependency analysis and architecture understanding
- **Inline Completions**: AI-powered code suggestions as you type

### 🛠️ Development Tools
- **Template System**: Generate projects from templates
- **Task Management**: Built-in task tracking and project management
- **Script Execution**: Run and debug scripts directly in the IDE
- **Git Integration**: Version control right in the interface

### 🎨 Modern UI
- **Cursor-inspired Design**: Familiar interface similar to VS Code/Cursor
- **Dark Theme**: Easy on the eyes for long coding sessions
- **Responsive Layout**: Works on different screen sizes
- **Activity Bar**: Quick access to different views and tools

## 📋 Development Scripts

```bash
# Build commands
npm run build              # Build both main and renderer
npm run build:main         # Build main process only
npm run build:renderer     # Build renderer only

# Development commands
npm run dev                # Start development watchers
npm run start:dev          # Full dev mode with hot reloading
npm run quick-start        # Build and start in one command

# Testing
npm test                   # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage
npm run test:e2e           # Run end-to-end tests

# Code quality
npm run lint               # Run ESLint
npm run typecheck          # Run TypeScript type checking
```

## 🏗️ Project Structure

```
AgentPrime/
├── src/
│   ├── main/              # Electron main process
│   │   ├── ai-providers/  # AI provider implementations
│   │   ├── core/          # Core business logic
│   │   ├── ipc-handlers/  # IPC communication handlers
│   │   ├── mirror/        # AI mirroring system
│   │   └── tools/         # Utility tools
│   ├── renderer/          # Electron renderer (UI)
│   │   ├── components/    # React components
│   │   └── styles.css     # Main styles
│   └── types/             # TypeScript type definitions
├── templates/             # Project templates
├── scripts/               # Build and utility scripts
└── dist/                  # Built output
```

## 🔧 Configuration

### AI Providers

Configure your AI providers in the settings. Supported providers:

- **Ollama** (local, free): Best for offline development
- **Anthropic Claude** (cloud): Excellent reasoning capabilities
- **OpenAI GPT** (cloud): Versatile and reliable
- **OpenRouter** (cloud): Access to multiple models

### Keyboard Shortcuts

- `Ctrl+Shift+C`: Open Composer (AI chat)
- `Ctrl+Shift+T`: Open Task Manager
- `Ctrl+S`: Save current file
- `Ctrl+B`: Toggle sidebar
- `Ctrl+``: Toggle terminal panel

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -am 'Add my feature'`
6. Push to the branch: `git push origin feature/my-feature`
7. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🐛 Troubleshooting

### Build Issues
- Make sure Node.js 16+ is installed
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check for TypeScript errors: `npm run typecheck`

### Runtime Issues
- Check the console for error messages
- Ensure AI provider API keys are configured correctly
- Try restarting the application

### Performance Issues
- Close unused files and panels
- Restart the application to clear memory
- Check system resources (RAM, CPU)

## Building for Distribution

```bash
# Build for all platforms
npm run dist:all

# Build for specific platform
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

Built packages will be in the `release/` directory.

## License

This project is open source and available under the MIT License.