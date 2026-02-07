# Agent Loop Fix - December 2025

## UPDATE: Second Critical Fix - Validation Strictness

### The ACTUAL Problem 🎯

After implementing the truncation detection, we discovered the **root cause** of why Claude couldn't "lock in":

**The validation system was TOO PEDANTIC about semicolons!**

#### What Was Happening:
1. Claude Opus generates perfect Phaser.js game code (500+ lines)
2. Validator runs `validateJavaScriptSyntax()`
3. Finds "3 issues": **"Missing semicolons"** on lines that use modern JS style
4. Reports "syntax_validation (3 issues)" 
5. Triggers auto-fix which does nothing (because code is already valid!)
6. Adds validation feedback to conversation
7. Claude rewrites the ENTIRE FILE trying to "fix" non-existent problems
8. Repeats 3 times → triggers file write loop detection → escalates to Qwen
9. Qwen generates massive JSON → truncates → parse errors → infinite loop

#### The Semicolon Validator:
```javascript
// OLD (BROKEN):
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.match(/^(let|const|var|return|throw|console\.log)\s+.*[^;{}\s]$/)) {
    issues.push(`Missing semicolon on line ${i + 1}`); // ❌ FALSE POSITIVE!
  }
}
```

This was flagging **modern JavaScript** that intentionally omits semicolons (which is valid!).

Modern JS:
```javascript
const config = {
  type: Phaser.AUTO,  // ← No semicolon needed!
  width: 800,
  height: 900
}

let ball  // ← No semicolon needed!
```

The validator thought these were "syntax errors" when they're perfectly valid ES6+ code.

### Fix #4: Relaxed Validation ✅
**Location**: `src/main/agent-loop.ts` (lines 3959-3969)

**Disabled the pedantic semicolon checker:**
```javascript
// Check for missing semicolons in statements (DISABLED - too pedantic for modern JS)
// Modern JavaScript doesn't require semicolons, and game code often omits them
// Only check for actual syntax errors, not style preferences
```

### Fix #5: Critical-Only Confidence Penalties ✅
**Location**: `src/main/agent-loop.ts` (lines 3257-3270)

**Only penalize confidence for ACTUAL syntax errors:**
```javascript
// Only penalize confidence for CRITICAL syntax errors (unbalanced braces/parens)
// Don't penalize for style issues (semicolons, etc.)
const criticalIssues = jsIssues.filter(issue => 
  issue.includes('Unbalanced') ||    // Real error
  issue.includes('Malformed') ||     // Real error  
  issue.includes('Empty') ||         // Real error
  issue.includes('Incomplete if') || // Real error
  issue.includes('Incomplete arrow') // Real error
);
confidence -= criticalIssues.length * 0.15; // Only critical errors affect confidence
```

**Impact**: 
- ✅ No more false positives on semicolon style
- ✅ Models can generate code once and move on
- ✅ Validation only triggers on REAL syntax errors
- ✅ No more rewrite loops for style "issues"

---

# Agent Loop Fix - December 2025

## Issue Summary

AgentPrime was experiencing a critical issue when generating complex projects (particularly games) using the Claude Opus model. The system would get stuck in an infinite loop with the following symptoms:

1. **File Write Loop**: Claude Opus would write the same game file 3 times, triggering the file write loop detection
2. **Failed Escalation**: System would escalate to Qwen3-coder as the fallback model
3. **JSON Truncation**: Qwen would generate JSON responses that were too large (13,000+ chars) and get truncated mid-string
4. **Parse Failures**: JSON parsing would fail repeatedly with "Unterminated string in JSON" errors
5. **Stuck Loop**: System couldn't recover because Qwen was the last model in the chain

## Root Cause Analysis

### Problem 1: Inappropriate Fallback Model
When using Anthropic Claude as the primary provider, the escalation chain was:
```
Claude Haiku → Claude Sonnet → Claude Opus → **Qwen (Ollama)**
```

The issue: **Qwen has token output limitations that cause JSON truncation** when generating large files (games, complex apps). The truncated JSON cannot be parsed, causing infinite parse error loops.

### Problem 2: No Truncation Detection
The agent loop had no detection for truncated JSON responses. When Qwen's output was cut off mid-string, the parsing would fail silently, and the system would keep retrying with the same broken model.

### Problem 3: Insufficient Proactive Guidance
The OPUS thinking engine didn't provide enough guidance to models about handling complex file generation, leading to attempts to write 500+ line files in one shot.

## Solutions Implemented

### Fix 1: JSON Truncation Detection ✅
**Location**: `src/main/agent-loop.ts` (lines 2271-2295)

Added detection logic that identifies truncated JSON before parsing:
```typescript
// === DETECT JSON TRUNCATION (common with Qwen on large outputs) ===
const responseLength = response.content.length;
const hasUnclosedString = response.content.match(/"[^"]*$/);
const hasUnclosedBrace = (response.content.match(/\{/g) || []).length > 
                         (response.content.match(/\}/g) || []).length;

if ((hasUnclosedString || hasUnclosedBrace) && responseLength > 10000) {
  // Check if this is Qwen model (which tends to truncate on large outputs)
  if (modelToUse.includes('qwen')) {
    console.log(`[Agent] 🔄 Qwen model produced truncated output - escalating`);
    const escalated = this.recordModelFailure('json_truncation');
    
    if (escalated) {
      // Add guidance for next model
      this.messages.push({
        role: 'user',
        content: `[SYSTEM] Previous model's response was truncated. 
                  Break down the file generation into smaller pieces.`
      });
      continue; // Skip to next iteration with better model
    }
  }
}
```

