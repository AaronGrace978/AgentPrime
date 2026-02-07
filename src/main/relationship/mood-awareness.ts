/**
 * MoodAwareness - Understanding user emotional state
 * 
 * "I know you're out there. I can feel you now."
 */

import type { UserMood } from './types';

/**
 * Mood detection patterns
 */
interface MoodPattern {
  mood: UserMood;
  patterns: RegExp[];
  keywords: string[];
  indicators: string[];  // Behavioral indicators
}

const MOOD_PATTERNS: MoodPattern[] = [
  {
    mood: 'focused',
    patterns: [
      /need to finish/i,
      /working on/i,
      /let me concentrate/i,
      /getting this done/i
    ],
    keywords: ['focus', 'work', 'deadline', 'task', 'project', 'finish', 'complete'],
    indicators: ['short messages', 'technical language', 'specific requests']
  },
  {
    mood: 'playful',
    patterns: [
      /lol/i,
      /haha/i,
      /\:D/,
      /\:\)/,
      /😂|😄|🎉|🎮|🤣/,
      /wooo+/i,
      /yay/i
    ],
    keywords: ['fun', 'play', 'game', 'joke', 'cool', 'awesome', 'nice'],
    indicators: ['emojis', 'exclamation marks', 'casual language']
  },
  {
    mood: 'frustrated',
    patterns: [
      /why (isn't|won't|doesn't)/i,
      /not working/i,
      /broken/i,
      /hate this/i,
      /ugh+/i,
      /argh+/i,
      /ffs/i,
      /wtf/i
    ],
    keywords: ['error', 'bug', 'wrong', 'broken', 'stuck', 'help', 'issue', 'problem', 'frustrated'],
    indicators: ['all caps', 'multiple punctuation', 'short frustrated messages']
  },
  {
    mood: 'exploratory',
    patterns: [
      /how (do|does|can|would)/i,
      /what (is|are|if)/i,
      /why (do|does|is)/i,
      /explain/i,
      /show me/i,
      /teach/i,
      /learn/i
    ],
    keywords: ['curious', 'wonder', 'explore', 'understand', 'learn', 'how', 'why', 'what'],
    indicators: ['questions', 'open-ended requests']
  },
  {
    mood: 'rushed',
    patterns: [
      /quick(ly)?/i,
      /fast/i,
      /hurry/i,
      /asap/i,
      /urgent/i,
      /right now/i,
      /immediately/i,
      /just do/i
    ],
    keywords: ['quick', 'fast', 'hurry', 'urgent', 'now', 'immediately', 'asap'],
    indicators: ['short commands', 'imperative tone']
  },
  {
    mood: 'relaxed',
    patterns: [
      /no rush/i,
      /whenever/i,
      /take your time/i,
      /chill/i,
      /relaxed/i
    ],
    keywords: ['chill', 'relax', 'easy', 'casual', 'whenever', 'eventually'],
    indicators: ['casual greetings', 'longer messages', 'friendly tone']
  }
];

/**
 * Mood confidence scores
 */
interface MoodScore {
  mood: UserMood;
  score: number;
  factors: string[];
}

/**
 * MoodAwareness - Detects and tracks user mood
 */
export class MoodAwareness {
  private currentMood: UserMood = 'unknown';
  private moodHistory: Array<{ mood: UserMood; timestamp: Date }> = [];
  private maxHistory = 50;
  
  constructor() {
    console.log('👁️ [Matrix] Mood awareness online');
  }

  /**
   * Analyze message for mood indicators
   */
  analyzeMood(message: string): MoodScore[] {
    const scores: MoodScore[] = [];
    
    for (const pattern of MOOD_PATTERNS) {
      let score = 0;
      const factors: string[] = [];
      
      // Check regex patterns
      for (const regex of pattern.patterns) {
        if (regex.test(message)) {
          score += 3;
          factors.push(`pattern: ${regex.source.substring(0, 20)}`);
        }
      }
      
      // Check keywords
      const messageLower = message.toLowerCase();
      for (const keyword of pattern.keywords) {
        if (messageLower.includes(keyword)) {
          score += 2;
          factors.push(`keyword: ${keyword}`);
        }
      }
      
      // Check behavioral indicators
      if (pattern.indicators.includes('emojis') && /[\u{1F600}-\u{1F6FF}]/u.test(message)) {
        score += 1;
        factors.push('has emojis');
      }
      if (pattern.indicators.includes('all caps') && message === message.toUpperCase() && message.length > 5) {
        score += 2;
        factors.push('ALL CAPS');
      }
      if (pattern.indicators.includes('multiple punctuation') && /[!?]{2,}/.test(message)) {
        score += 1;
        factors.push('multiple punctuation');
      }
      if (pattern.indicators.includes('short messages') && message.length < 20) {
        score += 0.5;
        factors.push('short message');
      }
      if (pattern.indicators.includes('questions') && message.includes('?')) {
        score += 1;
        factors.push('has question');
      }
      
      if (score > 0) {
        scores.push({
          mood: pattern.mood,
          score,
          factors
        });
      }
    }
    
    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    
    return scores;
  }

