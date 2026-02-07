/**
 * AIChat Constants - Model options and configuration
 */

import { ModelOption } from './types';

// Model options for dropdown by provider
export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  ollama: [
    // NEW Cloud Models (just pulled!)
    { value: 'deepseek-v3.2:cloud', label: '🚀 DeepSeek v3.2 (NEW!)' },
    { value: 'glm-4.7:cloud', label: '🌟 GLM-4.7 (NEW!)' },
    { value: 'kimi-k2.5:cloud', label: '🖼️ Kimi K2.5 (256K, vision)' },
    { value: 'gemini-3-flash-preview:cloud', label: '⚡ Gemini 3 Flash (NEW!)' },
    { value: 'nemotron-3-nano:30b-cloud', label: '💎 Nemotron 3 Nano (30B)' },
    { value: 'minimax-m2.1:cloud', label: '🎯 MiniMax M2.1 (NEW!)' },
    { value: 'devstral-2:123b-cloud', label: '💪 Devstral 2 (123B)' },
    // Existing Cloud Models
    { value: 'devstral-small-2:24b-cloud', label: '⚡ Devstral Small (24B)' },
    { value: 'qwen3-coder:480b-cloud', label: '🧠 Qwen 3 Coder (480B)' },
    { value: 'deepseek-v3.1:671b-cloud', label: '🔍 DeepSeek v3.1 (671B)' },
    { value: 'glm-4.6:cloud', label: '🌟 GLM-4.6 (200K ctx)' },
    { value: 'mistral-large-3:675b-cloud', label: '💫 Mistral Large (675B)' },
    { value: 'gemini-3-pro-preview:latest', label: '💎 Gemini 3 Pro Preview' },
    // Local Models
    { value: 'qwen2.5-coder:7b', label: '⚡ Qwen 2.5 Coder (7B)' },
    { value: 'qwen2.5-coder:32b', label: '🧠 Qwen 2.5 Coder (32B)' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6', label: '🧠 Claude Opus 4.6 (Flagship)' },
    { value: 'claude-opus-4-5-20251101', label: '🧠 Claude Opus 4.5 (Frontier)' },
    { value: 'claude-opus-4-20250514', label: '🧠 Claude Opus 4 (Legacy)' },
    { value: 'claude-sonnet-4-20250514', label: '🎭 Claude Sonnet 4 (Latest & Best)' },
    { value: 'claude-3-5-haiku-20241022', label: '⚡ Claude 3.5 Haiku (Fast)' },
    { value: 'claude-3-haiku-20240307', label: '⚡ Claude 3 Haiku' },
    { value: 'claude-3-5-haiku-latest', label: '⚡ Claude 3.5 Haiku Latest' },
  ],
  openai: [
    { value: 'gpt-5.2-2025-12-11', label: '🤖 GPT-5.2 (Latest)' },
    { value: 'gpt-5.2', label: '🧠 GPT-5.2 (Flagship)' },
    { value: 'gpt-4o', label: '🧠 GPT-4o' },
    { value: 'gpt-4o-mini', label: '⚡ GPT-4o Mini' },
  ],
  openrouter: [
    { value: 'anthropic/claude-sonnet-4-20250514', label: '🎭 Claude Sonnet 4' },
    { value: 'openai/gpt-4o', label: '🧠 GPT-4o' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: '🦙 Llama 3.3 70B' },
  ]
};

// Default brain configuration
export const DEFAULT_BRAIN_CONFIG = {
  fastModel: { provider: 'ollama', model: 'qwen2.5-coder:7b', enabled: true },  // Local fast model
  deepModel: { provider: 'ollama', model: 'qwen2.5-coder:14b', enabled: true }  // Local deep model
};

// Default dual model state
export const DEFAULT_DUAL_MODEL_STATE = {
  enabled: true,
  mode: 'auto' as const,
  currentModel: '',
  currentProvider: '',
  lastComplexity: 5,
  lastReasoning: ''
};

// Quick prompts for new users
export const QUICK_PROMPTS = [
  { text: '🎮 Build a game', prompt: 'Build a simple browser-based game with HTML, CSS, and JavaScript' },
  { text: '🌐 Create a website', prompt: 'Create a modern landing page with responsive design' },
  { text: '🔧 Fix a bug', prompt: 'Help me debug and fix issues in my code' },
  { text: '📖 Explain code', prompt: 'Explain how this codebase works' }
];

// Welcome message
export const WELCOME_MESSAGE = {
  role: 'assistant' as const,
  content: '🤖 **AgentPrime Ready!**\n\nAgent Mode is **ON** - I can autonomously write code, create files, and build projects for you.\n\n**Quick Start:**\n1. 📂 Select a workspace folder above\n2. 🧠 Pick your brain (Fast ⚡ or Deep 🧠)\n3. Tell me what to build!\n\n*Example: "Build a todo app with React" or "Create a REST API with Express"*',
  timestamp: new Date(),
  type: 'system' as const
};

