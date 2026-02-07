# AgentPrime - Comprehensive System Analysis

## Executive Summary

AgentPrime is a sophisticated AI-powered desktop IDE built with Electron, designed to replicate and enhance the Cursor IDE experience. The system features a multi-layered architecture with TypeScript/JavaScript frontend, Python backend, multiple AI providers, intelligent code generation, and advanced learning capabilities.

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │  Main Process   │◄───────►│  Renderer Process│          │
│  │  (Node.js/TS)   │   IPC   │  (React/TS)       │          │
│  └────────┬────────┘         └────────┬─────────┘          │
│           │                           │                      │
│           │                           │                      │
│  ┌────────▼──────────────────────────▼─────────┐          │
│  │         Preload Script (Bridge)              │          │
│  │         (Secure IPC Communication)            │          │
│  └───────────────────────────────────────────────┘          │
│                                                               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ HTTP/REST
                        │
┌───────────────────────▼─────────────────────────────────────┐
│              Python Backend (FastAPI)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Memory     │  │ Orchestrator  │  │   Analyzer   │    │
│  │   Store      │  │   (Router)    │  │  (Patterns)  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

**Frontend (Renderer Process)**
- React 18.2.0 with TypeScript
- Monaco Editor (VS Code editor)
- Custom UI components
- IPC communication via preload bridge

**Backend (Main Process)**
- Electron 28.0.0
- Node.js with TypeScript
- Webpack for bundling
- Multiple AI provider integrations

**Python Backend**
- FastAPI
- SQLite for persistent memory
- TF-IDF semantic search
- Background code analysis

**AI Providers**
- Ollama (local/cloud)
- Anthropic Claude
- OpenAI GPT
- OpenRouter (multi-model gateway)

---

## 2. Core Components

### 2.1 Main Process (`src/main/main.ts`)

**Responsibilities:**
- Application lifecycle management
- Window creation and management
- Settings persistence
- Module initialization and lazy loading
- IPC handler registration

**Key Features:**
- Dual Ollama support (primary + secondary instances)
- Dual Model System (fast/deep model routing)
- Template engine initialization
- Mirror intelligence system setup
- Backend manager (auto-starts Python backend)

**Settings Management:**
```typescript
- Theme configuration
- Font size and editor preferences
- Auto-save settings
- Inline completions toggle
- AI provider configurations
- Dual model routing configuration
```

### 2.2 IPC Communication System

**Preload Bridge (`src/main/preload.ts`)**
- Secure context bridge exposing `agentAPI` to renderer
- Validates all IPC channels
- Type-safe API surface

**IPC Handlers (`src/main/ipc-handlers/`)**
- **files.ts**: File operations (read, write, create, delete)
- **chat.ts**: AI chat and streaming
- **templates.ts**: Project template creation
- **git.ts**: Git operations
- **commands.ts**: Command execution
- **agent.ts**: Agent loop operations
- **mirror.ts**: Mirror intelligence operations
- **search.ts**: Semantic search
- **analysis.ts**: Code analysis
- **brain-handler.ts**: Python backend integration

**Communication Pattern:**
```
Renderer → agentAPI.method() → IPC → Main Handler → Response → Renderer
```

### 2.3 AI Provider System

**Router (`src/main/ai-providers/index.ts`)**

**Features:**
- Multi-provider abstraction
- Automatic fallback handling
- Dual Model System with auto-routing
- Complexity analysis for task routing
- Smart model selection based on task type

**Dual Model System:**
```typescript
- Fast Model: Quick responses for simple tasks
- Deep Model: Complex reasoning for difficult tasks
- Auto-Route: Analyzes complexity and routes automatically
- Manual Override: User can force fast/deep mode
```

**Complexity Analysis:**
- Analyzes message content
- Detects trigger keywords
- Estimates task complexity (0-10 scale)
- Routes to appropriate model tier

**Provider Implementations:**
- `OllamaProvider`: Local/cloud Ollama instances
- `AnthropicProvider`: Claude API integration
- `OpenAIProvider`: GPT models
- `OpenRouterProvider`: Multi-model gateway

### 2.4 Agent Loop System

**Location:** `src/main/agent-loop.ts`

**Capabilities:**
- Tool-calling agent with function execution
- File operations (read, write, create, delete)
- Terminal command execution
- Git operations
- Code validation and auto-fixing
- Multi-step task planning
- Self-verification and error recovery

