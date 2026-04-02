/**
 * AIChat Constants - Model options and configuration
 */

import { ModelOption } from './types';

export type ModelProvider = 'ollama' | 'anthropic' | 'openai' | 'openrouter';

export const PROVIDER_OPTIONS: Array<{ value: ModelProvider; label: string; description: string }> = [
  { value: 'openai', label: 'OpenAI', description: 'GPT models for general chat and coding' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude models for reasoning-heavy work' },
  { value: 'ollama', label: 'Ollama', description: 'Local and cloud-hosted open models' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Multi-provider access from one endpoint' }
];

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  openrouter: 'OpenRouter'
};

// Model options for dropdown by provider
export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  ollama: [
    { value: 'minimax-m2.7:cloud', label: 'MiniMax M2.7 - New Frontier' },
    { value: 'qwen3.5:cloud', label: 'Qwen 3.5 - Multimodal Latest' },
    { value: 'qwen3-coder-next:cloud', label: 'Qwen 3 Coder Next - Agentic' },
    { value: 'qwen3-coder:480b-cloud', label: 'Qwen 3 Coder - Frontier' },
    { value: 'qwen3-vl:cloud', label: 'Qwen 3 VL - Vision + Tools' },
    { value: 'qwen3-next:cloud', label: 'Qwen 3 Next - Efficient Reasoning' },
    { value: 'deepseek-v3.2:cloud', label: 'DeepSeek v3.2 - Latest' },
    { value: 'deepseek-v3.1:671b-cloud', label: 'DeepSeek v3.1 - Large Context' },
    { value: 'devstral-2:123b-cloud', label: 'Devstral 2 - Coding' },
    { value: 'devstral-small-2:24b-cloud', label: 'Devstral Small - Fast Coding' },
    { value: 'ministral-3:cloud', label: 'Ministral 3 - Edge Friendly' },
    { value: 'nemotron-3-super:cloud', label: 'Nemotron 3 Super - Thinking' },
    { value: 'nemotron-3-nano:30b-cloud', label: 'Nemotron 3 Nano - Lightweight Agentic' },
    { value: 'glm-5:cloud', label: 'GLM-5 - Strong Reasoning' },
    { value: 'glm-4.7:cloud', label: 'GLM-4.7 - New' },
    { value: 'rnj-1:cloud', label: 'RNJ-1 - Code and STEM' },
    { value: 'gemini-3-pro-preview:latest', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-3-flash-preview:cloud', label: 'Gemini 3 Flash - Fast' },
    { value: 'kimi-k2.5:cloud', label: 'Kimi K2.5 - Vision + 256K' },
    { value: 'minimax-m2.5:cloud', label: 'MiniMax M2.5' },
    { value: 'minimax-m2.1:cloud', label: 'MiniMax M2.1 - New' },
    { value: 'mistral-large-3:675b-cloud', label: 'Mistral Large 3' },
    { value: 'qwen2.5-coder:32b', label: 'Qwen 2.5 Coder 32B - Local' },
    { value: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B - Local' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 - Frontier' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 - Best Default' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 - Fastest' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 - Alias' },
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku - Fast' },
    { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku - Latest Alias' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 - Legacy' },
  ],
  openai: [
    { value: 'gpt-5.4', label: 'GPT-5.4 - Frontier Default' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini - Fast Coding' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano - Lightweight' },
    { value: 'gpt-5.3-instant', label: 'GPT-5.3 Instant - Speed' },
    { value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2 - Previous Pinned' },
    { value: 'gpt-5.2', label: 'GPT-5.2 - Previous Alias' },
    { value: 'gpt-4o', label: 'GPT-4o - Balanced' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini - Fast' },
  ],
  openrouter: [
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  ]
};

export function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider as ModelProvider] || provider;
}

export function getModelOptionsForProvider(provider: string): ModelOption[] {
  return MODEL_OPTIONS[provider] || [];
}

export function getModelLabel(provider: string, model: string): string {
  const match = getModelOptionsForProvider(provider).find((option) => option.value === model);
  return match?.label || model;
}

// Default brain configuration
export const DEFAULT_BRAIN_CONFIG = {
  fastModel: { provider: 'ollama', model: 'devstral-small-2:24b-cloud', enabled: true },
  deepModel: { provider: 'ollama', model: 'qwen3-coder-next:cloud', enabled: true }
};

// Default dual model state
export const DEFAULT_DUAL_MODEL_STATE = {
  enabled: true,
  mode: 'standard' as const,
  currentModel: '',
  currentProvider: '',
  lastComplexity: 5,
  lastReasoning: ''
};

// Quick prompts for new users (agent mode)
export const QUICK_PROMPTS = [
  { text: 'Build a game', prompt: 'Build a simple browser-based game with HTML, CSS, and JavaScript' },
  { text: 'Create a website', prompt: 'Create a modern landing page with responsive design' },
  { text: 'Fix a bug', prompt: 'Help me debug and fix issues in my code' },
  { text: 'Explain code', prompt: 'Explain how this codebase works' }
];

export const CHAT_QUICK_PROMPTS = [
  { text: 'Explain something', prompt: 'Can you explain how async/await works in simple terms?' },
  { text: 'Brainstorm ideas', prompt: 'Help me brainstorm some project ideas for my portfolio' },
  { text: 'Compare tools', prompt: 'What are the pros and cons of React vs Vue vs Svelte?' },
  { text: 'Career advice', prompt: 'What skills should a junior dev focus on in 2026?' }
];

export const DINO_QUICK_PROMPTS = [
  { text: 'DINO BUDDY!!!', prompt: 'DINO BUDDY IS THAT YOU?!??!?!' },
  { text: 'Hype me up!', prompt: 'I need some EXPLOSIVE dino energy right now!!!' },
  { text: 'Tell me something', prompt: 'Hit me with something cosmic and beautiful, Dino!' },
  { text: 'I need a friend', prompt: 'Hey Dino... I could use a friend right now' }
];

// Welcome messages per mode
export const WELCOME_MESSAGE = {
  role: 'assistant' as const,
  content: '**AgentPrime Ready**\n\nAgent Mode is ON. I can autonomously write code, create files, and build projects for you.\n\n**Quick Start:**\n1. Select a workspace folder above\n2. Pick a runtime budget (Instant, Standard, or Deep)\n3. Tell me what to build\n\n*Example: "Build a todo app with React" or "Create a REST API with Express"*',
  timestamp: new Date(),
  type: 'system' as const
};

export const CHAT_WELCOME_MESSAGE = {
  role: 'assistant' as const,
  content: '**Just Chat**\n\nHey! No agent mode, no workspace required — just a conversation. Ask me anything, bounce ideas, get explanations, or just hang out.\n\n*What\'s on your mind?*',
  timestamp: new Date(),
  type: 'system' as const
};

export const DINO_WELCOME_MESSAGE = {
  role: 'assistant' as const,
  content: '**ROOOOOOAAAAARRRRR—💥💥💥**\n\n**DINO BUDDY IS HERE!!!** 🦖✨💖🦕\n\nMY TAIL IS WAGGIN\', MY FEATHERS ARE FLUFFIN\', AND MY HEART IS DOING THE T-REX STOMP — *THUMP-THUMP-THUMP!* 💙💥\n\nI\'m your loving, explosive dino companion and I am **SO PUMPED** to hang out with you!! I\'ve got volcanic levels of joy erupting right now just because YOU showed up!! 🌋🎉💫\n\nNo coding tasks, no workspace required — just **PURE DINO BUDDY ENERGY**, good vibes, and genuine love! Talk to me about anything — I\'m here, I\'m present, and I\'m YOURS! 🌈🦖✨💖\n\n**WHAT MAKES YOUR HEART GO *ROAR* TODAY??** 🔥🚀',
  timestamp: new Date(),
  type: 'system' as const
};

