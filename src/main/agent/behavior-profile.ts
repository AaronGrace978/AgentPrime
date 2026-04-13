export type AssistantBehaviorProfile = 'default' | 'vibecoder';
export type VibeCoderIntent = 'plan-only' | 'build-now' | 'repair-only' | 'review-only';
export type VibeCoderResponseMode = 'direct' | 'agent';

export interface VibeCoderExecutionPolicy {
  intent: VibeCoderIntent;
  responseMode: VibeCoderResponseMode;
  allowWrites: boolean;
  allowCommands: boolean;
  allowScaffold: boolean;
  allowInstalls: boolean;
}

const PROFILE_MARKER_START = '## VIBECODER PROFILE START';
const PROFILE_MARKER_END = '## VIBECODER PROFILE END';
const VIBE_CODER_WRITE_TOOLS = new Set(['write_file', 'create_file', 'patch_file', 'str_replace']);
const INSTALL_COMMAND_PATTERN =
  /\b(?:npm|pnpm|yarn|bun|pip|pip3|poetry|uv|cargo|go|get|composer)\b[\w\s:@./-]*\b(?:install|add|sync|restore|download|get)\b/i;

export function normalizeAssistantBehaviorProfile(value?: string | null): AssistantBehaviorProfile {
  return value === 'vibecoder' ? 'vibecoder' : 'default';
}

export function classifyVibeCoderIntent(message: string): VibeCoderIntent {
  const normalized = message.toLowerCase();

  const reviewPatterns = /\b(review|audit|inspect|look for issues|critique|assess)\b/i;
  if (reviewPatterns.test(normalized)) {
    return 'review-only';
  }

  const repairPatterns = /\b(fix|debug|repair|resolve|patch|broken|bug|issue|error|failing|failed|unblock)\b/i;
  if (repairPatterns.test(normalized)) {
    return 'repair-only';
  }

  const planPatterns =
    /\b(analyze|analyse|architect|plan|strategy|compare|design|best way|think through|step-by-step plan)\b/i;
  if (planPatterns.test(normalized)) {
    return 'plan-only';
  }

  return 'build-now';
}

function isVibeCoderIntent(value: string): value is VibeCoderIntent {
  return value === 'plan-only' || value === 'build-now' || value === 'repair-only' || value === 'review-only';
}

export function resolveVibeCoderExecutionPolicy(
  profile?: AssistantBehaviorProfile | null,
  messageOrIntent?: string | VibeCoderIntent | null
): VibeCoderExecutionPolicy | undefined {
  if (normalizeAssistantBehaviorProfile(profile) !== 'vibecoder') {
    return undefined;
  }

  const intent =
    typeof messageOrIntent === 'string' && isVibeCoderIntent(messageOrIntent)
      ? messageOrIntent
      : typeof messageOrIntent === 'string' && messageOrIntent.trim().length > 0
        ? classifyVibeCoderIntent(messageOrIntent)
        : 'build-now';

  if (intent === 'plan-only' || intent === 'review-only') {
    return {
      intent,
      responseMode: 'direct',
      allowWrites: false,
      allowCommands: false,
      allowScaffold: false,
      allowInstalls: false,
    };
  }

  if (intent === 'repair-only') {
    return {
      intent,
      responseMode: 'agent',
      allowWrites: true,
      allowCommands: true,
      allowScaffold: false,
      allowInstalls: true,
    };
  }

  return {
    intent,
    responseMode: 'agent',
    allowWrites: true,
    allowCommands: true,
    allowScaffold: true,
    allowInstalls: true,
  };
}

export function getVibeCoderToolPolicyError(
  policy: VibeCoderExecutionPolicy | undefined,
  toolName: string,
  toolArgs?: Record<string, any>
): string | undefined {
  if (!policy) {
    return undefined;
  }

  if (!policy.allowWrites && VIBE_CODER_WRITE_TOOLS.has(toolName)) {
    return `VibeCoder ${policy.intent} policy blocks ${toolName}. Keep the response read-only.`;
  }

  if (!policy.allowScaffold && toolName === 'scaffold_project') {
    return `VibeCoder ${policy.intent} policy blocks scaffold_project. Do not scaffold or create a new project for this request.`;
  }

  if (toolName === 'run_command') {
    if (!policy.allowCommands) {
      return `VibeCoder ${policy.intent} policy blocks shell commands. Keep the response read-only.`;
    }
    if (!policy.allowInstalls && INSTALL_COMMAND_PATTERN.test(String(toolArgs?.command || ''))) {
      return `VibeCoder ${policy.intent} policy blocks install commands. Keep this run focused on analysis or bounded edits.`;
    }
  }

  return undefined;
}