**Tool Registry:**
```typescript
- read_file: Read files with line filtering
- write_file: Write/create files with directory creation
- list_files: List directory contents
- run_command: Execute terminal commands
- apply_diff: Apply code diffs
- search_codebase: Semantic code search
- analyze_code: Code analysis and linting
```

**Agent Context:**
- Workspace path
- Current file
- Open files
- Terminal history
- Git status
- Model selection

### 2.5 Renderer Process (UI)

**Main Components (`src/renderer/components/`)**

**AIChat.tsx** (1,632 lines)
- Primary AI interaction interface
- Dual model mode selection
- Streaming response handling
- Agent mode toggle
- Context building
- File operations integration

**Key Features:**
- Real-time streaming responses
- Model switching (fast/deep/auto)
- Agent mode with tool execution
- Context-aware suggestions
- Conversation history management

**Other Components:**
- `App.tsx`: Main application shell
- `EditorPane.tsx`: Monaco editor wrapper
- `FileTree.tsx`: File explorer
- `Settings.tsx`: Configuration UI
- `TemplateGallery.tsx`: Project template picker
- `TaskManager.tsx`: Task tracking
- `GitPanel.tsx`: Git operations UI

### 2.6 Python Backend

**FastAPI Application (`backend/app/main.py`)**

**Endpoints:**
- `/api/files/*`: File operations
- `/api/chat/*`: AI chat (alternative to main process)
- `/api/terminal/*`: Terminal operations
- `/api/brain/*`: Brain/orchestrator operations

**Core Modules:**

**Memory Store (`backend/app/core/memory.py`)**
- SQLite database for persistent storage
- TF-IDF semantic search
- Stores:
  - Code patterns
  - Conversations
  - Task outcomes
  - User preferences

**Orchestrator (`backend/app/core/orchestrator.py`)**
- Task routing and decision making
- Analyzes task complexity
- Selects appropriate agent/model
- Learns from outcomes
- Tracks decision history

**Analyzer (`backend/app/core/analyzer.py`)**
- Background code analysis
- Pattern detection
- Style analysis
- Architecture understanding

**Backend Manager (`src/main/core/backend-manager.ts`)**
- Auto-starts Python backend if needed
- Health checking
- Port management
- Process lifecycle

### 2.7 Template System

**Template Engine (`src/main/legacy/template-engine.ts`)**

**Features:**
- Project generation from templates
- Variable substitution (`{{projectName}}`, etc.)
- Directory structure creation
- File content templating

**Available Templates:**
- Electron + React
- Tauri + React
- Full-stack React + FastAPI
- Full-stack React + Express
- Next.js full-stack
- Vue + Vite
- SvelteKit
- Go microservice
- Rust CLI
- Python CLI

**Template Structure:**
```
templates/
  {template-id}/
    template.json    # Template definition
    {files...}       # Template files with variables
```

### 2.8 Mirror Intelligence System

**Purpose:** Learn from high-quality code examples and improve generation

**Components:**

**MirrorMemory (`src/main/mirror/mirror-memory.ts`)**
- Stores learned patterns
- Pattern retrieval by relevance
- Intelligence metrics tracking
- Feedback loop storage

**Pattern Extractor (`src/main/mirror/mirror-pattern-extractor.ts`)**
- Extracts patterns from code examples
- Categorizes patterns (architecture, style, etc.)
- Stores in mirror memory

**Intelligence Expansion (`scripts/mirror/intelligence-expansion.js`)**
- Intelligence growth formula: `I(n+1) = I(n) + (Q/R) × E`
  - Q = Quality (meta-questions)
  - R = Resistance (pattern novelty)
  - E = Experience (iterations)
- Tracks intelligence metrics
- Applies expansion to generation tasks

**Feedback Loop (`scripts/mirror/mirror-feedback-loop.js`)**
- Iterative improvement cycles
- Compares outputs to targets
- Reduces resistance over time
- Calculates intelligence growth

**Knowledge Ingester (`src/main/mirror/mirror-knowledge-ingester.ts`)**
- Ingests patterns from external sources
- Processes opus examples
- Updates intelligence metrics
- Pattern learning from high-quality code

**Adaptive Code Generator (`src/main/mirror/adaptive-code-generator.ts`)**
- Uses learned patterns for generation
- Builds enhanced prompts with patterns
- Applies intelligence metrics
- Context-aware code generation

### 2.9 Search and Indexing

