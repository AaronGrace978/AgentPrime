/**
 * Heuristic 1–10 "capability" score from the active model id (name).
 * Used so the chat status power meter updates when the user changes models.
 */

export function estimateModelCapability(model: string): number {
  const m = model.toLowerCase();
  let score = 5;

  const bMatches = [...m.matchAll(/(\d+(?:\.\d+)?)\s*b/gi)];
  if (bMatches.length > 0) {
    const billions = Math.max(...bMatches.map((x) => parseFloat(x[1])));
    if (billions >= 400) score = 10;
    else if (billions >= 200) score = 9;
    else if (billions >= 120) score = 8;
    else if (billions >= 70) score = 7;
    else if (billions >= 32) score = 6;
    else if (billions >= 14) score = 5;
    else if (billions >= 8) score = 4;
    else score = 3;
  }

  if (/opus|671b|675b|480b|405b|gpt-5\.4(?!-nano)|\bo3\b|\bo1\b|claude-opus|frontier|large-3|mistral-large-3/.test(m)) {
    score = Math.max(score, 9);
  }
  if (/sonnet|gpt-4o|gpt-5(?!\.4-nano)|deepseek-v3|gemini-3-pro|devstral-2(?!-small)|123b|glm-5(?!\.)/.test(m)) {
    score = Math.max(score, 7);
  }
  if (/haiku|nano|:-small|:7b|:8b|:3b|1\.5b|flash(?!-)|mini(?!max|stral)/.test(m)) {
    score = Math.min(score, 5);
  }

  return Math.max(1, Math.min(10, score));
}
