/**
 * Task Mode Detection - Classifies user intent to prevent destructive operations
 *
 * Extracted from agent-loop.ts for modularity and testability.
 *
 * Design note (2026-04): the previous classifier silently defaulted to CREATE
 * on any ambiguous input, which caused "organize please" to scaffold a whole
 * Vite app in a folder of screen recordings. The classifier now:
 *   1. Detects file-management intents (organize/sort/clean up/rename/move)
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
  const isOrganizing = organizePatterns.test(message);

  const createPatterns = /\b(create|build|make|generate|new|start|scaffold|bootstrap|initialize|init)\b.*\b(project|app|application|website|game|api|server)\b/i;
  const explicitCreate = createPatterns.test(message);

  const fixPatterns = /\b(fix|debug|repair|solve|resolve|patch|correct|bug|error|broken|issue|problem|crash|failing|failed)\b/i;
  const isFixing = fixPatterns.test(message);

  const reviewPatterns = /\b(check|review|look|examine|inspect|audit|analyze|analyse|assess|evaluate|verify|validate)\b/i;
  const isReviewing = reviewPatterns.test(message);

  const enhancePatterns = /\b(add|improve|enhance|upgrade|extend|expand|update|modify|change|implement|feature)\b/i;
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
