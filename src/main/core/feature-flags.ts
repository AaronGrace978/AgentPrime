/**
 * Feature Flags — Centralized gate for optional subsystems
 * 
 * Controls which heavy/experimental modules are loaded at startup.
 * Flags can be set via environment variables (AGENTPRIME_ENABLE_*) or
 * app settings overrides resolved at startup.
 *
 * Default: lean core only. Opt-in to heavier subsystems as needed.
 */

export interface FeatureFlags {
  /** Mirror Intelligence pattern learning system */
  mirror: boolean;
  /** ActivatePrime Cursor-like AI assistance */
  activatePrime: boolean;
  /** Python FastAPI backend ("The Brain") */
  pythonBrain: boolean;
  /** Inference server for shared AI */
  inferenceServer: boolean;
  /** Smart-mode adaptive routing */
  smartMode: boolean;
  /** Consciousness intent-understanding layer */
  consciousness: boolean;
  /** Telemetry collection */
  telemetry: boolean;
  /** Background codebase indexing */
  codebaseIndexing: boolean;
}

const DEFAULTS: FeatureFlags = {
  mirror: true,
  activatePrime: true,
  pythonBrain: false,
  telemetry: true,
  codebaseIndexing: true,
  inferenceServer: false,
  smartMode: false,
  consciousness: false,
};

let resolvedFlags: FeatureFlags | null = null;

function envBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const val = env[key];
  if (val === undefined) return fallback;
  return val === 'true' || val === '1';
}

export function buildFeatureFlags(
  settingsOverrides?: Partial<FeatureFlags>,
  env: NodeJS.ProcessEnv = process.env
): FeatureFlags {
  return {
    mirror: envBool(env, 'AGENTPRIME_ENABLE_MIRROR', DEFAULTS.mirror),
    activatePrime: envBool(env, 'AGENTPRIME_ENABLE_ACTIVATEPRIME', DEFAULTS.activatePrime),
    pythonBrain: envBool(env, 'AGENTPRIME_ENABLE_BRAIN', DEFAULTS.pythonBrain),
    inferenceServer: envBool(env, 'AGENTPRIME_ENABLE_INFERENCE', DEFAULTS.inferenceServer),
    smartMode: envBool(env, 'AGENTPRIME_ENABLE_SMART_MODE', DEFAULTS.smartMode),
    consciousness: envBool(env, 'AGENTPRIME_ENABLE_CONSCIOUSNESS', DEFAULTS.consciousness),
    telemetry: envBool(env, 'AGENTPRIME_ENABLE_TELEMETRY', DEFAULTS.telemetry),
    codebaseIndexing: envBool(env, 'AGENTPRIME_ENABLE_INDEXING', DEFAULTS.codebaseIndexing),
    ...settingsOverrides,
  };
}

/**
 * Resolve feature flags from environment + optional settings override.
 * Call once at startup; cached after first call.
 */
export function resolveFeatureFlags(settingsOverrides?: Partial<FeatureFlags>): FeatureFlags {
  if (resolvedFlags) return resolvedFlags;

  resolvedFlags = buildFeatureFlags(settingsOverrides);

  const enabled = Object.entries(resolvedFlags)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const disabled = Object.entries(resolvedFlags)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  console.log(`[FeatureFlags] Enabled: ${enabled.join(', ') || '(none)'}`);
  console.log(`[FeatureFlags] Disabled: ${disabled.join(', ') || '(none)'}`);

  return resolvedFlags;
}

/**
 * Get resolved flags (must call resolveFeatureFlags first).
 */
export function getFeatureFlags(): FeatureFlags {
  if (!resolvedFlags) return resolveFeatureFlags();
  return resolvedFlags;
}

/**
 * Reset flags (for testing).
 */
export function resetFeatureFlags(): void {
  resolvedFlags = null;
}
