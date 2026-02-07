# Specialized Agent Architecture

## The Problem We're Solving

The monolithic agent approach tries to make one model do everything:
- Parse tool calls
- Write JavaScript
- Write Python  
- Handle pipelines
- Integrate everything

This leads to "jack of all trades, master of none" - the agent produces half-assed work because it's trying to be good at everything.

## The Solution: Specialized Agents

Instead of one agent, we have **specialists**:

### 1. Tool Orchestrator
- **Role**: Handles tool calls, parsing, execution flow
- **Model**: `qwen3-coder:480b-cloud` (good at structured output)
- **Temperature**: 0.1 (needs precision)
- **Job**: Parse requests → Execute tools → Coordinate specialists

### 2. JavaScript Specialist
- **Role**: Writes JS/TS/React/Node code
- **Model**: `claude-sonnet-4-20250514` (best for JS)
- **Temperature**: 0.3
- **Job**: Write complete, production-ready JavaScript code

### 3. Python Specialist
- **Role**: Writes Python code
- **Model**: `claude-sonnet-4-20250514` (good for Python)
- **Temperature**: 0.3
- **Job**: Write complete, production-ready Python code

### 4. Pipeline Specialist
- **Role**: Handles build/deploy/CI/CD
- **Model**: `qwen3-coder:480b-cloud` (good at configs)
- **Temperature**: 0.2
- **Job**: Create build configs, pipelines, deployment setups

### 5. Integration Analyst
- **Role**: Reviews work, wires things together
- **Model**: `claude-opus-4-20250514` (best for analysis)
- **Temperature**: 0.2
- **Job**: Review all work, find missing connections, ensure coherence

## How It Works

```
User Request
    ↓
Tool Orchestrator (plans work)
    ↓
┌─────────────────────────────┐
│  Specialists Execute        │
│  (in parallel where possible)│
│  - JavaScript Specialist    │
│  - Python Specialist        │
│  - Pipeline Specialist      │
└─────────────────────────────┘
    ↓
Integration Analyst (reviews everything)
    ↓
Final Result
```

## Benefits

1. **Quality**: Each specialist is optimized for their domain
2. **Efficiency**: Use cheaper models for simple tasks, premium for complex
3. **Clarity**: Clear separation of concerns
4. **Maintainability**: Easy to improve individual specialists
5. **Scalability**: Add new specialists (e.g., Rust, Go) easily

## Usage

```typescript
import { SpecializedAgentLoop } from './agent/specialized-agent-loop';

const agent = new SpecializedAgentLoop(context);
const result = await agent.run("Create a React app with FastAPI backend");
```

## Configuration

Edit `AGENT_CONFIGS` in `specialized-agents.ts` to:
- Change models per specialist
- Adjust temperature
- Modify system prompts
- Add new specialists

## When to Use

**Use Specialized Agents when:**
- ✅ Multi-language projects (JS + Python)
- ✅ Complex projects with multiple files
- ✅ Need high quality output
- ✅ Want to optimize costs (use cheap models for simple tasks)

**Use Monolithic Agent when:**
- ✅ Simple, single-language tasks
- ✅ Quick iterations
- ✅ Don't want multiple model calls

## Future Enhancements

- [ ] Add Rust specialist
- [ ] Add Go specialist
- [ ] Add database specialist
- [ ] Add testing specialist
- [ ] Add documentation specialist
- [ ] Add security specialist

