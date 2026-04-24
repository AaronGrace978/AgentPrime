/**
 * Reference Example Loader - Smart pattern loading with manifest-based matching
 * 
 * This replaces the basic filename-matching with rich metadata matching:
 * 1. Uses manifest.json for tags, categories, quality scores
 * 2. Falls back to content scanning for unindexed files
 * 3. Prioritizes high-quality examples
 */

import * as fs from 'fs';
import * as path from 'path';

interface OpusExample {
  file: string;
  title?: string;
  tags: string[];
  category: string;
  language: string;
  quality: number;
  description: string;
}

interface OpusManifest {
  version: string;
  examples: OpusExample[];
  tagIndex: Record<string, string[]>;
  categories: Record<string, string[]>;
}

// Cache manifest in memory
let cachedManifest: OpusManifest | null = null;
let manifestLoadTime = 0;
const MANIFEST_CACHE_TTL = 60000; // 1 minute
const MIN_MANIFEST_RELEVANCE_SCORE = 2;
const MAX_EXAMPLE_SNIPPET_CHARS = 1400;

export function normalizeRetrievalTask(task: string): string {
  return task
    .split(/\n## IDE_CONTEXT\b/i)[0]
    .split(/\n<!--\s*IDE_CONTEXT/i)[0]
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatchesText(text: string, keyword: string): boolean {
  const parts = keyword
    .trim()
    .toLowerCase()
    .split(/[-\s]+/)
    .filter(Boolean)
    .map(escapeRegExp);
  if (parts.length === 0) return false;

  const pattern = parts.join('[-\\s]+');
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'i').test(text);
}

/**
 * Find the opus-examples directory
 */
function findOpusPath(): string | null {
  const possiblePaths = [
    path.join(process.cwd(), 'data', 'opus-examples'),
    path.join(__dirname, '..', '..', '..', 'data', 'opus-examples'),
    path.join(__dirname, '..', '..', 'data', 'opus-examples'),
    'G:\\AgentPrime\\data\\opus-examples'
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  return null;
}

/**
 * Load the manifest (with caching)
 */
function loadManifest(opusPath: string): OpusManifest | null {
  // Check cache
  if (cachedManifest && Date.now() - manifestLoadTime < MANIFEST_CACHE_TTL) {
    return cachedManifest;
  }
  
  const manifestPath = path.join(opusPath, 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.log('[ReferenceLoader] No manifest.json found, will use content scanning');
    return null;
  }
  
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    cachedManifest = JSON.parse(content);
    manifestLoadTime = Date.now();
    console.log(`[ReferenceLoader] Loaded manifest with ${cachedManifest?.examples?.length || 0} examples`);
    return cachedManifest;
  } catch (error) {
    console.warn('[ReferenceLoader] Failed to parse manifest:', error);
    return null;
  }
}

/**
 * Extract keywords from a task description
 */
export function extractTaskKeywords(task: string): string[] {
  const taskLower = normalizeRetrievalTask(task).toLowerCase();
  
  // Common keywords to look for
  const keywords: string[] = [];
  
  // Technology keywords
  if (taskLower.includes('react')) keywords.push('react');
  if (taskLower.includes('vue')) keywords.push('vue');
  if (taskLower.includes('angular')) keywords.push('angular');
  if (taskLower.includes('node')) keywords.push('node');
  if (taskLower.includes('express')) keywords.push('express');
  if (taskLower.includes('fastapi')) keywords.push('fastapi');
  if (taskLower.includes('python')) keywords.push('python');
  if (taskLower.includes('typescript') || taskLower.includes(' ts ')) keywords.push('typescript');
  if (taskLower.includes('three.js') || taskLower.includes('threejs') || taskLower.includes('webgl')) keywords.push('threejs');
  if (/\b(?:website|site|landing page|homepage|marketing page|splash page)\b/.test(taskLower)) {
    keywords.push('website', 'landing-page', 'marketing');
  }
  const mentionsElectron = taskLower.includes('electron');
  const excludesElectron = /\b(?:not|no|without)\s+electron\b/.test(taskLower);
  if (mentionsElectron && !excludesElectron) keywords.push('electron');
  if (taskLower.includes('api')) keywords.push('api');
  if (taskLower.includes('game')) keywords.push('game');
  if (taskLower.includes('phaser')) keywords.push('phaser');
  if (taskLower.includes('canvas')) keywords.push('canvas');
  
  // Pattern keywords
  if (taskLower.includes('error') || taskLower.includes('exception')) keywords.push('error-handling');
  if (taskLower.includes('retry') || taskLower.includes('resilient')) keywords.push('retry', 'resilience');
  if (/\bhooks?\b/.test(taskLower)) keywords.push('hooks');
  if (/\bagents?\b|\bagentic\b/.test(taskLower) || /\btool(?:s|-calling)?\b/.test(taskLower)) {
    keywords.push('agent', 'tool-calling');
  }
  if (taskLower.includes('ipc')) keywords.push('ipc');
  if (taskLower.includes('mirror') || taskLower.includes('learn')) keywords.push('mirror', 'learning');
  if (taskLower.includes('architecture') || taskLower.includes('design')) keywords.push('architecture');
  if (taskLower.includes('async') || taskLower.includes('await')) keywords.push('async');
  if (taskLower.includes('state')) keywords.push('state-management');
  if (taskLower.includes('microservice')) keywords.push('microservices');
  if (taskLower.includes('circuit')) keywords.push('circuit-breaker');
  if (taskLower.includes('fallback')) keywords.push('fallback');
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Score an example against task keywords using manifest metadata
 */
function scoreExampleWithManifest(example: OpusExample, keywords: string[]): number {
  let relevanceScore = 0;
  
  // Tag matching (high value)
  for (const keyword of keywords) {
    if (example.tags.includes(keyword)) {
      relevanceScore += 3;
    }
  }
  
  // Category matching
  for (const keyword of keywords) {
    if (keywordMatchesText(example.category, keyword)) {
      relevanceScore += 2;
    }
  }
  
  // Description matching
  const descLower = (example.description || '').toLowerCase();
  for (const keyword of keywords) {
    if (keywordMatchesText(descLower, keyword)) {
      relevanceScore += 1;
    }
  }
  
  // Title matching
  const titleLower = (example.title || '').toLowerCase();
  for (const keyword of keywords) {
    if (keywordMatchesText(titleLower, keyword)) {
      relevanceScore += 2;
    }
  }
  
  if (keywords.length === 0) {
    return 0;
  }

  // Quality is a tiebreaker for actual task matches, not proof of relevance.
  return relevanceScore > 0 ? relevanceScore + example.quality * 0.5 : 0;
}

/**
 * Score by scanning file content (fallback when no manifest)
 */
function scoreExampleByContent(filePath: string, keywords: string[]): number {
  try {
    const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000).toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      if (keywordMatchesText(content, keyword)) {
        score += 1;
      }
    }
    
    // Bonus for ingested files (they're curated)
    if (filePath.includes('ingested')) {
      score += 1;
    }
    
    return score;
  } catch (e) {
    return 0;
  }
}

