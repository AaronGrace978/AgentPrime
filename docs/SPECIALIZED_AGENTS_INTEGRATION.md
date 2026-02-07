# Specialized Agents Integration Guide

## Changes Made

### Backend (IPC Handler)
✅ **Modified**: `src/main/ipc-handlers/chat.ts`
- Added support for `use_specialized_agents` flag
- Conditionally uses `SpecializedAgentLoop` vs `AgentLoop`
- Maintains backward compatibility (defaults to monolithic)

### Usage

#### Option 1: Enable via Context (Current)
The chat handler now checks for `use_specialized_agents` or `specialized_mode` in the context:

```typescript
// In AIChat component or anywhere that calls chat API
const result = await window.agentAPI.chat(message, {
  agent_mode: true,
  use_agent_loop: true,
  use_specialized_agents: true,  // ← Enable specialized agents
  model: 'claude-sonnet-4-20250514'
});
```

#### Option 2: Auto-Detection (Future)
Could automatically use specialized agents for:
- Multi-language projects (JS + Python)
- Complex tasks (multiple files)
- Projects with build configs

## UI Integration (Optional)

### Current State
The UI doesn't need changes - specialized agents work automatically when the flag is set.

### Future Enhancement: Toggle in UI
Could add a toggle in AIChat component:

```tsx
const [useSpecializedAgents, setUseSpecializedAgents] = useState(false);

// In sendMessage:
const result = await window.agentAPI.chat(message, {
  agent_mode: true,
  use_agent_loop: true,
  use_specialized_agents: useSpecializedAgents,  // ← User choice
  model: selectedModel
});
```

## Testing

To test specialized agents:

1. **Via Code**: Set `use_specialized_agents: true` in chat context
2. **Via Settings**: Add a setting to enable specialized agents by default
3. **Auto-Detection**: Could auto-enable for complex tasks

## Backward Compatibility

✅ **Fully Compatible**: 
- Default behavior unchanged (monolithic agent)
- Only activates when `use_specialized_agents: true`
- Existing code continues to work

## Next Steps

1. ✅ Backend integration complete
2. ⏳ Add UI toggle (optional)
3. ⏳ Add auto-detection logic
4. ⏳ Add settings option
5. ⏳ Test with real tasks

