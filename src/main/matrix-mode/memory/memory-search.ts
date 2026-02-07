/**
 * Matrix Mode Memory Search
 * Vector search for semantic recall across conversation history
 * 
 * Enhanced with:
 * - TF-IDF weighted embeddings with positional encoding
 * - BM25 keyword scoring for hybrid search
 * - N-gram support for phrase matching
 * - Semantic similarity boosting
 */

import { MemoryEntry, MemorySearchResult, MemoryConfig } from './types';
import { MemoryStore, getMemoryStore } from './memory-store';

// ============================================================================
// MATH UTILITIES
// ============================================================================

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Fast hash function for strings (FNV-1a)
 */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/**
 * Generate multiple hash values for a word (for embedding distribution)
 */
function multiHash(word: string, count: number): number[] {
  const hashes: number[] = [];
  let h = hashString(word);
  for (let i = 0; i < count; i++) {
    hashes.push(h);
    h = (h * 31 + 17) >>> 0;
  }
  return hashes;
}

// ============================================================================
// TOKENIZATION & TEXT PROCESSING
// ============================================================================

/**
 * Common English stop words
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'and', 'but', 'or', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who'
]);

/**
 * Tokenize text into words, optionally removing stop words
 */
function tokenize(text: string, removeStopWords: boolean = false): string[] {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
  
  if (removeStopWords) {
    return tokens.filter(t => !STOP_WORDS.has(t));
  }
  return tokens;
}

/**
 * Generate n-grams from tokens
 */
function generateNgrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Simple stemming (Porter-like suffix removal)
 */
function stem(word: string): string {
  if (word.length < 4) return word;
  
  // Common suffix patterns
  const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'ness', 'ment', 'able', 'ible', 'ful', 'less', 'ous'];
  
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  
  // Handle 's' suffix
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    return word.slice(0, -1);
  }
  
  return word;
}

// ============================================================================
// TF-IDF IMPLEMENTATION
// ============================================================================

/**
 * Calculate term frequency with augmented frequency (prevents bias toward longer docs)
 */
function calculateTF(term: string, tokens: string[]): number {
  const termCount = tokens.filter(t => t === term || stem(t) === stem(term)).length;
  const maxCount = Math.max(...Object.values(
    tokens.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ));
  return 0.5 + 0.5 * (termCount / (maxCount || 1));
}

/**
 * Simple IDF approximation (without document frequency - estimated from word rarity)
 */
function estimateIDF(term: string): number {
  // Estimate based on word length and character patterns
  // Longer, more specific words are likely rarer
  const lengthFactor = Math.min(term.length / 8, 1.5);
  
  // Words with numbers or special patterns are likely more specific
  const hasNumbers = /\d/.test(term) ? 0.5 : 0;
  const hasCamelCase = /[a-z][A-Z]/.test(term) ? 0.3 : 0;
  
  return 1 + lengthFactor + hasNumbers + hasCamelCase;
}

// ============================================================================
// ENHANCED LOCAL EMBEDDING
// ============================================================================

/**
 * Advanced local embedding using TF-IDF + positional encoding + n-grams
 * This produces much better semantic representations than simple character hashing
 */
