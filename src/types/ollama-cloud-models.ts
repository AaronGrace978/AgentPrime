export interface OllamaCloudModelOption {
  value: string;
  label: string;
}

/**
 * Pinned Ollama Cloud catalog used when live provider lookup is unavailable.
 * Keep this in public Ollama catalog order so the renderer and runtime agree.
 */
export const OLLAMA_CLOUD_MODEL_OPTIONS: OllamaCloudModelOption[] = [
  { value: 'kimi-k2.6:cloud', label: 'Kimi K2.6 - Multimodal Agentic' },
  { value: 'deepseek-v4-flash:cloud', label: 'DeepSeek V4 Flash - 1M Context' },
  { value: 'deepseek-v4-pro:cloud', label: 'DeepSeek V4 Pro - Frontier 1M Context' },
  { value: 'gemma4:31b-cloud', label: 'Gemma 4 31B - Cloud' },
  { value: 'qwen3.5:cloud', label: 'Qwen 3.5 - Multimodal Latest' },
  { value: 'glm-5.1:cloud', label: 'GLM 5.1 - Agentic Coding' },
  { value: 'minimax-m2.7:cloud', label: 'MiniMax M2.7 - New Frontier' },
  { value: 'qwen3-coder-next:cloud', label: 'Qwen 3 Coder Next - Agentic' },
  { value: 'nemotron-3-super:cloud', label: 'Nemotron 3 Super - Thinking' },
  { value: 'glm-5:cloud', label: 'GLM-5 - Strong Reasoning' },
  { value: 'minimax-m2.5:cloud', label: 'MiniMax M2.5 - Coding' },
  { value: 'ministral-3:cloud', label: 'Ministral 3 - Edge Friendly' },
  { value: 'devstral-small-2:24b-cloud', label: 'Devstral Small 2 24B - Fast Coding' },
  { value: 'gemini-3-flash-preview:cloud', label: 'Gemini 3 Flash - Fast' },
  { value: 'glm-4.7:cloud', label: 'GLM-4.7 - Coding' },
  { value: 'minimax-m2.1:cloud', label: 'MiniMax M2.1 - Multilingual' },
  { value: 'deepseek-v3.2:cloud', label: 'DeepSeek v3.2 - Reasoning Agent' },
  { value: 'qwen3-next:cloud', label: 'Qwen 3 Next - Efficient Reasoning' },
  { value: 'nemotron-3-nano:30b-cloud', label: 'Nemotron 3 Nano 30B - Lightweight Agentic' },
  { value: 'rnj-1:cloud', label: 'RNJ-1 - Code and STEM' },
];

export const PINNED_OLLAMA_CLOUD_MODEL_OPTIONS: OllamaCloudModelOption[] = [
  { value: 'qwen3-coder:480b-cloud', label: 'Qwen 3 Coder 480B - Frontier' },
  { value: 'qwen3-vl:cloud', label: 'Qwen 3 VL - Vision + Tools' },
  { value: 'deepseek-v3.1:671b-cloud', label: 'DeepSeek v3.1 671B - Large Context' },
  { value: 'devstral-2:123b-cloud', label: 'Devstral 2 123B - Coding' },
  { value: 'mistral-large-3:675b-cloud', label: 'Mistral Large 3 675B' },
];

export const ALL_OLLAMA_CLOUD_MODEL_OPTIONS: OllamaCloudModelOption[] = [
  ...OLLAMA_CLOUD_MODEL_OPTIONS,
  ...PINNED_OLLAMA_CLOUD_MODEL_OPTIONS,
];

export const ALL_OLLAMA_CLOUD_MODEL_IDS = ALL_OLLAMA_CLOUD_MODEL_OPTIONS.map((model) => model.value);