**Impact**: Prevents parse error loops by detecting truncation early and escalating before attempting to parse.

### Fix 2: Improved Model Escalation Chain ✅
**Location**: `src/main/agent-loop.ts` (lines 1929-1936)

Changed the Anthropic escalation chain to retry with Claude Opus instead of falling back to Qwen:
```typescript
// OLD (BROKEN):
this.modelChain = [
  { name: 'Claude Haiku', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
  { name: 'Claude Sonnet', provider: 'anthropic', model: 'claude-sonnet-4-20250514', tier: 'deep' },
  { name: 'Claude Opus', provider: 'anthropic', model: 'claude-opus-4-20250514', tier: 'premium' },
  { name: 'Ollama Fallback', provider: 'ollama', model: 'qwen3-coder:480b-cloud', tier: 'fallback' }  // ❌ Breaks on large files
];

// NEW (FIXED):
this.modelChain = [
  { name: 'Claude Haiku', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', tier: 'fast' },
  { name: 'Claude Sonnet', provider: 'anthropic', model: 'claude-sonnet-4-20250514', tier: 'deep' },
  { name: 'Claude Opus', provider: 'anthropic', model: 'claude-opus-4-20250514', tier: 'premium' },
  { name: 'Claude Opus (Retry)', provider: 'anthropic', model: 'claude-opus-4-20250514', tier: 'fallback' }  // ✅ Retry with different instructions
];
```

**Rationale**: 
- Claude Opus has 16k token output capacity vs Qwen's more limited capacity
- Better to retry with Claude Opus and different instructions than fall back to a less capable model
- Prevents JSON truncation issues entirely
- Keeps the quality bar high

### Fix 3: Proactive Complex File Guidance ✅
**Location**: `src/main/agent-loop.ts` (lines 157-211)

Enhanced the OPUS thinking engine's pre-task prompt to include specific guidance for complex projects:

```typescript
const isGameOrComplex = analysis.projectType === 'game' || 
                        analysis.complexity === 'complex';

const complexFileGuidance = isGameOrComplex ? `

### ⚠️ CRITICAL: COMPLEX FILE GENERATION STRATEGY
For games and complex projects, AVOID writing massive files that exceed token limits:

✅ CORRECT APPROACH:
1. Start with a MINIMAL, WORKING version (under 100 lines)
2. Test and validate it works
3. Then incrementally add features one at a time
4. Each iteration should ADD functionality, not rewrite everything

❌ WRONG APPROACH:
- Writing 500+ line files in one shot
- Including ALL features immediately
- Rewriting the same file multiple times to "fix" it

Remember: Better to have a simple, working game than a complex, broken one!` : '';
```

**Impact**: Models now receive upfront guidance about handling complex projects, reducing the likelihood of file write loops.

## Benefits

### 1. No More Infinite Loops 🎯
- Truncated JSON is detected before parsing
- System escalates automatically instead of getting stuck
- Models receive guidance to avoid the problem in the first place

### 2. Better Model Utilization 💪
- Claude Opus (premium) is retried instead of falling back to Qwen
- Maintains high quality throughout the escalation chain
- Better token capacity handling (16k vs limited)

### 3. Smarter Generation Strategy 🧠
- Models are guided to use incremental approaches for complex files
- Reduces likelihood of generating files that exceed token limits
- Encourages iterative development over "one giant file" approach

### 4. More Robust Error Recovery 🛡️
- Multiple detection layers (truncation, parse errors, file loops)
- Each layer provides specific guidance for recovery
- System can adapt strategy mid-task

## Testing Recommendations

To verify these fixes work correctly:

1. **Test Complex Game Generation**:
   ```
   "Create a Phaser.js pinball game with Dino Buddy theme"
   ```
   - Should complete without getting stuck in parse loops
   - Should use Claude Opus throughout if available
   - Should generate working code in incremental fashion

2. **Test Truncation Detection**:
   ```
   "Create a full-featured React dashboard with 20+ components"
   ```
   - Should detect if any model tries to generate overly large files
   - Should escalate and break down the task
   - Should complete successfully

3. **Test Escalation Chain**:
   - Monitor console logs for model transitions
   - Verify no fallback to Qwen when using Anthropic
   - Confirm Opus retry happens with different guidance

## Future Improvements

### Potential Enhancements:
1. **Dynamic Token Limits**: Adjust max_tokens based on detected file complexity
2. **Chunked Generation**: Automatically split large files into logical chunks
3. **Progressive Enhancement**: Build minimal version first, then add features in separate passes
4. **Model-Specific Strategies**: Different approaches for Claude vs GPT vs Ollama models

## Conclusion

These fixes address the core issues causing infinite loops in AgentPrime's agent mode:
- ✅ Detects JSON truncation before it causes parse errors
- ✅ Uses appropriate fallback models (Claude Opus instead of Qwen)
- ✅ Provides proactive guidance to prevent the issue
- ✅ Maintains high quality throughout the escalation chain

The system is now more robust, intelligent, and capable of handling complex project generation without getting stuck in loops! 🚀