function enhancedLocalEmbedding(text: string, dimensions: number = 384): number[] {
  const embedding = new Array(dimensions).fill(0);
  
  // Tokenize and get stems
  const tokens = tokenize(text, false);
  const contentTokens = tokenize(text, true); // Without stop words for TF-IDF
  const stemmedTokens = contentTokens.map(stem);
  
  // Generate bigrams and trigrams for phrase matching
  const bigrams = generateNgrams(tokens, 2);
  const trigrams = generateNgrams(tokens, 3);
  
  // Process unigrams with TF-IDF weighting
  for (let i = 0; i < contentTokens.length; i++) {
    const token = contentTokens[i];
    const stemmed = stemmedTokens[i];
    
    const tf = calculateTF(token, contentTokens);
    const idf = estimateIDF(token);
    const tfidf = tf * idf;
    
    // Positional encoding: earlier words get slightly more weight
    const positionWeight = 1 - (i / (contentTokens.length * 2));
    
    // Distribute across embedding dimensions using multiple hashes
    const hashes = multiHash(stemmed, 4);
    for (let h = 0; h < hashes.length; h++) {
      const idx = hashes[h] % dimensions;
      const sign = (hashes[h] & 1) ? 1 : -1; // Random sign for better distribution
      embedding[idx] += sign * tfidf * positionWeight * (1 - h * 0.2);
    }
    
    // Also add original word (non-stemmed) with lower weight
    const origHashes = multiHash(token, 2);
    for (let h = 0; h < origHashes.length; h++) {
      const idx = origHashes[h] % dimensions;
      embedding[idx] += tfidf * positionWeight * 0.3;
    }
  }
  
  // Process bigrams (phrase matching)
  for (const bigram of bigrams) {
    const hashes = multiHash(bigram, 2);
    for (let h = 0; h < hashes.length; h++) {
      const idx = hashes[h] % dimensions;
      embedding[idx] += 0.5; // Fixed weight for bigrams
    }
  }
  
  // Process trigrams (stronger phrase matching)
  for (const trigram of trigrams) {
    const idx = hashString(trigram) % dimensions;
    embedding[idx] += 0.8;
  }
  
  // Add semantic category signals based on keyword detection
  const semanticCategories: Record<string, string[]> = {
    'code': ['function', 'class', 'variable', 'method', 'api', 'code', 'debug', 'error', 'bug', 'implement'],
    'question': ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would'],
    'action': ['create', 'update', 'delete', 'add', 'remove', 'change', 'fix', 'build', 'run', 'open'],
    'data': ['file', 'database', 'table', 'record', 'data', 'json', 'csv', 'xml', 'save', 'load'],
    'ui': ['button', 'form', 'input', 'page', 'screen', 'modal', 'dialog', 'menu', 'style', 'layout']
  };
  
  for (const [category, keywords] of Object.entries(semanticCategories)) {
    const matches = tokens.filter(t => keywords.includes(t)).length;
    if (matches > 0) {
      const categoryHash = hashString(category);
      for (let i = 0; i < 5; i++) {
        const idx = (categoryHash + i * 31) % dimensions;
        embedding[idx] += matches * 0.4;
      }
    }
  }
  
  // L2 normalize the embedding
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }
  
  return embedding;
}

// Legacy function for backward compatibility
function simpleTextEmbedding(text: string, dimensions: number = 384): number[] {
  return enhancedLocalEmbedding(text, dimensions);
}

// ============================================================================
// BM25 IMPLEMENTATION FOR HYBRID SEARCH
// ============================================================================

/**
 * BM25 parameters
 */
const BM25_K1 = 1.5;  // Term frequency saturation
const BM25_B = 0.75; // Length normalization

/**
 * Calculate BM25 score for a query against a document
 */
function calculateBM25(
  queryTokens: string[],
  docTokens: string[],
  avgDocLength: number = 50
): number {
  const docLength = docTokens.length;
  const termFreqs: Record<string, number> = {};
  
  // Count term frequencies in document
  for (const token of docTokens) {
    const stemmed = stem(token);
    termFreqs[stemmed] = (termFreqs[stemmed] || 0) + 1;
  }
  
  let score = 0;
  const queryStems = [...new Set(queryTokens.map(stem))];
  
  for (const queryStem of queryStems) {
    const tf = termFreqs[queryStem] || 0;
    if (tf === 0) continue;
    
    // BM25 term score
    const idf = estimateIDF(queryStem);
    const numerator = tf * (BM25_K1 + 1);
    const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength));
    
    score += idf * (numerator / denominator);
  }
  
  return score;
}

/**
 * Calculate exact match bonus for important terms
 */
function calculateExactMatchBonus(query: string, doc: string): number {
  const queryLower = query.toLowerCase();
  const docLower = doc.toLowerCase();
  
  let bonus = 0;
  
  // Check for exact phrase matches
  if (docLower.includes(queryLower)) {
    bonus += 0.5;
  }
  
  // Check for important word matches (longer words are more significant)
  const queryWords = tokenize(query, true).filter(w => w.length > 4);
  for (const word of queryWords) {
    if (docLower.includes(word)) {
      bonus += 0.1;
    }
  }
  
  return Math.min(bonus, 1.0);
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
  name: string;
}

/**
 * Enhanced local embedding provider using TF-IDF + positional encoding
 * Produces high-quality embeddings without any external API
 */
class EnhancedLocalEmbeddingProvider implements EmbeddingProvider {
  dimensions = 384;
  name = 'enhanced-local';

