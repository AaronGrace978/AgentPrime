export const DEFAULT_MODEL_IDS = {
  ollamaAgent: 'qwen3-coder:480b-cloud',
  ollamaChat: 'kimi-k2.6:cloud',
  ollamaSpecialist: 'minimax-m2.7:cloud',
  ollamaAnalysis: 'deepseek-v3.1:671b-cloud',
  ollamaLongContext: 'deepseek-v4-flash:cloud',
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.4',
  openaiFast: 'gpt-5.4-mini',
  openrouter: 'anthropic/claude-sonnet-4-6',
} as const;

export const DEFAULT_PROVIDER_SELECTIONS = {
  agent: { provider: 'ollama', model: DEFAULT_MODEL_IDS.ollamaAgent },
  chat: { provider: 'openai', model: DEFAULT_MODEL_IDS.openai },
  dino: { provider: 'anthropic', model: DEFAULT_MODEL_IDS.anthropic },
} as const;
