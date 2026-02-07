/**
 * Matrix Mode Rate Limiter
 * Token bucket algorithm with per-channel and per-user limits
 * Protects against spam and abuse
 */

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Burst allowance (extra requests allowed for short bursts) */
  burst?: number;
  /** Block duration after limit exceeded (ms) */
  blockDuration?: number;
  /** Skip rate limiting for these IDs */
  whitelist?: string[];
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  blocked?: boolean;
  blockedUntil?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  blocked?: boolean;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 60,
  windowMs: 60000, // 1 minute
  burst: 10,
  blockDuration: 300000 // 5 minutes
};

export const CHANNEL_RATE_LIMITS: Record<string, RateLimitConfig> = {
  whatsapp: { maxRequests: 30, windowMs: 60000, burst: 5 },
  telegram: { maxRequests: 30, windowMs: 60000, burst: 5 },
  discord: { maxRequests: 50, windowMs: 60000, burst: 10 },
  slack: { maxRequests: 50, windowMs: 60000, burst: 10 },
  signal: { maxRequests: 20, windowMs: 60000, burst: 3 },
  imessage: { maxRequests: 20, windowMs: 60000, burst: 3 },
  msteams: { maxRequests: 40, windowMs: 60000, burst: 5 },
  matrix: { maxRequests: 60, windowMs: 60000, burst: 10 },
  webchat: { maxRequests: 100, windowMs: 60000, burst: 20 }
};

export class RateLimiter {
  private config: RateLimitConfig;
  private buckets: Map<string, TokenBucket> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
    
    // Clean up old buckets periodically
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if a request is allowed
   */
  check(key: string): RateLimitResult {
    // Check whitelist
    if (this.config.whitelist?.includes(key)) {
      return { allowed: true, remaining: Infinity, resetAt: 0 };
    }

    const now = Date.now();
    let bucket = this.buckets.get(key);

    // Create new bucket if needed
    if (!bucket) {
      bucket = {
        tokens: this.config.maxRequests + (this.config.burst || 0),
        lastRefill: now
      };
      this.buckets.set(key, bucket);
    }

    // Check if blocked
    if (bucket.blocked && bucket.blockedUntil) {
      if (now < bucket.blockedUntil) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: bucket.blockedUntil,
          retryAfter: bucket.blockedUntil - now,
          blocked: true
        };
      }
      // Unblock
      bucket.blocked = false;
      bucket.blockedUntil = undefined;
      bucket.tokens = this.config.maxRequests;
    }

    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / this.config.windowMs) * this.config.maxRequests;
    bucket.tokens = Math.min(
      this.config.maxRequests + (this.config.burst || 0),
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefill = now;

    // Check if we have tokens
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: now + this.config.windowMs
      };
    }

    // Rate limited - optionally block
    if (this.config.blockDuration && bucket.tokens < -5) {
      bucket.blocked = true;
      bucket.blockedUntil = now + this.config.blockDuration;
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: now + this.config.windowMs,
      retryAfter: this.config.windowMs
    };
  }

  /**
   * Consume a token (alias for check)
   */
  consume(key: string): RateLimitResult {
    return this.check(key);
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Get current status for a key
   */
  getStatus(key: string): RateLimitResult {
    const bucket = this.buckets.get(key);
    const now = Date.now();

    if (!bucket) {
      return {
        allowed: true,
        remaining: this.config.maxRequests + (this.config.burst || 0),
        resetAt: now + this.config.windowMs
      };
    }

    // Recalculate tokens without consuming
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / this.config.windowMs) * this.config.maxRequests;
    const currentTokens = Math.min(
      this.config.maxRequests + (this.config.burst || 0),
      bucket.tokens + tokensToAdd
    );

    return {
      allowed: currentTokens >= 1,
      remaining: Math.floor(currentTokens),
      resetAt: now + this.config.windowMs,
      blocked: bucket.blocked
    };
  }

  /**
   * Add to whitelist
   */
  whitelist(key: string): void {
    if (!this.config.whitelist) {
      this.config.whitelist = [];
    }
    if (!this.config.whitelist.includes(key)) {
      this.config.whitelist.push(key);
    }
  }

  /**
   * Remove from whitelist
   */
  removeFromWhitelist(key: string): void {
    if (this.config.whitelist) {
      const index = this.config.whitelist.indexOf(key);
      if (index >= 0) {
        this.config.whitelist.splice(index, 1);
      }
    }
  }

  /**
   * Block a key manually
   */
  block(key: string, durationMs?: number): void {
    const bucket = this.buckets.get(key) || {
      tokens: 0,
      lastRefill: Date.now()
    };
    
    bucket.blocked = true;
    bucket.blockedUntil = Date.now() + (durationMs || this.config.blockDuration || 300000);
    this.buckets.set(key, bucket);
  }

  /**
   * Unblock a key
   */
  unblock(key: string): void {
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.blocked = false;
      bucket.blockedUntil = undefined;
      bucket.tokens = this.config.maxRequests;
    }
  }

  /**
   * Clean up old buckets
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = this.config.windowMs * 2;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > staleThreshold && !bucket.blocked) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Get all keys that are currently blocked
   */
  getBlockedKeys(): string[] {
    return Array.from(this.buckets.entries())
      .filter(([_, bucket]) => bucket.blocked)
      .map(([key, _]) => key);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalKeys: number;
    blockedKeys: number;
    avgTokens: number;
  } {
    let totalTokens = 0;
    let blockedCount = 0;

    for (const bucket of this.buckets.values()) {
      totalTokens += bucket.tokens;
      if (bucket.blocked) blockedCount++;
    }

    return {
      totalKeys: this.buckets.size,
      blockedKeys: blockedCount,
      avgTokens: this.buckets.size > 0 ? totalTokens / this.buckets.size : 0
    };
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }
}

