/**
 * Mirror Knowledge Ingester
 * Fetches code examples from online sources and feeds them into the mirror system
 */

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const https = require('https');
const http = require('http');

class MirrorKnowledgeIngester {
    constructor(opusExamplesPath, mirrorMemory, patternExtractor) {
        this.opusExamplesPath = opusExamplesPath;
        this.mirrorMemory = mirrorMemory;
        this.patternExtractor = patternExtractor;
        this.ingestionHistory = [];
    }

    /**
     * Ingest knowledge from a URL (GitHub, Gist, raw code, etc.)
     */
    async ingestFromURL(url, options = {}) {
        try {
            console.log(`📥 Fetching knowledge from: ${url}`);
            
            // Determine source type
            const sourceType = this.detectSourceType(url);
            
            let content = '';
            let metadata = {
                source: url,
                sourceType,
                fetchedAt: Date.now(),
                ...options.metadata
            };

            switch (sourceType) {
                case 'github_raw':
                    content = await this.fetchGitHubRaw(url);
                    break;
                case 'github_gist':
                    content = await this.fetchGitHubGist(url);
                    break;
                case 'github_repo_file':
                    content = await this.fetchGitHubRepoFile(url);
                    break;
                case 'direct_url':
                    content = await this.fetchDirectURL(url);
                    break;
                default:
                    content = await this.fetchDirectURL(url);
            }

            if (!content || content.trim().length === 0) {
                return { success: false, error: 'No content fetched from URL' };
            }

            // Save to examples directory
            const fileName = this.generateFileName(url, metadata);
            const filePath = path.join(this.opusExamplesPath, fileName);
            await fs.writeFile(filePath, content, 'utf-8');

            // Extract patterns
            const patterns = await this.patternExtractor.extractPatterns(content, {
                ...metadata,
                fileName,
                filePath
            });

            // Store patterns in mirror memory
            for (const category in patterns) {
                for (const pattern of patterns[category]) {
                    await this.mirrorMemory.storePattern({
                        ...pattern,
                        extractedFrom: url,
                        sourceType
                    }, this.mapCategory(category));
                }
            }

            // Record ingestion
            const patternsExtracted = Object.values(patterns).flat().length;
            const ingestion = {
                url,
                sourceType,
                fileName,
                patternsExtracted,
                timestamp: Date.now(),
                success: true
            };
            this.ingestionHistory.push(ingestion);

            console.log(`✅ Ingested ${patternsExtracted} patterns from ${url}`);

            // UPDATE INTELLIGENCE METRICS based on ingested patterns
            if (patternsExtracted > 0 && this.mirrorMemory) {
                try {
                    const currentMetrics = await this.mirrorMemory.getIntelligenceMetrics();
                    const currentIntelligence = currentMetrics.currentIntelligence || 1.0;
                    
                    // Calculate intelligence growth from ingestion
                    const complexity = Math.min(1.0, content.length / 10000);
                    const variety = Math.min(1.0, Object.keys(patterns).filter(k => patterns[k].length > 0).length / 4);
                    const Q = (complexity + variety) / 2;
                    const R = 0.3;
                    const E = Math.min(1.0, patternsExtracted / 20);
                    
                    const growth = (Q / R) * E;
                    const newIntelligence = currentIntelligence + growth;
                    
                    await this.mirrorMemory.updateIntelligenceMetrics({
                        currentIntelligence: newIntelligence,
                        Q: Math.max(currentMetrics.Q || 0, Q),
                        E: Math.max(currentMetrics.E || 0, E),
                        lastIngestion: Date.now()
                    });
                    
                    console.log(`🧠 Intelligence growth: ${currentIntelligence.toFixed(2)} → ${newIntelligence.toFixed(2)} (+${growth.toFixed(3)})`);
                } catch (err) {
                    console.warn('Could not update intelligence metrics:', err.message);
                }
            }

            return {
                success: true,
                fileName,
                patternsExtracted,
                patterns: Object.keys(patterns).reduce((acc, key) => {
                    acc[key] = patterns[key].length;
                    return acc;
                }, {})
            };

        } catch (error) {
            console.error(`❌ Error ingesting from ${url}:`, error.message);
            return {
                success: false,
                error: error.message,
                url
            };
        }
    }

