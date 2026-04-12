import type { AIRuntimeSnapshot, ProviderConnectionStatus } from '../../types/ai-providers';
import type { SystemStatusSummary } from '../../types/system-health';

export function buildAIHealthSummary(
  runtime: AIRuntimeSnapshot,
  providerStatus: ProviderConnectionStatus
): SystemStatusSummary['ai'] {
  const connected = providerStatus?.success === true;
  const availableModels =
    typeof providerStatus?.models === 'number' && Number.isFinite(providerStatus.models)
      ? providerStatus.models
      : undefined;

  return {
    provider: runtime.displayProvider,
    model: runtime.displayModel,
    connected,
    reason: runtime.reason,
    connectionError: connected ? undefined : providerStatus?.error || 'Unable to reach the active provider.',
    availableModels,
  };
}