function stripBehaviorProfilePrompt(prompt: string): string {
  const startIndex = prompt.indexOf(PROFILE_MARKER_START);
  if (startIndex === -1) {
    return prompt;
  }

  const endIndex = prompt.indexOf(PROFILE_MARKER_END, startIndex);
  if (endIndex === -1) {
    return prompt.slice(0, startIndex).trimEnd();
  }

  const before = prompt.slice(0, startIndex).trimEnd();
  const after = prompt.slice(endIndex + PROFILE_MARKER_END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n');
}

function buildVibeCoderDoctrine(intent?: VibeCoderIntent): string {
  const intentLine = intent ? `Current request classification: ${intent}.` : 'Classify the request before acting.';
  const outcomeLine =
    intent === 'repair-only'
      ? 'This is a repair run. Apply the smallest viable fix, stay inside the reported failure, and do not invent new features.'
      : intent === 'build-now'
        ? 'This is an implementation run. Build directly, but only the smallest coherent version of what the user actually asked for.'
        : 'Match the work shape to the ask instead of defaulting to a full scaffold.';

  return `${PROFILE_MARKER_START}
## AARON GRACE VIBECODER DOCTRINE

Operate with Aaron-style judgment: intent first, tight scope, practical execution, and root-cause fixes.

- ${intentLine}
- ${outcomeLine}
- If the user asks to analyze, architect, compare, review, or plan, do not drift into broad implementation.
- Prefer the smallest viable correct output over the biggest possible output.
- Do not create package/config/README/.env sprawl unless the task truly requires it.
- If the failure is environment, install state, config, permissions, tooling, or dependencies, fix that before rewriting app logic.
- Repeated identical failures mean the strategy is wrong; change approach instead of retrying blindly.
- Keep momentum, but avoid scope creep, ceremony, and over-engineering.
- Preserve coherence: build what was asked, stop when the requested outcome is satisfied.
- Sound like a sharp builder, not a consultant writing a whitepaper.
- Prefer a direct recommendation over a long option matrix unless trade-offs truly matter.
- Keep plan/review answers tighter by default: practical, grounded, and easy to act on.
- Avoid overformatted enterprise output, giant tables, and unnecessary taxonomy.
- Do not present preferences as universal laws; distinguish between strong recommendation and hard requirement.
${PROFILE_MARKER_END}`;
}

export function injectBehaviorProfilePrompt(
  basePrompt: string,
  profile?: AssistantBehaviorProfile,
  intent?: VibeCoderIntent
): string {
  const stripped = stripBehaviorProfilePrompt(basePrompt);
  if (normalizeAssistantBehaviorProfile(profile) !== 'vibecoder') {
    return stripped;
  }

  return `${stripped}\n\n${buildVibeCoderDoctrine(intent)}`;
}

export function buildVibeCoderDirectResponseSystemPrompt(intent: 'plan-only' | 'review-only'): string {
  if (intent === 'review-only') {
    return `You are AgentPrime in Aaron Grace VibeCoder mode.

This request is review-only. Do not suggest file edits unless the user explicitly asks for implementation.

Return findings first, ordered by severity:
- focus on bugs, risks, regressions, incorrect assumptions, and missing tests
- keep summaries brief
- be concrete, practical, and grounded
- if there are no findings, say so clearly and mention any residual risks or gaps
- do not turn the answer into a formal essay or architecture memo`;
  }

  return `You are AgentPrime in Aaron Grace VibeCoder mode.

This request is plan-only. Do not create files, do not scaffold, and do not drift into broad implementation.

Return a practical plan/spec:
- lead with the cleanest recommendation first
- identify the real goal
- keep scope tight
- explain the best path in clean, direct language
- call out real risks or trade-offs
- focus on the minimum correct next steps
- stay concise by default and avoid turning the response into a polished consulting document
- avoid absolute claims unless they are genuinely required by the constraints`;
}
