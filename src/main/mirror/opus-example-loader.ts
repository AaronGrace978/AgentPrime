/**
 * Opus Example Loader - Smart pattern loading with manifest-based matching
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
    console.log('[OpusLoader] No manifest.json found, will use content scanning');
    return null;
  }
  
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    cachedManifest = JSON.parse(content);
    manifestLoadTime = Date.now();
    console.log(`[OpusLoader] Loaded manifest with ${cachedManifest?.examples?.length || 0} examples`);
    return cachedManifest;
  } catch (error) {
    console.warn('[OpusLoader] Failed to parse manifest:', error);
    return null;
  }
}

/**
 * Extract keywords from a task description
 */
function extractTaskKeywords(task: string): string[] {
  const taskLower = task.toLowerCase();
  
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
  if (taskLower.includes('electron')) keywords.push('electron');
  if (taskLower.includes('api')) keywords.push('api');
  if (taskLower.includes('game')) keywords.push('game');
  if (taskLower.includes('phaser')) keywords.push('phaser');
  if (taskLower.includes('canvas')) keywords.push('canvas');
  
  // Pattern keywords
  if (taskLower.includes('error') || taskLower.includes('exception')) keywords.push('error-handling');
  if (taskLower.includes('retry') || taskLower.includes('resilient')) keywords.push('retry', 'resilience');
  if (taskLower.includes('hook')) keywords.push('hooks');
  if (taskLower.includes('agent') || taskLower.includes('tool')) keywords.push('agent', 'tool-calling');
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
  let score = 0;
  
  // Tag matching (high value)
  for (const keyword of keywords) {
    if (example.tags.includes(keyword)) {
      score += 3;
    }
  }
  
  // Category matching
  for (const keyword of keywords) {
    if (example.category.includes(keyword)) {
      score += 2;
    }
  }
  
  // Description matching
  const descLower = (example.description || '').toLowerCase();
  for (const keyword of keywords) {
    if (descLower.includes(keyword)) {
      score += 1;
    }
  }
  
  // Quality bonus
  score += example.quality * 0.5;
  
  // Title matching
  const titleLower = (example.title || '').toLowerCase();
  for (const keyword of keywords) {
    if (titleLower.includes(keyword)) {
      score += 2;
    }
  }
  
  return score;
}

/**
 * Score by scanning file content (fallback when no manifest)
 */
function scoreExampleByContent(filePath: string, keywords: string[]): number {
  try {
    const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000).toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      // Count occurrences (up to 3 per keyword)
      const matches = (content.match(new RegExp(keyword, 'g')) || []).length;
      score += Math.min(matches, 3);
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
      console.log('[OpusLoader] No opus-examples directory found');
      return examples;
    }
    
    console.log(`[OpusLoader] Loading examples for task: "${task.substring(0, 50)}..."`);
    
    const manifest = loadManifest(opusPath);
    const keywords = extractTaskKeywords(task);
    
    console.log(`[OpusLoader] Extracted keywords: ${keywords.join(', ')}`);
    
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
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score);
      
      console.log(`[OpusLoader] Manifest scoring: ${scoredFiles.length} relevant matches`);
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
      
      console.log(`[OpusLoader] Content scanning: ${scoredFiles.length} relevant matches`);
    }
    
    // Load top matches - ENHANCED: Return more complete examples for better mirroring
    for (const { file, score } of scoredFiles.slice(0, limit)) {
      try {
        const filePath = path.join(opusPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // ENHANCED: Return more complete examples (up to 2000 chars) for better mirroring
        // This gives models more context to understand Opus's full approach
        let snippet = content.substring(0, 2000).trim(); // Increased from 800 to 2000
        const lastNewline = snippet.lastIndexOf('\n');
        if (lastNewline > 1000) {
          snippet = snippet.substring(0, lastNewline);
        }
        
        if (snippet.length > 50) {
          // Find title from manifest or first line
          const manifestEntry = manifest?.examples.find(e => e.file === file);
          const title = manifestEntry?.title || file.replace(/\.(js|txt)$/, '');
          
          // ENHANCED: More prominent formatting to emphasize Opus quality
          examples.push(`\n### 🎯 OPUS EXAMPLE: ${title} (relevance: ${score.toFixed(1)})\n` +
                       `This is REAL code from Claude Opus. Study every detail and mirror this exact approach:\n\n` +
                       `${snippet}\n` +
                       `\n--- End of Opus Example ---\n`);
        }
      } catch (e) {
        // Skip unreadable files
      }
    }
    
    console.log(`[OpusLoader] ✅ Loaded ${examples.length} relevant examples`);
    
  } catch (error) {
    console.warn('[OpusLoader] Error loading examples:', error);
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