/**
 * Multi-tier rate limiter for different scopes
 */
export class MultiTierRateLimiter {
  private globalLimiter: RateLimiter;
  private channelLimiters: Map<string, RateLimiter> = new Map();
  private userLimiters: Map<string, RateLimiter> = new Map();

  constructor(globalConfig: Partial<RateLimitConfig> = {}) {
    this.globalLimiter = new RateLimiter({
      maxRequests: 1000,
      windowMs: 60000,
      ...globalConfig
    });
  }

  /**
   * Check rate limits at all tiers
   */
  check(params: {
    channelType: string;
    channelId: string;
    userId: string;
  }): RateLimitResult {
    // Check global limit first
    const globalResult = this.globalLimiter.check('global');
    if (!globalResult.allowed) {
      return { ...globalResult, tier: 'global' } as any;
    }

    // Check channel-type limit
    let channelLimiter = this.channelLimiters.get(params.channelType);
    if (!channelLimiter) {
      channelLimiter = new RateLimiter(
        CHANNEL_RATE_LIMITS[params.channelType] || DEFAULT_RATE_LIMIT
      );
      this.channelLimiters.set(params.channelType, channelLimiter);
    }
    
    const channelKey = `${params.channelType}:${params.channelId}`;
    const channelResult = channelLimiter.check(channelKey);
    if (!channelResult.allowed) {
      return { ...channelResult, tier: 'channel' } as any;
    }

    // Check per-user limit
    let userLimiter = this.userLimiters.get(params.channelType);
    if (!userLimiter) {
      userLimiter = new RateLimiter({
        maxRequests: 20,
        windowMs: 60000,
        burst: 5
      });
      this.userLimiters.set(params.channelType, userLimiter);
    }

    const userKey = `${params.channelType}:${params.userId}`;
    const userResult = userLimiter.check(userKey);
    if (!userResult.allowed) {
      return { ...userResult, tier: 'user' } as any;
    }

    return {
      allowed: true,
      remaining: Math.min(globalResult.remaining, channelResult.remaining, userResult.remaining),
      resetAt: Math.max(globalResult.resetAt, channelResult.resetAt, userResult.resetAt)
    };
  }

  /**
   * Block a user across all channels
   */
  blockUser(userId: string, channelType?: string, durationMs?: number): void {
    if (channelType) {
      const limiter = this.userLimiters.get(channelType);
      if (limiter) {
        limiter.block(`${channelType}:${userId}`, durationMs);
      }
    } else {
      for (const [type, limiter] of this.userLimiters) {
        limiter.block(`${type}:${userId}`, durationMs);
      }
    }
  }

  /**
   * Whitelist a user
   */
  whitelistUser(userId: string, channelType?: string): void {
    if (channelType) {
      const limiter = this.userLimiters.get(channelType);
      if (limiter) {
        limiter.whitelist(`${channelType}:${userId}`);
      }
    } else {
      for (const [type, limiter] of this.userLimiters) {
        limiter.whitelist(`${type}:${userId}`);
      }
    }
  }

  /**
   * Get combined statistics
   */
  getStats(): {
    global: ReturnType<RateLimiter['getStats']>;
    channels: Record<string, ReturnType<RateLimiter['getStats']>>;
    users: Record<string, ReturnType<RateLimiter['getStats']>>;
  } {
    const channelStats: Record<string, any> = {};
    for (const [type, limiter] of this.channelLimiters) {
      channelStats[type] = limiter.getStats();
    }

    const userStats: Record<string, any> = {};
    for (const [type, limiter] of this.userLimiters) {
      userStats[type] = limiter.getStats();
    }

    return {
      global: this.globalLimiter.getStats(),
      channels: channelStats,
      users: userStats
    };
  }

  /**
   * Destroy all limiters
   */
  destroy(): void {
    this.globalLimiter.destroy();
    for (const limiter of this.channelLimiters.values()) {
      limiter.destroy();
    }
    for (const limiter of this.userLimiters.values()) {
      limiter.destroy();
    }
    this.channelLimiters.clear();
    this.userLimiters.clear();
  }
}

// Singleton instance
let rateLimiterInstance: MultiTierRateLimiter | null = null;

export function getRateLimiter(): MultiTierRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new MultiTierRateLimiter();
  }
  return rateLimiterInstance;
}

export default RateLimiter;