  /**
   * Detect and update current mood
   */
  detectMood(message: string): UserMood {
    const scores = this.analyzeMood(message);
    
    if (scores.length === 0 || scores[0].score < 2) {
      // Not enough signal, keep previous mood or unknown
      return this.currentMood;
    }
    
    // Check for mood shift
    const newMood = scores[0].mood;
    const wasShift = this.currentMood !== newMood && this.currentMood !== 'unknown';
    
    if (wasShift) {
      console.log(`[Matrix] Mood shift detected: ${this.currentMood} → ${newMood}`);
    }
    
    this.currentMood = newMood;
    this.moodHistory.push({ mood: newMood, timestamp: new Date() });
    
    // Trim history
    if (this.moodHistory.length > this.maxHistory) {
      this.moodHistory = this.moodHistory.slice(-this.maxHistory);
    }
    
    return newMood;
  }

  /**
   * Get current detected mood
   */
  getCurrentMood(): UserMood {
    return this.currentMood;
  }

  /**
   * Get mood trend (what mood has been dominant recently)
   */
  getMoodTrend(windowSize: number = 10): UserMood {
    if (this.moodHistory.length === 0) {
      return 'unknown';
    }
    
    const recent = this.moodHistory.slice(-windowSize);
    const counts = new Map<UserMood, number>();
    
    for (const entry of recent) {
      counts.set(entry.mood, (counts.get(entry.mood) || 0) + 1);
    }
    
    let maxMood: UserMood = 'unknown';
    let maxCount = 0;
    
    for (const [mood, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxMood = mood;
      }
    }
    
    return maxMood;
  }

  /**
   * Get response style recommendation based on mood
   */
  getResponseStyleRecommendation(): {
    verbosity: 'minimal' | 'normal' | 'detailed';
    tone: 'professional' | 'friendly' | 'playful' | 'supportive';
    pacing: 'fast' | 'normal' | 'relaxed';
    humor: boolean;
  } {
    switch (this.currentMood) {
      case 'focused':
        return { verbosity: 'minimal', tone: 'professional', pacing: 'fast', humor: false };
      case 'playful':
        return { verbosity: 'normal', tone: 'playful', pacing: 'normal', humor: true };
      case 'frustrated':
        return { verbosity: 'minimal', tone: 'supportive', pacing: 'fast', humor: false };
      case 'exploratory':
        return { verbosity: 'detailed', tone: 'friendly', pacing: 'relaxed', humor: false };
      case 'rushed':
        return { verbosity: 'minimal', tone: 'professional', pacing: 'fast', humor: false };
      case 'relaxed':
        return { verbosity: 'normal', tone: 'friendly', pacing: 'relaxed', humor: true };
      default:
        return { verbosity: 'normal', tone: 'friendly', pacing: 'normal', humor: false };
    }
  }

  /**
   * Get Matrix-style mood commentary
   */
  getMoodCommentary(): string {
    switch (this.currentMood) {
      case 'focused':
        return 'I sense determination. Let\'s get this done.';
      case 'playful':
        return 'The Matrix approves of your energy. 😎';
      case 'frustrated':
        return 'I feel your frustration. Let me help.';
      case 'exploratory':
        return 'Curiosity is the first step to enlightenment.';
      case 'rushed':
        return 'Time is of the essence. Moving fast.';
      case 'relaxed':
        return 'No rush. We have all the time in the Matrix.';
      default:
        return '';
    }
  }

  /**
   * Check if mood suggests caution
   */
  shouldBeCautious(): boolean {
    return this.currentMood === 'frustrated' || this.currentMood === 'rushed';
  }

  /**
   * Check if humor is appropriate
   */
  isHumorAppropriate(): boolean {
    return this.currentMood === 'playful' || this.currentMood === 'relaxed';
  }

  /**
   * Reset mood tracking
   */
  reset(): void {
    this.currentMood = 'unknown';
    this.moodHistory = [];
  }
}

// Singleton
let _moodAwareness: MoodAwareness | null = null;

export function getMoodAwareness(): MoodAwareness {
  if (!_moodAwareness) {
    _moodAwareness = new MoodAwareness();
  }
  return _moodAwareness;
}