**Codebase Indexer (`src/main/search/indexer.ts`)**
- Indexes workspace code
- Semantic search capabilities
- File relevance ranking
- Context building support

**Embeddings (`src/main/search/embeddings.ts`)**
- Text embedding generation
- Similarity search
- Vector operations

### 2.10 Context Building

**Context Builder (`src/main/core/context-builder.ts`)**
- Automatic file discovery
- Relevant code extraction
- Context compression
- Intelligent summarization

**Context Awareness Engine (`src/main/core/context-awareness-engine.ts`)**
- Understands code relationships
- Dependency analysis
- Architecture detection
- Smart context selection

**Context Compression (`src/main/core/context-compression-engine.ts`)**
- Summarizes large codebases
- Maintains important details
- Reduces token usage
- Preserves semantic meaning

---

## 3. Data Flow

### 3.1 User Request Flow

```
User Input (AIChat)
    ↓
Agent Loop (if agent mode)
    ↓
Context Builder (gathers relevant files)
    ↓
AI Provider Router (selects model)
    ↓
AI Provider (generates response)
    ↓
Tool Execution (if tool calls)
    ↓
Response Streaming (to UI)
    ↓
Mirror System (learns from interaction)
```

### 3.2 File Operation Flow

```
Renderer: agentAPI.writeFile()
    ↓
Preload: IPC invoke('file:write')
    ↓
Main: IPC handler (files.ts)
    ↓
File System: fs.writeFileSync()
    ↓
Response: Success/Error
    ↓
Renderer: Update UI
```

### 3.3 AI Chat Flow

```
User Message
    ↓
Context Building (relevant files, history)
    ↓
Dual Model Routing (if enabled)
    ↓
AI Provider Selection
    ↓
Streaming Request
    ↓
Streaming Response (chunks)
    ↓
UI Update (real-time)
    ↓
Mirror Learning (pattern extraction)
```

---

## 4. Key Features

### 4.1 Dual Model System

**Purpose:** Optimize for speed vs. quality based on task complexity

**Modes:**
- **Fast**: Quick responses for simple tasks
- **Deep**: Complex reasoning for difficult tasks
- **Auto**: Automatically routes based on analysis

**Configuration:**
```typescript
dualModelConfig: {
  fastModel: { provider, model, enabled },
  deepModel: { provider, model, enabled },
  autoRoute: boolean,
  complexityThreshold: number,
  triggers: { deep: [...], fast: [...] }
}
```

### 4.2 Agent Mode

**Capabilities:**
- Autonomous code writing
- File creation and modification
- Command execution
- Multi-step task planning
- Self-verification
- Error recovery

**Tool System:**
- Function calling interface
- Parameter validation
- Result verification
- Auto-fixing capabilities

### 4.3 Semantic Search

**Features:**
- Find code by meaning
- Vector similarity search
- Context-aware results
- Relevance ranking

### 4.4 Template System

**Features:**
- Pre-configured project templates
- Variable substitution
- Complete project structure
- Ready-to-run examples

### 4.5 Mirror Intelligence

**Learning System:**
- Extracts patterns from examples
- Stores in persistent memory
- Applies to future generations
- Intelligence growth tracking

---

## 5. Configuration

### 5.1 Settings File

**Location:** `{userData}/settings.json`

**Structure:**
```json
{
  "theme": "vs-dark",
  "fontSize": 14,
  "autoSave": true,
  "inlineCompletions": true,
  "activeProvider": "ollama",
  "activeModel": "qwen3-coder:480b-cloud",
  "dualModelEnabled": false,
  "dualModelConfig": { ... },
  "providers": {
    "ollama": { "baseUrl", "apiKey", "model" },
    "anthropic": { "apiKey", "model" },
    "openai": { "apiKey", "model" },
    "openrouter": { "apiKey", "model" }
  }
}
```

### 5.2 Environment Variables

**Backend (.env):**
```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder:480b-cloud
OLLAMA_API_KEY=...
WORKSPACE_ROOT=...
```

### 5.3 Python Backend Config

**Location:** `backend/app/config.py`

**Settings:**
- Ollama connection
- Workspace root
- Database path
- Model selection

---

## 6. Build System

### 6.1 Webpack Configuration

**Main Process:**
- `webpack.main.config.js`
- Bundles TypeScript to JavaScript
- Output: `dist/main/`