  async embed(text: string): Promise<number[]> {
    return enhancedLocalEmbedding(text, this.dimensions);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Process in parallel for speed
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

// Legacy provider for backward compatibility
class LocalEmbeddingProvider implements EmbeddingProvider {
  dimensions = 384;
  name = 'local-legacy';

  async embed(text: string): Promise<number[]> {
    return enhancedLocalEmbedding(text, this.dimensions);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(t => enhancedLocalEmbedding(t, this.dimensions));
  }
}

/**
 * OpenAI embedding provider using text-embedding-3-small
 * Falls back to enhanced local embeddings on failure
 */
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  dimensions = 1536; // text-embedding-3-small
  name = 'openai';
  private apiKey: string;
  private failureCount = 0;
  private maxFailures = 3;
  private fallbackProvider: EnhancedLocalEmbeddingProvider;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.fallbackProvider = new EnhancedLocalEmbeddingProvider();
  }

  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // If too many failures, use fallback directly
    if (this.failureCount >= this.maxFailures) {
      console.warn('[MemorySearch] OpenAI disabled due to repeated failures, using enhanced local');
      return this.fallbackProvider.embedBatch(texts);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: texts
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI embedding failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.failureCount = 0; // Reset on success
      return data.data.map((item: any) => item.embedding);
    } catch (error) {
      this.failureCount++;
      console.warn(`[MemorySearch] OpenAI embedding failed (${this.failureCount}/${this.maxFailures}), using enhanced local:`, error);
      return this.fallbackProvider.embedBatch(texts);
    }
  }

  /**
   * Reset failure count (useful for testing connectivity)
   */
  resetFailures(): void {
    this.failureCount = 0;
  }
}

export interface HybridSearchOptions {
  sessionId?: string;
  channelId?: string;
  limit?: number;
  minScore?: number;
  includeCompacted?: boolean;
  /** Weight for vector similarity (0-1), remainder goes to BM25 */
  vectorWeight?: number;
  /** Enable exact match boosting */
  boostExactMatches?: boolean;
  /** Boost recent entries */
  recencyBoost?: boolean;
}

export class MemorySearch {
  private store: MemoryStore;
  private embeddingProvider: EmbeddingProvider;
  private embeddingCache: Map<string, { embedding: number[]; accessTime: number }> = new Map();
  private maxCacheSize = 2000; // Increased cache size
  private cacheHits = 0;
  private cacheMisses = 0;

  // Document statistics for BM25
  private avgDocLength: number = 50;
  private docLengths: Map<string, number> = new Map();

  constructor(store?: MemoryStore, embeddingModel: string = 'local', apiKey?: string) {
    this.store = store || getMemoryStore();
    
    if (embeddingModel === 'openai' && apiKey) {
      this.embeddingProvider = new OpenAIEmbeddingProvider(apiKey);
    } else {
      this.embeddingProvider = new EnhancedLocalEmbeddingProvider();
    }
  }

