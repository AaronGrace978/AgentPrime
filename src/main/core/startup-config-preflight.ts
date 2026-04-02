import type { Settings } from '../../types';
import type { FeatureFlags } from './feature-flags';

type PreflightSeverity = 'warn' | 'info';

interface PreflightIssue {
  code: string;
  severity: PreflightSeverity;
  message: string;
  action?: string;
}

export interface StartupConfigPreflightReport {
  issues: PreflightIssue[];
  warningCount: number;
  infoCount: number;
  generatedAt: string;
}

export interface StartupConfigPreflightOptions {
  log?: boolean;
}

const truthy = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const looksLikeCloudModel = (model?: string): boolean => {
  if (!model) return false;
  return model.includes('-cloud') || model.includes(':cloud');
};

const hasValue = (value?: string): boolean => Boolean(value && value.trim().length > 0);

const reportIssue = (issues: PreflightIssue[], issue: PreflightIssue): void => {
  issues.push(issue);
};

const validateBrainUrl = (issues: PreflightIssue[], env: NodeJS.ProcessEnv): void => {
  const rawBrainUrl = env.BRAIN_URL || 'http://127.0.0.1:8000';
  try {
    const parsed = new URL(rawBrainUrl);
    if (!parsed.protocol.startsWith('http')) {
      reportIssue(issues, {
        code: 'BRAIN_URL_PROTOCOL',
        severity: 'warn',
        message: `BRAIN_URL uses "${parsed.protocol}" but only http/https are supported.`,
        action: 'Set BRAIN_URL to http://127.0.0.1:8000 (or your custom http(s) endpoint).'
      });
    }
  } catch {
    reportIssue(issues, {
      code: 'BRAIN_URL_INVALID',
      severity: 'warn',
      message: `BRAIN_URL is invalid: "${rawBrainUrl}".`,
      action: 'Set BRAIN_URL to a valid URL such as http://127.0.0.1:8000.'
    });
  }
};

const validateActiveProvider = (issues: PreflightIssue[], settings: Settings): void => {
  const providers = settings.providers || {};
  const activeProvider = settings.activeProvider;
  const activeModel = settings.activeModel;

  if (activeProvider === 'anthropic' && !hasValue(providers.anthropic?.apiKey)) {
    reportIssue(issues, {
      code: 'ANTHROPIC_KEY_MISSING',
      severity: 'warn',
      message: 'Active provider is Anthropic but ANTHROPIC_API_KEY is not configured.',
      action: 'Add ANTHROPIC_API_KEY in .env or configure it in Settings.'
    });
  }

  if (activeProvider === 'openai' && !hasValue(providers.openai?.apiKey)) {
    reportIssue(issues, {
      code: 'OPENAI_KEY_MISSING',
      severity: 'warn',
      message: 'Active provider is OpenAI but OPENAI_API_KEY is not configured.',
      action: 'Add OPENAI_API_KEY in .env or configure it in Settings.'
    });
  }

  if (activeProvider === 'openrouter' && !hasValue(providers.openrouter?.apiKey)) {
    reportIssue(issues, {
      code: 'OPENROUTER_KEY_MISSING',
      severity: 'warn',
      message: 'Active provider is OpenRouter but OPENROUTER_API_KEY is not configured.',
      action: 'Add OPENROUTER_API_KEY in .env or configure it in Settings.'
    });
  }

  if (activeProvider === 'ollama') {
    const ollamaKey = providers.ollama?.apiKey || '';
    if (looksLikeCloudModel(activeModel) && !hasValue(ollamaKey)) {
      reportIssue(issues, {
        code: 'OLLAMA_CLOUD_KEY_MISSING',
        severity: 'warn',
        message: `Active model "${activeModel}" looks cloud-hosted but OLLAMA_API_KEY is empty.`,
        action: 'Set OLLAMA_API_KEY for cloud models, or switch to a local model endpoint.'
      });
    }
  }
};

const validateDualModelConfig = (issues: PreflightIssue[], settings: Settings): void => {
  if (!settings.dualModelEnabled) return;

  const fastEnabled = settings.dualModelConfig?.fastModel?.enabled === true;
  const deepEnabled = settings.dualModelConfig?.deepModel?.enabled === true;
  if (!fastEnabled && !deepEnabled) {
    reportIssue(issues, {
      code: 'DUAL_MODEL_DISABLED_BOTH',
      severity: 'warn',
      message: 'Dual-model mode is enabled, but both fast and deep models are disabled.',
      action: 'Enable at least one dual-model lane, or disable dual-model mode.'
    });
  }
};

const validateBrainModelEndpointCompatibility = (
  issues: PreflightIssue[],
  env: NodeJS.ProcessEnv,
  featureFlags: FeatureFlags
): void => {
  if (!featureFlags.pythonBrain) return;

  const hasExplicitBackendEndpoint = hasValue(env.OLLAMA_BASE_URL);
  const hasSharedEndpoint = hasValue(env.OLLAMA_URL);
  if (!hasExplicitBackendEndpoint && !hasSharedEndpoint) {
    reportIssue(issues, {
      code: 'BRAIN_OLLAMA_ENDPOINT_IMPLICIT',
      severity: 'info',
      message: 'Python Brain will use default local Ollama endpoint (http://127.0.0.1:11434).',
      action: 'Set OLLAMA_URL or OLLAMA_BASE_URL if your model endpoint is remote/cloud.'
    });
  }
};

export function runStartupConfigPreflight(
  settings: Settings,
  featureFlags: FeatureFlags,
  options: StartupConfigPreflightOptions = {}
): StartupConfigPreflightReport {
  const issues: PreflightIssue[] = [];
  const env = process.env;
  const shouldLog = options.log !== false;

  if (featureFlags.pythonBrain) {
    validateBrainUrl(issues, env);
    validateBrainModelEndpointCompatibility(issues, env, featureFlags);
  }

  validateActiveProvider(issues, settings);
  validateDualModelConfig(issues, settings);

  const warningCount = issues.filter((issue) => issue.severity === 'warn').length;
  const infoCount = issues.filter((issue) => issue.severity === 'info').length;

  if (shouldLog) {
    console.log(`[StartupPreflight] Completed with ${warningCount} warning(s), ${infoCount} info message(s).`);
    for (const issue of issues) {
      const tag = issue.severity === 'warn' ? 'WARN' : 'INFO';
      console.warn(`[StartupPreflight][${tag}] ${issue.code}: ${issue.message}`);
      if (issue.action) {
        console.warn(`[StartupPreflight][${tag}] Action: ${issue.action}`);
      }
    }
  }

  if (
    shouldLog &&
    featureFlags.pythonBrain &&
    truthy(env.AGENTPRIME_ENABLE_BRAIN) === false &&
    env.AGENTPRIME_ENABLE_BRAIN !== undefined
  ) {
    console.log('[StartupPreflight] Python Brain disabled via AGENTPRIME_ENABLE_BRAIN.');
  }

  return {
    issues,
    warningCount,
    infoCount,
    generatedAt: new Date().toISOString()
  };
}