**Renderer Process:**
- `webpack.renderer.config.js`
- Bundles React/TypeScript
- Output: `dist/renderer/`

### 6.2 TypeScript Configuration

**Main:** `tsconfig.main.json`
**Renderer:** `tsconfig.renderer.json`
**Root:** `tsconfig.json`

### 6.3 Build Scripts

```bash
npm run build          # Build both processes
npm run build:main     # Build main only
npm run build:renderer # Build renderer only
npm run dev            # Development with watch
npm run start:dev      # Build and start
```

---

## 7. Testing

### 7.1 Test Structure

**Unit Tests:**
- `tests/ai-providers.test.js`
- `tests/template-engine.test.js`
- `tests/ipc-handlers/`

**E2E Tests:**
- `tests/e2e/` (Playwright)

**Test Scripts:**
```bash
npm test              # Run unit tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:e2e      # E2E tests
```

---

## 8. Security

### 8.1 Electron Security

- `contextIsolation: true`
- `nodeIntegration: false`
- Preload script for secure IPC
- Content Security Policy (CSP)

### 8.2 API Key Management

- Stored in user settings (encrypted in production)
- Never committed to version control
- Environment variable support
- Secure IPC communication

---

## 9. Performance Considerations

### 9.1 Lazy Loading

- Modules loaded on demand
- Template engine lazy initialization
- Mirror system optional loading

### 9.2 Caching

- Settings cached in memory
- Pattern cache in mirror memory
- Codebase index caching

### 9.3 Streaming

- AI responses streamed in real-time
- Reduces perceived latency
- Better user experience

---

## 10. Known Architecture Notes

### 10.1 Legacy Code

- Some modules still in JavaScript (`legacy/` folder)
- Gradual migration to TypeScript
- Template engine has both .js and .ts versions

### 10.2 Module Loading

- Complex path resolution for dev vs. production
- Uses `app.getAppPath()` when available
- Falls back to `__dirname` calculations

### 10.3 Dual Ollama

- Primary: `localhost:11434`
- Secondary: `localhost:11435`
- Fallback support
- Load balancing potential

---

## 11. Future Enhancements

### 11.1 Planned Features

- Complete TypeScript migration
- Enhanced error recovery
- Better offline support
- Improved template system
- Advanced code analysis
- Multi-window support

### 11.2 Technical Debt

- Legacy JavaScript modules
- Path resolution complexity
- Some duplicate code
- Test coverage gaps

---

## 12. Dependencies

### 12.1 Key Dependencies

**Frontend:**
- React 18.2.0
- Monaco Editor
- TypeScript 5.9.3

**Backend:**
- Electron 28.0.0
- Axios 1.6.0
- Webpack 5.104.0

**Python:**
- FastAPI
- SQLite
- Pydantic

### 12.2 Development Tools

- Jest (testing)
- Playwright (E2E)
- ESLint (linting)
- TypeScript (type checking)

---

## 13. File Structure Summary

```
AgentPrime/
├── src/
│   ├── main/              # Main process (Electron)
│   │   ├── ai-providers/  # AI provider implementations
│   │   ├── agent/         # Agent tools
│   │   ├── core/          # Core business logic
│   │   ├── ipc-handlers/  # IPC communication
│   │   ├── mirror/        # Mirror intelligence
│   │   ├── search/        # Search/indexing
│   │   └── main.ts        # Entry point
│   ├── renderer/          # Renderer process (React)
│   │   ├── components/    # UI components
│   │   └── agent/         # Agent logic (renderer)
│   └── types/             # TypeScript types
├── backend/               # Python backend
│   └── app/
│       ├── api/           # API endpoints
│       ├── core/          # Core logic
│       └── main.py        # FastAPI app
├── templates/             # Project templates
├── dist/                  # Build output
└── tests/                 # Test files
```

---

## 14. Conclusion

AgentPrime is a sophisticated, multi-layered AI-powered IDE with:

- **Strong Architecture**: Clean separation of concerns, modular design
- **Advanced AI Integration**: Multiple providers, smart routing, dual model system
- **Intelligent Features**: Agent mode, semantic search, context awareness
- **Learning Capabilities**: Mirror intelligence system for continuous improvement
- **Developer Experience**: Template system, modern UI, comprehensive tooling

The system demonstrates production-ready architecture with room for continued enhancement and optimization.

---

**Analysis Date:** 2024
**System Version:** 1.0.0
**Total Lines of Code:** ~50,000+ (estimated)

