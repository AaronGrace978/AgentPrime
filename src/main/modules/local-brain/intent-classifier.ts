/**
 * Intent Classifier - Fast local intent detection using small LLM
 * Determines if a request can be handled locally or needs cloud AI
 */

import { ClassifiedIntent, IntentCategory } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT PATTERNS - Ultra-fast regex-based classification
// ═══════════════════════════════════════════════════════════════════════════════

interface IntentPattern {
  pattern: RegExp;
  category: IntentCategory;
  action?: string;
  confidence: number;
  extractParams?: (match: RegExpMatchArray, input: string) => Record<string, any>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM CONTROL (instant)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /^(?:what(?:'s| is) (?:the )?)?(?:time|date)\??$/i,
    category: 'time_date',
    action: 'datetime_get',
    confidence: 0.99
  },
  {
    pattern: /^mute$|^unmute$|^toggle mute$/i,
    category: 'system_control',
    action: 'mute_toggle',
    confidence: 0.99
  },
  {
    pattern: /(?:set )?volume (?:to )?(\d+)/i,
    category: 'system_control',
    action: 'volume_set',
    confidence: 0.95,
    extractParams: (match) => ({ level: parseInt(match[1]) })
  },
  {
    pattern: /lock (?:my )?(?:computer|screen|pc|workstation)/i,
    category: 'system_control',
    action: 'system_lock',
    confidence: 0.95
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // APP/GAME LAUNCH
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /^(?:open|launch|start) (chrome|firefox|edge|spotify|discord|slack|vscode|code|terminal|notepad|calculator|steam|explorer)$/i,
    category: 'app_launch',
    action: 'open_app',
    confidence: 0.95,
    extractParams: (match) => ({ app: match[1].toLowerCase() })
  },
  {
    pattern: /^(?:open|launch|start) (?:up )?(outlook|word|excel|powerpoint|teams|notion|obsidian)$/i,
    category: 'app_launch',
    action: 'open_app',
    confidence: 0.95,
    extractParams: (match) => ({ app: match[1].toLowerCase() })
  },
  // Website name patterns - "open linkedin", "open up youtube", "go to reddit"
  {
    pattern: /(?:open|go\s*to|pull\s*up|visit|browse|check|hop\s*on|get\s*on)\s+(?:up\s+)?(linkedin|youtube|twitter|facebook|instagram|reddit|github|gmail|google|amazon|netflix|twitch|tiktok|pinterest|stackoverflow|stack overflow|wikipedia|chatgpt|claude|bing|yahoo|ebay|hulu|crunchyroll)/i,
    category: 'web_navigation',
    action: 'open_url',
    confidence: 0.95,
    extractParams: (match) => {
      const SITE_URLS: Record<string, string> = {
        'linkedin': 'https://www.linkedin.com', 'youtube': 'https://www.youtube.com',
        'twitter': 'https://twitter.com', 'facebook': 'https://www.facebook.com',
        'instagram': 'https://www.instagram.com', 'reddit': 'https://www.reddit.com',
        'github': 'https://github.com', 'gmail': 'https://mail.google.com',
        'google': 'https://www.google.com', 'amazon': 'https://www.amazon.com',
        'netflix': 'https://www.netflix.com', 'twitch': 'https://www.twitch.tv',
        'tiktok': 'https://www.tiktok.com', 'pinterest': 'https://www.pinterest.com',
        'stackoverflow': 'https://stackoverflow.com', 'stack overflow': 'https://stackoverflow.com',
        'wikipedia': 'https://www.wikipedia.org', 'chatgpt': 'https://chat.openai.com',
        'claude': 'https://claude.ai', 'bing': 'https://www.bing.com',
        'yahoo': 'https://www.yahoo.com', 'ebay': 'https://www.ebay.com',
        'hulu': 'https://www.hulu.com', 'crunchyroll': 'https://www.crunchyroll.com',
      };
      const site = match[1].toLowerCase();
      return { url: SITE_URLS[site] || `https://www.${site}.com` };
    }
  },
  {
    pattern: /^(?:play|launch|start) (.+?)(?:\s+game)?$/i,
    category: 'app_launch',
    action: 'launch_game',
    confidence: 0.8,
    extractParams: (match) => ({ target: match[1].trim() })
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // CALENDAR
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:what'?s?\s+(?:on\s+)?(?:my\s+)?(?:calendar|schedule)\s*(?:today)?|today'?s?\s+(?:calendar|schedule|events?))/i,
    category: 'calendar',
    action: 'calendar_today',
    confidence: 0.95
  },
  {
    pattern: /(?:add|schedule|create|put)\s+(.+?)\s+(?:to\s+)?(?:my\s+)?calendar/i,
    category: 'calendar',
    action: 'calendar_add_event',
    confidence: 0.85,
    extractParams: (match, input) => {
      const subject = match[1].trim();
      // Try to extract date/time
      const dateMatch = input.match(/(?:for|on)\s+(today|tomorrow|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?)/i);
      const timeMatch = input.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      return {
        subject,
        date: dateMatch?.[1],
        time: timeMatch?.[1]
      };
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:how many )?(?:unread )?emails?|check (?:my )?inbox|any (?:new )?emails?/i,
    category: 'email',
    action: 'email_unread_count',
    confidence: 0.9
  },
  {
    pattern: /send (?:an? )?email to (.+?)(?:\s+(?:about|regarding|re:?)\s+(.+))?$/i,
    category: 'email',
    action: 'email_send',
    confidence: 0.75,  // Lower - needs AI for body
    extractParams: (match) => ({
      to: match[1].trim(),
      subject: match[2]?.trim()
    })
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // REMINDERS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /remind me in (\d+)\s*(min(?:ute)?s?|hours?|hrs?)/i,
    category: 'reminder',
    action: 'reminder_create',
    confidence: 0.95,
    extractParams: (match, input) => {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      let delay = amount;
      if (unit.startsWith('hour') || unit.startsWith('hr')) {
        delay = amount * 60;
      }
      // Extract message
      const msgMatch = input.match(/(?:to|about)\s+(.+)$/i);
      return {
        delay,
        message: msgMatch?.[1] || 'Reminder',
        title: 'Reminder'
      };
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // FILE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /organize (?:my )?(downloads|desktop|documents)/i,
    category: 'file_operation',
    action: 'organize_folder',
    confidence: 0.9,
    extractParams: (match) => {
      const folder = match[1].toLowerCase();
      const userHome = process.env.USERPROFILE || process.env.HOME || '';
      const path = require('path');
      return { path: path.join(userHome, folder.charAt(0).toUpperCase() + folder.slice(1)) };
    }
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // DESKTOP CONTROL (smart icon manipulation)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:list|show|what'?s on)(?: my)? desktop/i,
    category: 'file_operation',
    action: 'desktop_list',
    confidence: 0.95
  },
  {
    pattern: /(?:move|drag|put) (.+?) (?:to the |)(left|right|above|below)(?: of)? (.+)/i,
    category: 'file_operation',
    action: 'desktop_move',
    confidence: 0.9,
    extractParams: (match) => ({
      icon: match[1].trim(),
      position: match[2].toLowerCase(),
      target: match[3].trim()
    })
  },
  {
    pattern: /(?:move|drag|put) (.+?) next to (.+)/i,
    category: 'file_operation',
    action: 'desktop_move',
    confidence: 0.9,
    extractParams: (match) => ({
      icon: match[1].trim(),
      target: match[2].trim(),
      position: 'right'
    })
  },
  {
    pattern: /(?:find|where is) (.+?) on (?:my )?desktop/i,
    category: 'file_operation',
    action: 'desktop_find',
    confidence: 0.9,
    extractParams: (match) => ({
      name: match[1].trim()
    })
  },
  {
    pattern: /arrange (?:my )?desktop(?: by (name|type))?/i,
    category: 'file_operation',
    action: 'desktop_arrange',
    confidence: 0.95,
    extractParams: (match) => ({
      arrangement: match[1]?.toLowerCase() === 'name' ? 'by-name' : 
                   match[1]?.toLowerCase() === 'type' ? 'by-type' : 'auto'
    })
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // MEDIA
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:play|put on) (?:some )?(?:music|songs?)/i,
    category: 'media',
    action: 'spotify_play',
    confidence: 0.85
  },
  {
    pattern: /(?:pause|stop) (?:the )?music/i,
    category: 'media',
    action: 'spotify_pause',
    confidence: 0.9
  },
  {
    // Match "next song", "skip track", "next" but NOT "next to" (desktop move)
    pattern: /(?:next|skip)(?: song| track)$|^(?:next|skip)$/i,
    category: 'media',
    action: 'spotify_next',
    confidence: 0.9
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SMART HOME
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:turn|switch) (on|off) (?:the )?lights?/i,
    category: 'smart_home',
    action: 'hue_lights',
    confidence: 0.9,
    extractParams: (match) => ({ action: match[1].toLowerCase() })
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // AUTOMATION
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:press|hit) (ctrl|alt|shift|win|cmd)[\s+\-](.+)/i,
    category: 'automation',
    action: 'smart_hotkey',
    confidence: 0.9,
    extractParams: (match) => ({ keys: [match[1].toLowerCase(), match[2].toLowerCase()] })
  },
  {
    pattern: /scroll (up|down)/i,
    category: 'automation',
    action: 'smart_scroll',
    confidence: 0.9,
    extractParams: (match) => ({ direction: match[1].toLowerCase(), amount: 5 })
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // WEB SEARCH (route to cloud with web_search)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:search|google|look up|find info|what is|who is|how (?:do|to)|when did|where is)/i,
    category: 'web_search',
    confidence: 0.7  // Lower confidence - might be conversational
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // COMPLEX TASKS (always route to cloud)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    pattern: /(?:write|create|generate|build|develop|implement|design|plan|analyze|explain|help me)/i,
    category: 'complex_task',
    confidence: 0.8
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Classify intent using pattern matching (instant, no LLM needed)
 */
export function classifyIntentFast(input: string): ClassifiedIntent | null {
  const trimmed = input.trim();
  
  for (const pattern of INTENT_PATTERNS) {
    const match = trimmed.match(pattern.pattern);
    if (match) {
      const params = pattern.extractParams ? pattern.extractParams(match, trimmed) : undefined;
      
      // Determine routing based on category and confidence
      let routing: 'fastpath' | 'local' | 'cloud' = 'local';
      
      if (pattern.confidence >= 0.9 && pattern.action) {
        routing = 'fastpath';  // High confidence with known action - execute directly
      } else if (pattern.category === 'complex_task' || pattern.category === 'web_search') {
        routing = 'cloud';  // Complex tasks always go to cloud
      } else if (pattern.confidence >= 0.7) {
        routing = 'local';  // Can be handled by local LLM
      } else {
        routing = 'cloud';  // Low confidence - use cloud for accuracy
      }
      
      return {
        category: pattern.category,
        confidence: pattern.confidence,
        action: pattern.action,
        params,
        routing
      };
    }
  }
  
  return null;  // No pattern matched
}

/**
 * Estimate complexity of a request (0-1)
 * Higher = more complex, needs cloud
 */
export function estimateComplexity(input: string): number {
  let complexity = 0;
  
  // Length factor
  if (input.length > 200) complexity += 0.3;
  else if (input.length > 100) complexity += 0.15;
  
  // Multiple sentences
  const sentences = input.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 2) complexity += 0.2;
  
  // Contains code or technical content
  if (/```|function|const |let |var |import |class |def |async |await /.test(input)) {
    complexity += 0.4;
  }
  
  // Multiple questions
  if ((input.match(/\?/g) || []).length > 1) complexity += 0.15;
  
  // Explanation words
  if (/explain|describe|analyze|compare|evaluate|summarize/i.test(input)) {
    complexity += 0.25;
  }
  
  // Multi-step indicators
  if (/then|after that|next|also|and then|step|first|second/i.test(input)) {
    complexity += 0.2;
  }
  
  return Math.min(1, complexity);
}

/**
 * Check if input is a simple yes/no or acknowledgment
 */
export function isSimpleAcknowledgment(input: string): boolean {
  const simple = /^(yes|no|yeah|nope|ok|okay|sure|thanks|thank you|got it|cool|nice|great|perfect|awesome)\.?!?$/i;
  return simple.test(input.trim());
}

/**
 * Check if input is a follow-up question (likely needs context)
 */
export function isFollowUp(input: string): boolean {
  const followUp = /^(what about|how about|and |but |so |also |why|can you|could you|what if)/i;
  return followUp.test(input.trim());
}
