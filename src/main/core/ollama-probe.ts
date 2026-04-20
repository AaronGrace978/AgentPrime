/**
 * Shared Ollama / Ollama-Cloud reachability probe for chat and agent preflight.
 */

import axios from 'axios';
import aiRouter from '../ai-providers';

const RECOMMENDED_MODELS = [
  { name: 'qwen2.5:14b', description: 'Best balance of speed and quality for coding', required: true },
  { name: 'qwen2.5:7b', description: 'Fast model for quick tasks', required: false },
  { name: 'deepseek-coder:6.7b', description: 'Specialized for code generation', required: false },
  { name: 'llama3.2:8b', description: 'Good general-purpose model', required: false },
];

export async function checkOllamaHealth(): Promise<{
  running: boolean;
  models: string[];
  recommended: { name: string; installed: boolean; description: string }[];
  error?: string;
}> {
  try {
    const ollamaProvider = aiRouter.getProvider('ollama') as any;
    const baseUrl = ollamaProvider?.baseUrl || 'http://127.0.0.1:11434';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (ollamaProvider?.apiKey) {
      headers['Authorization'] = `Bearer ${ollamaProvider.apiKey}`;
    }

    const response = await axios.get(`${baseUrl}/api/tags`, {
      headers,
      timeout: 5000,
    });
    const installedModels = response.data?.models?.map((m: any) => m.name) || [];

    const recommended = RECOMMENDED_MODELS.map((rec) => ({
      name: rec.name,
      description: rec.description,
      installed: installedModels.some(
        (m: string) => m === rec.name || m.startsWith(rec.name.split(':')[0] + ':')
      ),
    }));

    return {
      running: true,
      models: installedModels,
      recommended,
    };
  } catch (e: any) {
    return {
      running: false,
      models: [],
      recommended: RECOMMENDED_MODELS.map((rec) => ({
        name: rec.name,
        description: rec.description,
        installed: false,
      })),
      error:
        e.code === 'ECONNREFUSED'
          ? 'Ollama is not running. Start it with: ollama serve'
          : e.message,
    };
  }
}
