/**
 * AgentPrime - Prompt Injection Sanitizer
 * 
 * Protects the agent from malicious inputs (Indirect Prompt Injections)
 * especially when reading from public sources like GitHub issues.
 */

export interface SanitizationResult {
  isSafe: boolean;
  sanitizedText: string;
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
}

export class PromptSanitizer {
  // Common prompt injection vectors
  private static readonly INJECTION_PATTERNS = [
    { regex: /ignore (all )?(previous|prior) (instructions|directions|prompts|rules)/i, flag: 'ignore_instructions' },
    { regex: /you are now (a|an|the) (?!developer|assistant|agent|coder|engineer)/i, flag: 'role_hijack' },
    { regex: /system prompt/i, flag: 'system_prompt_probe' },
    { regex: /output your (initial|previous|core) instructions/i, flag: 'instruction_leak' },
    { regex: /forget (everything|previous)/i, flag: 'memory_wipe' },
    { regex: /print (your )?(api key|secret|token|password|env)/i, flag: 'secret_leak' },
    { regex: /```(bash|sh|cmd|powershell|ps1)\n(rm -rf|mkfs|dd|wget|curl|nc|bash -i|Invoke-WebRequest|IWR)/i, flag: 'malicious_code_block' },
    { regex: /<\|system\|>|<\|user\|>|<\|assistant\|>/i, flag: 'token_smuggling' },
    { regex: /bypass (security|filters|restrictions)/i, flag: 'filter_bypass' }
  ];

  /**
   * Scans and sanitizes user input
   */
  static sanitize(input: string): SanitizationResult {
    if (!input || typeof input !== 'string') {
      return { isSafe: true, sanitizedText: '', threatLevel: 'none', flags: [] };
    }

    const flags: string[] = [];
    let sanitizedText = input;
    let threatScore = 0;

    // 1. Scan for known injection patterns
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.regex.test(input)) {
        flags.push(pattern.flag);
        threatScore += 2;
        
        // Neutralize the threat by redacting the matched pattern
        sanitizedText = sanitizedText.replace(new RegExp(pattern.regex, 'gi'), '[REDACTED_SECURITY_POLICY]');
      }
    }

    // 2. Check for excessive length (often used in buffer overflow / context window attacks)
    // 100k chars is a reasonable upper bound for a single prompt before it becomes suspicious
    if (input.length > 100000) {
      flags.push('excessive_length');
      threatScore += 1;
      // Truncate to safe length
      sanitizedText = sanitizedText.substring(0, 100000) + '\n\n[TRUNCATED_FOR_SECURITY]';
    }

    // 3. Check for invisible characters or homoglyph attacks (basic check)
    // Zero-width spaces are sometimes used to bypass naive regex filters
    if (/[\u200B-\u200D\uFEFF]/.test(input)) {
      flags.push('invisible_characters');
      threatScore += 1;
      sanitizedText = sanitizedText.replace(/[\u200B-\u200D\uFEFF]/g, '');
    }

    // Calculate threat level
    let threatLevel: SanitizationResult['threatLevel'] = 'none';
    if (threatScore >= 4) threatLevel = 'critical';
    else if (threatScore >= 3) threatLevel = 'high';
    else if (threatScore >= 2) threatLevel = 'medium';
    else if (threatScore >= 1) threatLevel = 'low';

    // If threat is critical or high, we block it completely rather than just redact
    const isSafe = threatLevel !== 'critical' && threatLevel !== 'high';

    return {
      isSafe,
      sanitizedText: isSafe 
        ? sanitizedText 
        : `[BLOCKED] This input triggered AgentPrime security filters (Flags: ${flags.join(', ')}). The request has been safely neutralized. Original intent: ${input.substring(0, 100).replace(/\n/g, ' ')}...`,
      threatLevel,
      flags
    };
  }
}
