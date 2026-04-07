import type { Settings } from '../../types';

export type SupportedProviderApiKey =
  | 'ollama'
  | 'ollamaSecondary'
  | 'anthropic'
  | 'openai'
  | 'openrouter';

export type ProviderApiKeySource = 'secure-storage' | 'environment' | 'none';
export type ProviderApiKeyPreference = Exclude<ProviderApiKeySource, 'none'>;

export interface ProviderEnvironmentApiKey {
  value: string | null;
  environmentVariable?: string;
}

export interface ProviderApiKeyStatusSnapshot {
  provider: SupportedProviderApiKey;
  hasStoredKey: boolean;
  hasEnvironmentKey: boolean;
  activeSource: ProviderApiKeySource;
  storageBackend: 'keychain' | 'encrypted-file';
  environmentVariable?: string;
}

export const SUPPORTED_PROVIDER_API_KEYS: SupportedProviderApiKey[] = [
  'ollama',
  'ollamaSecondary',
  'anthropic',
  'openai',
  'openrouter',
];

export function normalizeSecretInput(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveProviderEnvironmentApiKey(
  provider: SupportedProviderApiKey,
  env: NodeJS.ProcessEnv = process.env
): ProviderEnvironmentApiKey {
  if (provider === 'ollamaSecondary') {
    const desktopKey = normalizeSecretInput(env.OLLAMA_API_KEY_DESKTOP);
    if (desktopKey) {
      return {
        value: desktopKey,
        environmentVariable: 'OLLAMA_API_KEY_DESKTOP',
      };
    }

    const sharedKey = normalizeSecretInput(env.OLLAMA_API_KEY);
    if (sharedKey) {
      return {
        value: sharedKey,
        environmentVariable: 'OLLAMA_API_KEY',
      };
    }

    return { value: null };
  }

  const envVarByProvider: Record<Exclude<SupportedProviderApiKey, 'ollamaSecondary'>, string> = {
    ollama: 'OLLAMA_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };

  const environmentVariable = envVarByProvider[provider as Exclude<SupportedProviderApiKey, 'ollamaSecondary'>];
  const value = normalizeSecretInput(env[environmentVariable]);

  return value
    ? { value, environmentVariable }
    : { value: null };
}

export function resolveProviderApiKeySource(
  storedKey?: string | null,
  environmentKey?: string | null,
  preferredSource?: ProviderApiKeyPreference
): ProviderApiKeySource {
  const hasStoredKey = Boolean(normalizeSecretInput(storedKey));
  const hasEnvironmentKey = Boolean(normalizeSecretInput(environmentKey));

  if (preferredSource === 'secure-storage' && hasStoredKey) {
    return 'secure-storage';
  }
  if (preferredSource === 'environment' && hasEnvironmentKey) {
    return 'environment';
  }
  if (hasEnvironmentKey) {
    return 'environment';
  }
  if (hasStoredKey) {
    return 'secure-storage';
  }
  return 'none';
}

export function buildProviderApiKeyStatusSnapshot(args: {
  provider: SupportedProviderApiKey;
  storedKey?: string | null;
  environmentKey?: string | null;
  environmentVariable?: string;
  preferredSource?: ProviderApiKeyPreference;
  storageBackend: 'keychain' | 'encrypted-file';
}): ProviderApiKeyStatusSnapshot {
  const activeSource = resolveProviderApiKeySource(
    args.storedKey,
    args.environmentKey,
    args.preferredSource
  );

  return {
    provider: args.provider,
    hasStoredKey: Boolean(normalizeSecretInput(args.storedKey)),
    hasEnvironmentKey: Boolean(normalizeSecretInput(args.environmentKey)),
    activeSource,
    storageBackend: args.storageBackend,
    environmentVariable: args.environmentVariable,
  };
}

export function sanitizeSettingsForRenderer(source: Settings): Settings {
  const sanitized = JSON.parse(JSON.stringify(source)) as Settings;

  if (sanitized.providers) {
    for (const providerConfig of Object.values(sanitized.providers)) {
      if (providerConfig && typeof providerConfig === 'object' && 'apiKey' in providerConfig) {
        delete providerConfig.apiKey;
      }
    }
  }

  if (sanitized.webSearch) {
    delete sanitized.webSearch.tavilyApiKey;
    delete sanitized.webSearch.braveApiKey;
  }

  return sanitized;
}
