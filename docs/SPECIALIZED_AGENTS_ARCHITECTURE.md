# Specialized Agent Architecture

## The Insight

Your gut was right - we were over-engineering the monolithic agent. Instead of making one agent do everything (and doing it poorly), we now have **specialists** who each excel at their domain.

## The Architecture

### Before (Monolithic)
```
One Agent
  ├─ Parse tool calls
  ├─ Write JavaScript
  ├─ Write Python
  ├─ Handle pipelines
  └─ Integrate everything
```
**Problem**: Jack of all trades, master of none → half-assed products

### After (Specialized)
```
Tool Orchestrator (coordinates)
  ├─ JavaScript Specialist (writes JS)
  ├─ Python Specialist (writes Python)
  ├─ Pipeline Specialist (builds/deploys)
  └─ Integration Analyst (reviews & wires)
```
**Solution**: Each specialist is optimized for their domain → quality products

## The Specialists

### 1. Tool Orchestrator
- **Model**: `qwen3-coder:480b-cloud` (cheap, good at structured output)
- **Job**: Parse requests, execute tools, coordinate specialists
- **Why**: Needs precision, not creativity

### 2. JavaScript Specialist  
- **Model**: `claude-sonnet-4-20250514` (best for JS)
- **Job**: Write complete, production-ready JS/TS/React code
- **Why**: Claude excels at JavaScript

### 3. Python Specialist
- **Model**: `claude-sonnet-4-20250514` (good for Python)
- **Job**: Write complete, production-ready Python code
- **Why**: Claude understands Python patterns well

### 4. Pipeline Specialist
- **Model**: `qwen3-coder:480b-cloud` (good at configs)
- **Job**: Create build configs, CI/CD, deployment
- **Why**: Structured configs, not creative code

### 5. Integration Analyst
- **Model**: `claude-opus-4-20250514` (best for analysis)
- **Job**: Review all work, find missing connections, ensure coherence
- **Why**: Needs deep understanding to catch integration issues

## Benefits

1. **Quality**: Each specialist uses the best model for their job
2. **Cost**: Use cheap models for simple tasks, premium for complex
3. **Clarity**: Clear separation of concerns
4. **Maintainability**: Easy to improve individual specialists
5. **Scalability**: Add new specialists easily (Rust, Go, etc.)

## Example Flow

**Task**: "Create a React app with FastAPI backend"

1. **Tool Orchestrator** plans: "Need JS specialist for React, Python specialist for FastAPI, Pipeline specialist for setup"
2. **JavaScript Specialist** writes React code (using Claude Sonnet 4)
3. **Python Specialist** writes FastAPI code (using Claude Sonnet 4)
4. **Pipeline Specialist** creates package.json, requirements.txt, etc. (using Qwen)
5. **Integration Analyst** reviews everything, finds missing connections, ensures coherence (using Claude Opus 4)

## Implementation

Files created:
- `src/main/agent/specialized-agents.ts` - Agent definitions and routing
- `src/main/agent/specialized-agent-loop.ts` - Execution loop
- `src/main/agent/SPECIALIZED_AGENTS.md` - Usage guide

## Usage

```typescript
import { SpecializedAgentLoop } from './agent/specialized-agent-loop';

const agent = new SpecializedAgentLoop(context);
const result = await agent.run("Create a React app with FastAPI backend");
```

## Configuration

Edit `AGENT_CONFIGS` in `specialized-agents.ts` to customize:
- Models per specialist
- Temperature settings
- System prompts
- Add new specialists

## When to Use

**Use Specialized Agents:**
- ✅ Multi-language projects
- ✅ Complex projects with multiple files
- ✅ Need high quality output
- ✅ Want to optimize costs

**Use Monolithic Agent:**
- ✅ Simple, single-language tasks
- ✅ Quick iterations
- ✅ Don't want multiple model calls

## Next Steps

1. Integrate with existing tool execution system
2. Add more specialists (Rust, Go, database, testing)
3. Add caching to avoid redundant specialist calls
4. Add parallel execution where possible
5. Add feedback loop to improve specialist prompts

## The Philosophy

> "A team of specialists beats one generalist every time."

Instead of trying to make one agent perfect at everything, we have specialists who are excellent at their domain. This is simpler, more maintainable, and produces better results.

