/**
 * Shared heuristics for "plain HTML/CSS/JS static site" vs framework or app work.
 * Used by reflection budgets, routing, scaffold detection, and deterministic fast paths.
 */

const SIMPLE_STATIC_SITE_PATTERN =
  /\b(static\s+)?(site|website|webpage|web\s+page|landing\s+page|portfolio\s+site|homepage|marketing\s+page)\b/i;

const SIMPLE_STATIC_SITE_EXTRA_PATTERN =
  /\b(simple|basic)\s+website\b|\bsingle\s+page\s+(site|website)\b|\bpersonal\s+(site|website)\b|\bstatic\s+website\b/i;

/** Frameworks, backends, and heavy clients that should NOT use the simple static-site fast path. */
const COMPLEX_APP_PATTERN =
  /\b(react|vue|svelte|next(\.js)?|nuxt|angular|vite|webpack|fullstack|full-stack|backend|api|database|db\b|auth|login|dashboard|three\.js|threejs|game|webgl|tauri|electron|phaser|pixi)\b/i;

export function stripNegatedIntentClauses(userMessage: string): string {
  return userMessage
    .replace(
      /(?:^|[\n.;!?])\s*(?:[-*]\s*)?(?:do\s+not|don't|dont|never|no)\b[^\n]*/gi,
      ' '
    )
    .replace(
      /\b(?:not|no)\s+(?:a\s+|an\s+)?(?:game|gameplay|canvas|three\.?js|phaser|pixi|webgl|starter|template|scaffold|boilerplate|skeleton)\b/gi,
      ' '
    );
}

export function looksSimpleStaticWebsiteTask(userMessage: string): boolean {
  const intentText = stripNegatedIntentClauses(userMessage);
  if (!intentText || !intentText.trim()) return false;
  const matchesSimple =
    SIMPLE_STATIC_SITE_PATTERN.test(intentText) || SIMPLE_STATIC_SITE_EXTRA_PATTERN.test(intentText);
  if (!matchesSimple) return false;
  return !COMPLEX_APP_PATTERN.test(intentText);
}
