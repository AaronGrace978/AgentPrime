import type { AIRuntimeSnapshot } from '../../types/ai-providers';

export function flattenRuntimeForTelemetry(runtime: AIRuntimeSnapshot): Record<string, unknown> {
  return {
    requestedProvider: runtime.requestedProvider,
    requestedModel: runtime.requestedModel,
    effectiveProvider: runtime.effectiveProvider,
    effectiveModel: runtime.effectiveModel,
    executionProvider: runtime.executionProvider || runtime.displayProvider,
    executionModel: runtime.executionModel || runtime.displayModel,
    runtimeResolution: runtime.resolution,
    runtimeViaFallback: runtime.viaFallback,
  };
}
