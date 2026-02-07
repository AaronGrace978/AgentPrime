/**
 * Web Search Tool - Search the web for information
 * Supports Tavily API (recommended), Brave Search API, and DuckDuckGo fallback
 */

import { BaseTool, ToolParameter } from './base-tool';
import axios from 'axios';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

interface WebSearchResponse {
  results: SearchResult[];
  query: string;
  totalResults: number;
  answer?: string; // Direct answer from Tavily
  cached?: boolean;
}

// Simple in-memory cache for search results
interface CacheEntry {
  response: WebSearchResponse;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class WebSearchTool extends BaseTool {
  private tavilyApiKey: string | null = null;
  private braveApiKey: string | null = null;

  constructor(tavilyApiKey?: string, braveApiKey?: string) {
    super(
      'web_search',
      'Search the web for information. Returns titles, URLs, and snippets from search results.',
      {
        query: {
          type: 'string',
          required: true,
          description: 'The search query to look up'
        },
        maxResults: {
          type: 'number',
          required: false,
          description: 'Maximum number of results to return (default: 5)'
        }
      }
    );
    this.tavilyApiKey = tavilyApiKey || process.env.TAVILY_API_KEY || null;
    this.braveApiKey = braveApiKey || process.env.BRAVE_API_KEY || null;
  }

  /**
   * Configure API keys dynamically
   */
  setApiKeys(tavilyKey?: string, braveKey?: string): void {
    if (tavilyKey) this.tavilyApiKey = tavilyKey;
    if (braveKey) this.braveApiKey = braveKey;
  }

  async execute(args: { query: string; maxResults?: number }): Promise<WebSearchResponse> {
    const { query, maxResults = 5 } = args;
    const cacheKey = `${query.toLowerCase().trim()}:${maxResults}`;
    
    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[WebSearch] Cache hit for: "${query}"`);
      return { ...cached.response, cached: true };
    }

    console.log(`[WebSearch] Searching for: "${query}"`);
    const startTime = Date.now();

    try {
      let response: WebSearchResponse;

      // Priority 1: Tavily API (fastest, most reliable for AI)
      if (this.tavilyApiKey) {
        try {
          response = await this.searchTavily(query, maxResults);
          if (response.results.length > 0) {
            console.log(`[WebSearch] Tavily returned ${response.results.length} results in ${Date.now() - startTime}ms`);
            searchCache.set(cacheKey, { response, timestamp: Date.now() });
            return response;
          }
        } catch (e: any) {
          console.warn('[WebSearch] Tavily failed:', e.message);
        }
      }

      // Priority 2: Brave Search API
      if (this.braveApiKey) {
        try {
          response = await this.searchBrave(query, maxResults);
          if (response.results.length > 0) {
            console.log(`[WebSearch] Brave returned ${response.results.length} results in ${Date.now() - startTime}ms`);
            searchCache.set(cacheKey, { response, timestamp: Date.now() });
            return response;
          }
        } catch (e: any) {
          console.warn('[WebSearch] Brave failed:', e.message);
        }
      }

      // Priority 3: DuckDuckGo scraping (free fallback)
      try {
        const scrapedResults = await this.scrapeDuckDuckGo(query, maxResults);
        if (scrapedResults.results.length > 0) {
          console.log(`[WebSearch] DuckDuckGo returned ${scrapedResults.results.length} results in ${Date.now() - startTime}ms`);
          searchCache.set(cacheKey, { response: scrapedResults, timestamp: Date.now() });
          return scrapedResults;
        }
      } catch (e: any) {
        console.warn('[WebSearch] DuckDuckGo scrape failed:', e.message);
      }

      // Priority 4: DuckDuckGo Instant Answer API
      try {
        const ddgResults = await this.searchDuckDuckGo(query, maxResults);
        if (ddgResults.results.length > 0) {
          searchCache.set(cacheKey, { response: ddgResults, timestamp: Date.now() });
          return ddgResults;
        }
      } catch (e: any) {
        console.warn('[WebSearch] DuckDuckGo API failed:', e.message);
      }

      // If all else fails, return a helpful message
      console.log('[WebSearch] No results found from any source');
      return {
        results: [{
          title: 'Search completed',
          url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          snippet: `No direct results found for "${query}". Try rephrasing the query or searching manually.`
        }],
        query,
        totalResults: 0
      };

    } catch (error: any) {
      console.error('[WebSearch] Error:', error.message);
      return {
        results: [{
          title: 'Search Error',
          url: '',
          snippet: `Failed to search: ${error.message}. The web search service may be temporarily unavailable.`
        }],
        query,
        totalResults: 0
      };
    }
  }

  /**
   * Search using Tavily API - Optimized for AI agents
   * Docs: https://docs.tavily.com/
   */
  private async searchTavily(query: string, maxResults: number): Promise<WebSearchResponse> {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: this.tavilyApiKey,
      query,
      search_depth: 'basic', // 'basic' is faster, 'advanced' for deeper results
      include_answer: true,  // Get a direct AI-generated answer
      include_raw_content: false,
      max_results: maxResults,
      include_domains: [],
      exclude_domains: []
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    const data = response.data;
    const results: SearchResult[] = (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
      score: r.score
    }));

    return {
      results,
      query,
      totalResults: results.length,
      answer: data.answer // Tavily provides a direct answer!
    };
  }

  /**
   * Search using Brave Search API
   * Docs: https://brave.com/search/api/
   */
  private async searchBrave(query: string, maxResults: number): Promise<WebSearchResponse> {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: {
        q: query,
        count: maxResults,
        text_decorations: false,
        spellcheck: true
      },
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': this.braveApiKey
      },
      timeout: 10000
    });

    const data = response.data;
    const webResults = data.web?.results || [];
    
    const results: SearchResult[] = webResults.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || ''
    }));

    return {
      results,
      query,
      totalResults: results.length
    };
  }

  /**
   * Scrape DuckDuckGo HTML - primary search method
   */
  private async scrapeDuckDuckGo(query: string, maxResults: number): Promise<WebSearchResponse> {
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      timeout: 15000
    });

    const html = response.data;
    const results: SearchResult[] = [];

    // Strategy 1: Parse result__a links with result__snippet
    const resultBlocks = html.split(/class="result\s/);
    for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
      const block = resultBlocks[i];
      
      // Extract URL from result__a or result__url
      const urlMatch = block.match(/href="([^"]+)"[^>]*class="result__a"/i) ||
                       block.match(/class="result__a"[^>]*href="([^"]+)"/i) ||
                       block.match(/href="(\/\/duckduckgo\.com\/l\/[^"]+)"/i);
      
      // Extract title
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</i) ||
                         block.match(/>([^<]{10,100})<\/a>/);
      
      // Extract snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)/i) ||
                           block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      
      if (urlMatch && titleMatch) {
        let url = urlMatch[1];
        url = this.decodeDDGUrl(url);
        
        // Skip DuckDuckGo internal links
        if (url.includes('duckduckgo.com/y.js') || url.startsWith('javascript:')) {
          continue;
        }
        
        const title = this.decodeHtml(titleMatch[1].trim());
        let snippet = snippetMatch ? this.decodeHtml(snippetMatch[1].replace(/<[^>]+>/g, '').trim()) : '';
        
        // Skip very short or empty results
        if (title.length < 3) continue;
        
        results.push({ title, url, snippet });
      }
    }

    // Strategy 2: Alternative regex patterns if Strategy 1 failed
    if (results.length === 0) {
      // Look for links with uddg parameter (DuckDuckGo redirect)
      const uddgRegex = /href="[^"]*uddg=([^&"]+)[^"]*"[^>]*>([^<]+)<\/a>/gi;
      let match;
      while ((match = uddgRegex.exec(html)) !== null && results.length < maxResults) {
        const url = decodeURIComponent(match[1]);
        const title = this.decodeHtml(match[2].trim());
        
        if (title.length > 5 && !url.includes('duckduckgo.com')) {
          results.push({
            title,
            url,
            snippet: ''
          });
        }
      }
    }

    // Strategy 3: Extract from web-result divs
    if (results.length === 0) {
      const webResultRegex = /<div class="web-result"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi;
      let match;
      while ((match = webResultRegex.exec(html)) !== null && results.length < maxResults) {
        const url = this.decodeDDGUrl(match[1]);
        results.push({
          title: url.replace(/https?:\/\/(www\.)?/, '').split('/')[0],
          url,
          snippet: 'Visit this link for more information.'
        });
      }
    }

    console.log(`[WebSearch] DuckDuckGo scrape returned ${results.length} results`);
    return {
      results,
      query,
      totalResults: results.length
    };
  }

  /**
   * Search using DuckDuckGo Instant Answer API (fallback)
   */
  private async searchDuckDuckGo(query: string, maxResults: number): Promise<WebSearchResponse> {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      },
      timeout: 10000
    });

    const data = response.data;
    const results: SearchResult[] = [];

    // Abstract (main result)
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        snippet: data.Abstract
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
            url: topic.FirstURL,
            snippet: topic.Text
          });
        }
        // Handle nested topics
        if (topic.Topics) {
          for (const subtopic of topic.Topics.slice(0, 2)) {
            if (subtopic.Text && subtopic.FirstURL && results.length < maxResults) {
              results.push({
                title: subtopic.Text.split(' - ')[0] || subtopic.Text.substring(0, 60),
                url: subtopic.FirstURL,
                snippet: subtopic.Text
              });
            }
          }
        }
      }
    }

    // Infobox
    if (data.Infobox?.content) {
      for (const item of data.Infobox.content.slice(0, 3)) {
        if (item.label && item.value) {
          results.push({
            title: item.label,
            url: data.AbstractURL || '',
            snippet: `${item.label}: ${item.value}`
          });
        }
      }
    }

    console.log(`[WebSearch] DuckDuckGo API returned ${results.length} results`);
    return {
      results: results.slice(0, maxResults),
      query,
      totalResults: results.length
    };
  }

  /**
   * Decode DuckDuckGo redirect URLs
   */
  private decodeDDGUrl(url: string): string {
    if (url.includes('uddg=')) {
      const match = url.match(/uddg=([^&]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
    return url;
  }

  /**
   * Decode HTML entities
   */
  private decodeHtml(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}

/**
 * Web Fetch Tool - Fetch and extract content from a URL
 */
export class WebFetchTool extends BaseTool {
  constructor() {
    super(
      'web_fetch',
      'Fetch content from a URL and extract the main text. Useful for reading articles, documentation, etc.',
      {
        url: {
          type: 'string',
          required: true,
          description: 'The URL to fetch content from'
        },
        selector: {
          type: 'string',
          required: false,
          description: 'CSS selector to extract specific content (optional)'
        }
      }
    );
  }

  async execute(args: { url: string; selector?: string }): Promise<{ content: string; title: string; url: string }> {
    const { url } = args;
    console.log(`[WebFetch] Fetching: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000,
        maxRedirects: 5
      });

      const html = response.data;
      
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? this.decodeHtml(titleMatch[1].trim()) : 'Untitled';

      // Extract main content (remove scripts, styles, nav, etc.)
      let content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      // Try to find main content areas
      const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                       content.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                       content.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      
      if (mainMatch) {
        content = mainMatch[1];
      }

      // Strip remaining HTML tags and clean up
      content = content
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      // Limit content length
      if (content.length > 10000) {
        content = content.substring(0, 10000) + '... [truncated]';
      }

      console.log(`[WebFetch] Extracted ${content.length} characters from ${url}`);
      return { content, title, url };

    } catch (error: any) {
      console.error('[WebFetch] Error:', error.message);
      return {
        content: `Error fetching URL: ${error.message}`,
        title: 'Error',
        url
      };
    }
  }

  private decodeHtml(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}