    /**
     * Ingest from GitHub raw file
     */
    async fetchGitHubRaw(url) {
        // Convert GitHub URL to raw URL if needed
        let rawUrl = url;
        if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
            rawUrl = url
                .replace('github.com', 'raw.githubusercontent.com')
                .replace('/blob/', '/');
        }

        const response = await axios.get(rawUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'AgentPrime-MirrorSystem/1.0'
            }
        });

        return response.data;
    }

    /**
     * Fetch from GitHub Gist
     */
    async fetchGitHubGist(url) {
        // Extract Gist ID
        const gistId = url.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/)?.[1];
        if (!gistId) {
            throw new Error('Invalid GitHub Gist URL');
        }

        // Fetch Gist API
        const apiUrl = `https://api.github.com/gists/${gistId}`;
        const response = await axios.get(apiUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'AgentPrime-MirrorSystem/1.0',
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        // Combine all files in the gist
        const files = response.data.files;
        let combinedContent = '';
        
        for (const fileName in files) {
            const file = files[fileName];
            if (file.content) {
                combinedContent += `\n// === File: ${fileName} ===\n\n`;
                combinedContent += file.content;
                combinedContent += '\n\n';
            }
        }

        return combinedContent;
    }

    /**
     * Fetch from GitHub repository file
     */
    async fetchGitHubRepoFile(url) {
        // Convert to API URL
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/);
        if (!match) {
            throw new Error('Invalid GitHub repository file URL');
        }

        const [, owner, repo, branch, filePath] = match;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
        
        const response = await axios.get(apiUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'AgentPrime-MirrorSystem/1.0',
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        // Decode base64 content
        if (response.data.content) {
            return Buffer.from(response.data.content, 'base64').toString('utf-8');
        }

        throw new Error('No content in GitHub file');
    }

    /**
     * Fetch from direct URL
     */
    async fetchDirectURL(url) {
        const response = await axios.get(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'AgentPrime-MirrorSystem/1.0'
            }
        });

        return response.data;
    }

    /**
     * Detect source type from URL
     */
    detectSourceType(url) {
        if (url.includes('raw.githubusercontent.com') || (url.includes('github.com') && url.includes('/blob/'))) {
            return 'github_raw';
        }
        if (url.includes('gist.github.com')) {
            return 'github_gist';
        }
        if (url.includes('github.com') && url.includes('/blob/')) {
            return 'github_repo_file';
        }
        return 'direct_url';
    }

    /**
     * Generate filename from URL
     */
    generateFileName(url, metadata) {
        // Extract meaningful name from URL
        let name = 'example';
        
        if (url.includes('github.com')) {
            const match = url.match(/\/([^\/]+)\/([^\/]+)\/(?:blob\/[^\/]+\/)?(.+)/);
            if (match) {
                const [, owner, repo, filePath] = match;
                const fileName = path.basename(filePath) || 'example';
                name = `${owner}_${repo}_${fileName}`;
            }
        } else if (url.includes('gist.github.com')) {
            const gistId = url.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/)?.[1];
            if (gistId) {
                name = `gist_${gistId}`;
            }
        } else {
            // Use domain and path
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                name = `${urlObj.hostname}_${pathParts.join('_')}`.replace(/[^a-zA-Z0-9_]/g, '_');
            } catch {
                name = `example_${Date.now()}`;
            }
        }

        // Add extension if missing
        if (!path.extname(name)) {
            name += '.txt';
        }

        // Ensure unique filename
        const timestamp = Date.now();
        const ext = path.extname(name);
        const base = path.basename(name, ext);
        return `${base}_${timestamp}${ext}`;
    }

    /**
     * Map pattern category
     */
    mapCategory(category) {
        const mapping = {
            codeStructure: 'architectural',
            problemSolving: 'problemSolving',
            reasoning: 'reasoning',
            style: 'style',
            promptInterpretation: 'reasoning'
        };
        return mapping[category] || 'architectural';
    }

    /**
     * Ingest from multiple URLs
     */
    async ingestFromURLs(urls, options = {}) {
        const results = [];
        
        for (const url of urls) {
            const result = await this.ingestFromURL(url, options);
            results.push(result);
            
            // Add delay between requests to be respectful
            if (urls.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return {
            success: true,
            total: urls.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Ingest from text/code content directly
     */
    async ingestFromContent(content, metadata = {}) {
        try {
            if (!content || content.trim().length === 0) {
                return { success: false, error: 'Empty content' };
            }

            // Save to examples directory
            const fileName = `direct_${Date.now()}.txt`;
            const filePath = path.join(this.opusExamplesPath, fileName);
            await fs.writeFile(filePath, content, 'utf-8');

            // Extract patterns
            const patterns = await this.patternExtractor.extractPatterns(content, {
                ...metadata,
                fileName,
                filePath,
                source: 'direct_input'
            });

            // Store patterns
            for (const category in patterns) {
                for (const pattern of patterns[category]) {
                    await this.mirrorMemory.storePattern({
                        ...pattern,
                        extractedFrom: 'direct_input',
                        sourceType: 'direct'
                    }, this.mapCategory(category));
                }
            }

            const patternsExtracted = Object.values(patterns).flat().length;

            // UPDATE INTELLIGENCE METRICS based on ingested patterns
            // More patterns = more experience, complex patterns = higher quality
            if (patternsExtracted > 0 && this.mirrorMemory) {
                try {
                    const currentMetrics = await this.mirrorMemory.getIntelligenceMetrics();
                    const currentIntelligence = currentMetrics.currentIntelligence || 1.0;
                    
                    // Calculate intelligence growth from ingestion
                    // Q = pattern complexity (estimate from code length and variety)
                    const complexity = Math.min(1.0, content.length / 10000); // Longer = more complex
                    const variety = Math.min(1.0, Object.keys(patterns).filter(k => patterns[k].length > 0).length / 4);
                    const Q = (complexity + variety) / 2;
                    
                    // R = resistance (lower when patterns are novel)
                    const R = 0.3; // Default resistance for new patterns
                    
                    // E = experience (based on pattern count)
                    const E = Math.min(1.0, patternsExtracted / 20);
                    
                    // I(n+1) = I(n) + (Q/R) × E
                    const growth = (Q / R) * E;
                    const newIntelligence = currentIntelligence + growth;
                    
                    await this.mirrorMemory.updateIntelligenceMetrics({
                        currentIntelligence: newIntelligence,
                        Q: Math.max(currentMetrics.Q || 0, Q),
                        E: Math.max(currentMetrics.E || 0, E),
                        lastIngestion: Date.now()
                    });
                    
                    console.log(`🧠 Intelligence growth: ${currentIntelligence.toFixed(2)} → ${newIntelligence.toFixed(2)} (+${growth.toFixed(3)})`);
                } catch (err) {
                    console.warn('Could not update intelligence metrics:', err.message);
                }
            }

            return {
                success: true,
                fileName,
                patternsExtracted,
                patterns: Object.keys(patterns).reduce((acc, key) => {
                    acc[key] = patterns[key].length;
                    return acc;
                }, {})
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Ingest from clipboard or pasted content
     */
    async ingestFromPaste(content, source = 'paste') {
        return await this.ingestFromContent(content, {
            source,
            ingestedAt: Date.now()
        });
    }

    /**
     * Get ingestion history
     */
    getIngestionHistory(limit = 50) {
        return this.ingestionHistory.slice(-limit);
    }

    /**
     * Search for code examples online (using web search)
     */
    async searchAndIngest(query, options = {}) {
        // This would integrate with a web search API
        // For now, return instructions
        return {
            success: false,
            message: 'Web search integration not yet implemented. Please provide direct URLs.',
            suggestion: 'You can ingest from: GitHub URLs, Gist URLs, or direct code URLs'
        };
    }
}

module.exports = MirrorKnowledgeIngester;