/**
 * Load relevant opus examples for a task
 * 
 * This is the main export - use this in specialists and agent loop
 */
export async function loadOpusExamples(task: string, limit: number = 3): Promise<string[]> {
  const examples: string[] = [];
  
  try {
    const opusPath = findOpusPath();
    if (!opusPath) {
      console.log('[ReferenceLoader] No reference examples directory found');
      return examples;
    }
    
    console.log(`[ReferenceLoader] Loading examples for task: "${normalizeRetrievalTask(task).substring(0, 50)}..."`);
    
    const manifest = loadManifest(opusPath);
    const keywords = extractTaskKeywords(task);
    
    console.log(`[ReferenceLoader] Extracted keywords: ${keywords.join(', ')}`);
    
    let scoredFiles: { file: string; score: number; snippet?: string }[];
    
    if (manifest && manifest.examples.length > 0) {
      // Use manifest-based scoring
      scoredFiles = manifest.examples
        .filter(ex => !ex.file.includes('github_')) // Skip GitHub HTML files
        .map(ex => ({
          file: ex.file,
          score: scoreExampleWithManifest(ex, keywords),
          description: ex.description
        }))
        .filter(s => s.score >= MIN_MANIFEST_RELEVANCE_SCORE)
        .sort((a, b) => b.score - a.score);
      
      console.log(`[ReferenceLoader] Manifest scoring: ${scoredFiles.length} relevant matches`);
    } else {
      // Fallback to content scanning
      const files = fs.readdirSync(opusPath)
        .filter(f => (f.endsWith('.js') || f.endsWith('.txt')) && !f.includes('github_') && f !== 'manifest.json');
      
      scoredFiles = files.map(file => ({
        file,
        score: scoreExampleByContent(path.join(opusPath, file), keywords)
      }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
      
      console.log(`[ReferenceLoader] Content scanning: ${scoredFiles.length} relevant matches`);
    }
    
    // Load top matches - ENHANCED: Return more complete examples for better mirroring
    for (const { file, score } of scoredFiles.slice(0, limit)) {
      try {
        const filePath = path.join(opusPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Keep examples compact so retrieved context guides the plan without drowning out the task.
        let snippet = content.substring(0, MAX_EXAMPLE_SNIPPET_CHARS).trim();
        const lastNewline = snippet.lastIndexOf('\n');
        if (lastNewline > 800) {
          snippet = snippet.substring(0, lastNewline);
        }
        
        if (snippet.length > 50) {
          // Find title from manifest or first line
          const manifestEntry = manifest?.examples.find(e => e.file === file);
          const title = manifestEntry?.title || file.replace(/\.(js|txt)$/, '');
          
          console.log(`[ReferenceLoader] Selected example: ${title} (${file}, score=${score.toFixed(1)})`);
          examples.push(`\n### Reference Example: ${title} (relevance: ${score.toFixed(1)})\n` +
                       `Use this as a compact quality reference only where it fits the user's task:\n\n` +
                       `${snippet}\n` +
                       `\n--- End of Reference Example ---\n`);
        }
      } catch (e) {
        // Skip unreadable files
      }
    }
    
    console.log(`[ReferenceLoader] Loaded ${examples.length} relevant examples`);
    
  } catch (error) {
    console.warn('[ReferenceLoader] Error loading examples:', error);
  }
  
  return examples;
}

/**
 * Get examples by specific category
 */
export async function getExamplesByCategory(category: string, limit: number = 3): Promise<string[]> {
  const opusPath = findOpusPath();
  if (!opusPath) return [];
  
  const manifest = loadManifest(opusPath);
  if (!manifest) return [];
  
  const categoryFiles = manifest.categories[category] || [];
  const examples: string[] = [];
  
  for (const file of categoryFiles.slice(0, limit)) {
    try {
      const content = fs.readFileSync(path.join(opusPath, file), 'utf8');
      const snippet = content.substring(0, 600).trim();
      if (snippet.length > 50) {
        examples.push(snippet);
      }
    } catch (e) {
      // Skip
    }
  }
  
  return examples;
}

/**
 * Get examples by specific tag
 */
export async function getExamplesByTag(tag: string, limit: number = 3): Promise<string[]> {
  const opusPath = findOpusPath();
  if (!opusPath) return [];
  
  const manifest = loadManifest(opusPath);
  if (!manifest) return [];
  
  const tagFiles = manifest.tagIndex[tag] || [];
  const examples: string[] = [];
  
  for (const file of tagFiles.slice(0, limit)) {
    try {
      const content = fs.readFileSync(path.join(opusPath, file), 'utf8');
      const snippet = content.substring(0, 600).trim();
      if (snippet.length > 50) {
        examples.push(snippet);
      }
    } catch (e) {
      // Skip
    }
  }
  
  return examples;
}

/**
 * List all available tags
 */
export function getAvailableTags(): string[] {
  const opusPath = findOpusPath();
  if (!opusPath) return [];
  
  const manifest = loadManifest(opusPath);
  if (!manifest) return [];
  
  return Object.keys(manifest.tagIndex).filter(tag => manifest.tagIndex[tag].length > 0);
}

/**
 * List all available categories
 */
export function getAvailableCategories(): string[] {
  const opusPath = findOpusPath();
  if (!opusPath) return [];
  
  const manifest = loadManifest(opusPath);
  if (!manifest) return [];
  
  return Object.keys(manifest.categories).filter(cat => manifest.categories[cat].length > 0);
}

export { findOpusPath, loadManifest };

