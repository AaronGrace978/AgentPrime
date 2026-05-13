/**
 * Task Mode Detection - Classifies user intent to prevent destructive operations
 *
 * Extracted from agent-loop.ts for modularity and testability.
 *
 * Design note (2026-04): the previous classifier silently defaulted to CREATE
 * on any ambiguous input, which caused "organize please" to scaffold a whole
 * Vite app in a folder of screen recordings. The classifier now:
 *   1. Detects file-management intents (organize/sort/clean up/rename/move/delete)
 *      and returns TaskMode.ORGANIZE.
 *   2. Requires CREATE to be explicitly matched — ambiguous input now falls
 *      back to REVIEW (non-destructive), not CREATE.
 */

export enum TaskMode {
  CREATE = 'create',
  FIX = 'fix',
  REVIEW = 'review',
  ENHANCE = 'enhance',
  ORGANIZE = 'organize'
}

export interface TaskModeResult {
  mode: TaskMode;
  confidence: number;
  reason: string;
}

export interface ExistingFileInfo {
  path: string;
  content: string;
  size: number;
  hash: string;
}

export function detectTaskMode(userMessage: string): TaskModeResult {
  const message = userMessage.toLowerCase();

  const organizePatterns = /\b(organize|organise|tidy|sort|categorize|categorise|clean\s?up|declutter|rename\s+files?|move\s+files?|group\s+files?)\b/i;
  const putInFolderPatterns = /(put|place|move)\s+.+\s+(in|into)\s+(a\s+)?(folder|directory)\b/i;
  const deletePathPatterns =
    /\b(delete|remove|trash|wipe|rmdir)\b.+\b(file|files|folder|directory|workspace|project|repo|repository)\b/i;
  const deletePronounPatterns =
    /\b(delete|remove|trash|wipe)\s+(it|this|that|the\s+folder|the\s+workspace|the\s+project|old\s+prime|prime\s+folder)\b/i;
  const isOrganizing =
    organizePatterns.test(message) ||
    putInFolderPatterns.test(message) ||
    deletePathPatterns.test(message) ||
    deletePronounPatterns.test(message);

  const createPatterns = /\b(create|build|make|generate|new|start|scaffold|bootstrap|initialize|init)\b.*\b(project|app|application|website|site|page|game|api|server|tool|dashboard|simulator|prototype)\b/i;
  const genericBuildRequest =
    /\b(?:build|create|generate)\s+(?:me\s+)?(?:(?:a|an|the|new)\s+)?[a-z0-9][\w-]*(?:\s+[a-z0-9][\w-]*){0,5}\b/i.test(message) ||
    /\bmake\s+(?:me\s+)?(?:a|an|the|new)\s+[a-z0-9][\w-]*(?:\s+[a-z0-9][\w-]*){0,5}\b/i.test(message);
  const buildErrorContext =
    /\b(build|compile|typecheck|test)\s+(?:error|errors|failure|failed|failing|broken)\b/i.test(message) ||
    /\bmake\s+it\s+work\b/i.test(message);
  const explicitCreate = createPatterns.test(message) || (genericBuildRequest && !buildErrorContext);

  const fixPatterns = /\b(fix|debug|repair|solve|resolve|patch|correct|bug|error|broken|issue|problem|crash|failing|failed)\b|\bmake\s+it\s+work\b/i;
  const isFixing = fixPatterns.test(message);

  const reviewPatterns = /\b(check|review|examine|inspect|audit|analyze|analyse|assess|evaluate|verify|validate)\b|\blook\s+(?:at|over|into|for)\b|\btake\s+a\s+look\b/i;
  const isReviewing = reviewPatterns.test(message);

  const enhancePatterns = /\b(add|improve|enhance|upgrade|extend|expand|update|modify|change|implement|feature|beautify|polish|style|restyle|redesign|modernize|modernise|prettier|sleek|visual|visuals|ui|ux)\b|\bmake\s+(?:it|this|that|the\s+(?:app|site|website|page|project))\s+look\b|\blook\s+(?:beautiful|better|good|great|professional|modern|clean|sleek|polished)\b/i;
  const isEnhancing = enhancePatterns.test(message);

  // Organize wins before CREATE — "organize my folder" is never a scaffold request.
  if (isOrganizing && !explicitCreate) {
    return { mode: TaskMode.ORGANIZE, confidence: 0.95, reason: 'File organization / folder cleanup request' };
  }

  if (explicitCreate && !isFixing) {
    return { mode: TaskMode.CREATE, confidence: 0.95, reason: 'Explicit project creation request' };
  }

  if (isFixing) {
    if (explicitCreate) {
      return { mode: TaskMode.CREATE, confidence: 0.7, reason: 'Create with fix context - defaulting to create' };
    }
    return { mode: TaskMode.FIX, confidence: 0.9, reason: 'Bug fix or error resolution request' };
  }

  if (isReviewing && !isEnhancing && !explicitCreate) {
    return { mode: TaskMode.REVIEW, confidence: 0.85, reason: 'Code review or inspection request' };
  }

  if (isEnhancing && !explicitCreate) {
    return { mode: TaskMode.ENHANCE, confidence: 0.8, reason: 'Feature addition or improvement request' };
  }

  // Ambiguous: be conservative, never silently escalate to CREATE. REVIEW is
  // non-destructive and prompts the planner to look at the workspace first.
  return { mode: TaskMode.REVIEW, confidence: 0.4, reason: 'Ambiguous request - defaulting to non-destructive review mode' };
}

export function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