  /**
   * Generate embedding for text with LRU caching
   */
  async embed(text: string): Promise<number[]> {
    // Create cache key from text (truncated for efficiency)
    const cacheKey = text.substring(0, 200);
    const cached = this.embeddingCache.get(cacheKey);
    
    if (cached) {
      this.cacheHits++;
      cached.accessTime = Date.now();
      return cached.embedding;
    }

    this.cacheMisses++;
    const embedding = await this.embeddingProvider.embed(text);

    // LRU eviction - remove least recently accessed entries
    if (this.embeddingCache.size >= this.maxCacheSize) {
      let oldestKey = '';
      let oldestTime = Infinity;
      
      for (const [key, value] of this.embeddingCache) {
        if (value.accessTime < oldestTime) {
          oldestTime = value.accessTime;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.embeddingCache.delete(oldestKey);
      }
    }
    
    this.embeddingCache.set(cacheKey, { embedding, accessTime: Date.now() });
    return embedding;
  }

  /**
   * Hybrid search combining vector similarity and BM25 keyword matching
   */
  async search(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    const { 
      limit = 10, 
      minScore = 0.25, 
      includeCompacted = false,
      vectorWeight = 0.7,
      boostExactMatches = true,
      recencyBoost = true
    } = options;

    // Get query embedding and tokens
    const queryEmbedding = await this.embed(query);
    const queryTokens = tokenize(query, true);

    // Get candidate entries
    const entries = await this.store.getEntries({
      sessionId: options.sessionId,
      channelId: options.channelId,
      includeCompacted
    });

    if (entries.length === 0) {
      return [];
    }

    // Update average document length for BM25
    this.updateDocStats(entries);

    // Score each entry using hybrid approach
    const scoredEntries: MemorySearchResult[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      // 1. Vector similarity score
      let vectorScore: number;
      if (entry.embedding) {
        vectorScore = cosineSimilarity(queryEmbedding, entry.embedding);
      } else {
        const entryEmbedding = await this.embed(entry.content);
        vectorScore = cosineSimilarity(queryEmbedding, entryEmbedding);
      }

      // 2. BM25 keyword score
      const docTokens = tokenize(entry.content, false);
      const bm25Score = calculateBM25(queryTokens, docTokens, this.avgDocLength);
      // Normalize BM25 score (typically ranges 0-10+)
      const normalizedBM25 = Math.min(bm25Score / 5, 1);

      // 3. Combine scores with configurable weights
      let combinedScore = vectorScore * vectorWeight + normalizedBM25 * (1 - vectorWeight);

      // 4. Exact match bonus
      if (boostExactMatches) {
        const exactBonus = calculateExactMatchBonus(query, entry.content);
        combinedScore += exactBonus * 0.15;
      }

      // 5. Recency boost (gentle decay over 7 days)
      if (recencyBoost && entry.timestamp) {
        const ageInDays = (now - entry.timestamp) / dayMs;
        const recencyFactor = Math.exp(-ageInDays / 7) * 0.1;
        combinedScore += recencyFactor;
      }

      // 6. Role-based boost (user messages slightly more important for context)
      if (entry.role === 'user') {
        combinedScore *= 1.05;
      }

      // Normalize final score to 0-1 range
      combinedScore = Math.min(combinedScore, 1);

      if (combinedScore >= minScore) {
        scoredEntries.push({
          entry,
          score: combinedScore,
          distance: 1 - combinedScore,
          metadata: {
            vectorScore,
            bm25Score: normalizedBM25,
            method: 'hybrid'
          }
        });
      }
    }

    // Sort by score descending and limit
    scoredEntries.sort((a, b) => b.score - a.score);
    return scoredEntries.slice(0, limit);
  }

  /**
   * Fast keyword-only search (for when speed is critical)
   */
  async keywordSearch(
    query: string,
    options: { sessionId?: string; channelId?: string; limit?: number } = {}
  ): Promise<MemorySearchResult[]> {
    const { limit = 10 } = options;
    const queryTokens = tokenize(query, true);
    
    const entries = await this.store.getEntries({
      sessionId: options.sessionId,
      channelId: options.channelId
    });

    const scored = entries.map(entry => {
      const docTokens = tokenize(entry.content, false);
      const score = calculateBM25(queryTokens, docTokens, this.avgDocLength) / 5;
      return { entry, score: Math.min(score, 1), distance: 1 - Math.min(score, 1) };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).filter(r => r.score > 0.1);
  }

  /**
   * Update document statistics for BM25
   */
  private updateDocStats(entries: MemoryEntry[]): void {
    let totalLength = 0;
    for (const entry of entries) {
      const tokens = tokenize(entry.content, false);
      this.docLengths.set(entry.id, tokens.length);
      totalLength += tokens.length;
    }
    this.avgDocLength = entries.length > 0 ? totalLength / entries.length : 50;
  }

  /**
   * Search with keyword boosting
   */
  async searchWithKeywords(
    query: string,
    keywords: string[],
    options: {
      sessionId?: string;
      channelId?: string;
      limit?: number;
      keywordBoost?: number;
    } = {}
  ): Promise<MemorySearchResult[]> {
    const { keywordBoost = 0.2 } = options;
    
    const results = await this.search(query, options);

    // Boost scores for keyword matches
    for (const result of results) {
      const content = result.entry.content.toLowerCase();
      let boost = 0;
      
      for (const keyword of keywords) {
        if (content.includes(keyword.toLowerCase())) {
          boost += keywordBoost;
        }
      }
      
      result.score = Math.min(1, result.score + boost);
    }

    // Re-sort after boosting
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Find similar entries to a given entry
   */
  async findSimilar(
    entryId: string,
    options: {
      sessionId?: string;
      limit?: number;
      minScore?: number;
    } = {}
  ): Promise<MemorySearchResult[]> {
    const entries = await this.store.getEntries({ sessionId: options.sessionId });
    const targetEntry = entries.find(e => e.id === entryId);
    
    if (!targetEntry) {
      return [];
    }

    return this.search(targetEntry.content, {
      ...options,
      // Exclude the target entry itself
    }).then(results => results.filter(r => r.entry.id !== entryId));
  }

  /**
   * Get context-relevant entries for a conversation
   */
  async getRelevantContext(
    currentMessage: string,
    sessionId: string,
    options: {
      maxEntries?: number;
      recencyWeight?: number;
      relevanceWeight?: number;
    } = {}
  ): Promise<MemoryEntry[]> {
    const { maxEntries = 5, recencyWeight = 0.3, relevanceWeight = 0.7 } = options;

    // Get semantic matches
    const semanticResults = await this.search(currentMessage, {
      sessionId,
      limit: maxEntries * 2
    });

    // Get recent entries
    const recentEntries = await this.store.getRecentEntries(sessionId, maxEntries * 2);

    // Combine and score
    const combined = new Map<string, { entry: MemoryEntry; score: number }>();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Add semantic results
    for (const result of semanticResults) {
      combined.set(result.entry.id, {
        entry: result.entry,
        score: result.score * relevanceWeight
      });
    }

    // Add/boost recent entries
    for (let i = 0; i < recentEntries.length; i++) {
      const entry = recentEntries[i];
      const ageInDays = (now - entry.timestamp) / dayMs;
      const recencyScore = Math.exp(-ageInDays / 7) * recencyWeight; // Decay over 7 days

      const existing = combined.get(entry.id);
      if (existing) {
        existing.score += recencyScore;
      } else {
        combined.set(entry.id, {
          entry,
          score: recencyScore
        });
      }
    }

    // Sort and return top entries
    const sorted = Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxEntries);

    return sorted.map(s => s.entry);
  }

  /**
   * Index an entry with its embedding
   */
  async indexEntry(entry: MemoryEntry): Promise<MemoryEntry> {
    if (!entry.embedding) {
      entry.embedding = await this.embed(entry.content);
    }
    return entry;
  }

  /**
   * Batch index entries
   */
  async indexEntries(entries: MemoryEntry[]): Promise<MemoryEntry[]> {
    const textsToEmbed = entries
      .filter(e => !e.embedding)
      .map(e => e.content);

    if (textsToEmbed.length > 0) {
      const embeddings = await this.embeddingProvider.embedBatch(textsToEmbed);
      
      let embedIndex = 0;
      for (const entry of entries) {
        if (!entry.embedding) {
          entry.embedding = embeddings[embedIndex++];
        }
      }
    }

    return entries;
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.embeddingCache.size,
      maxSize: this.maxCacheSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0
    };
  }

  /**
   * Warm up cache with common entries
   */
  async warmCache(sessionId: string, limit: number = 50): Promise<number> {
    const entries = await this.store.getRecentEntries(sessionId, limit);
    let warmed = 0;
    
    for (const entry of entries) {
      if (!entry.embedding) {
        await this.embed(entry.content);
        warmed++;
      }
    }
    
    console.log(`[MemorySearch] Warmed cache with ${warmed} entries`);
    return warmed;
  }

  /**
   * Get embedding provider info
   */
  getProviderInfo(): { name: string; dimensions: number; cacheStats: ReturnType<MemorySearch['getCacheStats']> } {
    return {
      name: this.embeddingProvider.name,
      dimensions: this.embeddingProvider.dimensions,
      cacheStats: this.getCacheStats()
    };
  }

  /**
   * Get BM25 statistics
   */
  getBM25Stats(): { avgDocLength: number; docCount: number } {
    return {
      avgDocLength: this.avgDocLength,
      docCount: this.docLengths.size
    };
  }
}

// Singleton instance
let memorySearchInstance: MemorySearch | null = null;

export function getMemorySearch(embeddingModel?: string, apiKey?: string): MemorySearch {
  if (!memorySearchInstance) {
    memorySearchInstance = new MemorySearch(undefined, embeddingModel, apiKey);
  }
  return memorySearchInstance;
}

export default MemorySearch;
