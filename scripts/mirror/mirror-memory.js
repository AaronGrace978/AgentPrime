/**
 * Opus Mirror Memory System
 * Stores and retrieves learned patterns with temporal awareness
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class MirrorMemory extends EventEmitter {
    constructor(memoryPath) {
        super();
        this.memoryPath = memoryPath || path.join(__dirname, 'data', 'mirror-memory.json');
        this.memory = {
            version: '1.0',
            lastUpdated: null,
            patterns: {
                architectural: [],
                problemSolving: [],
                reasoning: [],
                style: []
            },
            feedbackLoops: [],
            intelligenceMetrics: {
                Q: 0.75,  // Question quality (0-1)
                R: 0.30,  // Resistance (lower is better, 0-1)
                E: 0.60,  // Experience diversity (0-1)
                currentIntelligence: 1.0,
                growthRate: 0.0
            },
            adaptationHistory: []
        };
    }

    /**
     * Load memory from disk
     */
    async load() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.memoryPath);
            await fs.mkdir(dir, { recursive: true });

            // Try to load existing memory
            if (await this.fileExists(this.memoryPath)) {
                const data = await fs.readFile(this.memoryPath, 'utf-8');
                this.memory = { ...this.memory, ...JSON.parse(data) };
            }

            return { success: true, memory: this.memory };
        } catch (error) {
            console.error('Error loading mirror memory:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save memory to disk
     */
    async save() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.memoryPath);
            await fs.mkdir(dir, { recursive: true });

            this.memory.lastUpdated = Date.now();
            await fs.writeFile(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf-8');
            return { success: true };
        } catch (error) {
            console.error('Error saving mirror memory:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Store a pattern
     */
    async storePattern(pattern, category = 'architectural') {
        if (!this.memory.patterns[category]) {
            this.memory.patterns[category] = [];
        }

        // Check if pattern already exists (by ID)
        const existingIndex = this.memory.patterns[category].findIndex(p => p.id === pattern.id);
        
        if (existingIndex >= 0) {
            // Update existing pattern
            const existing = this.memory.patterns[category][existingIndex];
            this.memory.patterns[category][existingIndex] = {
                ...existing,
                ...pattern,
                appliedCount: existing.appliedCount || 0,
                successRate: existing.successRate || 0.0,
                lastUpdated: Date.now()
            };
        } else {
            // Add new pattern
            const newPattern = {
                ...pattern,
                appliedCount: 0,
                successRate: 0.0,
                extractedFrom: pattern.extractedFrom || 'unknown',
                createdAt: Date.now(),
                lastUpdated: Date.now()
            };
            this.memory.patterns[category].push(newPattern);

            // Emit event for new pattern learned
            this.emit('patternLearned', {
                pattern: newPattern,
                category,
                intelligence: this.memory.intelligenceMetrics.currentIntelligence
            });
        }

        await this.save();
        return { success: true, pattern: this.memory.patterns[category][this.memory.patterns[category].length - 1] };
    }

    /**
     * Retrieve patterns by category
     * @param {string|null} category - Category to filter by (null for all)
     * @param {number|null} limit - Max number of patterns to return
     * @param {string} sortBy - Sort order: 'recent', 'confidence', 'success', or default (useCount)
     */
    async retrievePatterns(category = null, limit = null, sortBy = 'recent') {
        let patterns = [];

        if (category && this.memory.patterns[category]) {
            patterns = [...this.memory.patterns[category]];
        } else {
            // Get all patterns from all categories
            for (const cat in this.memory.patterns) {
                const catPatterns = this.memory.patterns[cat] || [];
                // Add category info to each pattern
                patterns.push(...catPatterns.map(p => ({ ...p, category: p.category || cat })));
            }
        }

        // Sort patterns based on sortBy parameter
        if (sortBy === 'recent') {
            patterns.sort((a, b) => (b.lastUsed || b.created || 0) - (a.lastUsed || a.created || 0));
        } else if (sortBy === 'confidence') {
            patterns.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        } else if (sortBy === 'success') {
            patterns.sort((a, b) => (b.successRate || 0) - (a.successRate || 0));
        } else {
            // Default: sort by combined score
            patterns.sort((a, b) => {
                const scoreA = (a.confidence || 0.5) * 0.5 + (a.successRate || 0.5) * 0.5;
                const scoreB = (b.confidence || 0.5) * 0.5 + (b.successRate || 0.5) * 0.5;
                return scoreB - scoreA;
            });
        }

        // Apply limit if provided
        if (limit && limit > 0) {
            return patterns.slice(0, limit);
        }

        return patterns;
    }

    /**
     * Record pattern application
     */
    async recordPatternApplication(patternId, category, success = true) {
        const patterns = this.memory.patterns[category] || [];
        const pattern = patterns.find(p => p.id === patternId);

        if (pattern) {
            pattern.appliedCount = (pattern.appliedCount || 0) + 1;
            
            // Update success rate (moving average)
            const currentSuccessRate = pattern.successRate || 0.0;
            const newSuccessRate = (currentSuccessRate * (pattern.appliedCount - 1) + (success ? 1.0 : 0.0)) / pattern.appliedCount;
            pattern.successRate = newSuccessRate;
            pattern.lastApplied = Date.now();

            await this.save();
            return { success: true, pattern };
        }

        return { success: false, error: 'Pattern not found' };
    }

    /**
     * Add feedback loop entry
     */
    async addFeedbackLoop(loopData) {
        const loop = {
            loopId: `loop_${Date.now()}`,
            startTime: Date.now(),
            iterations: loopData.iterations || [],
            intelligenceGrowth: loopData.intelligenceGrowth || 0.0,
            metaQuestions: loopData.metaQuestions || [],
            resistanceChanges: loopData.resistanceChanges || [],
            experienceGained: loopData.experienceGained || []
        };

        this.memory.feedbackLoops.push(loop);

        // Keep only last 100 feedback loops
        if (this.memory.feedbackLoops.length > 100) {
            this.memory.feedbackLoops = this.memory.feedbackLoops.slice(-100);
        }

        await this.save();
        return { success: true, loop };
    }

    /**
     * Update intelligence metrics
     */
    async updateIntelligenceMetrics(metrics) {
        this.memory.intelligenceMetrics = {
            ...this.memory.intelligenceMetrics,
            ...metrics,
            lastUpdated: Date.now()
        };

        // Calculate growth rate
        if (this.memory.adaptationHistory.length > 0) {
            const previous = this.memory.adaptationHistory[this.memory.adaptationHistory.length - 1];
            const current = this.memory.intelligenceMetrics.currentIntelligence;
            this.memory.intelligenceMetrics.growthRate = current - previous.currentIntelligence;
        }

        await this.save();
        return { success: true, metrics: this.memory.intelligenceMetrics };
    }

    /**
     * Record adaptation
     */
    async recordAdaptation(adaptation) {
        const entry = {
            timestamp: Date.now(),
            type: adaptation.type,
            description: adaptation.description,
            patternId: adaptation.patternId,
            beforeMetrics: adaptation.beforeMetrics || { ...this.memory.intelligenceMetrics },
            afterMetrics: adaptation.afterMetrics || null,
            success: adaptation.success !== undefined ? adaptation.success : true
        };

        this.memory.adaptationHistory.push(entry);

        // Keep only last 1000 adaptations
        if (this.memory.adaptationHistory.length > 1000) {
            this.memory.adaptationHistory = this.memory.adaptationHistory.slice(-1000);
        }

        await this.save();
        return { success: true, adaptation: entry };
    }

    /**
     * Get relevant patterns for a task
     */
    async getRelevantPatterns(task, limit = 5) {
        const taskLower = task.toLowerCase();
        const relevant = [];

        // Search all categories
        for (const category in this.memory.patterns) {
            for (const pattern of this.memory.patterns[category]) {
                let score = 0;

                // Check description match
                if (pattern.description && pattern.description.toLowerCase().includes(taskLower)) {
                    score += 10;
                }

                // Check type match
                if (pattern.type && pattern.type.toLowerCase().includes(taskLower)) {
                    score += 5;
                }

                // Boost by success rate
                score += (pattern.successRate || 0) * 5;

                // Boost by confidence
                score += (pattern.confidence || 0.5) * 3;

                if (score > 0) {
                    relevant.push({ pattern, score });
                }
            }
        }

        // Sort by score and return top patterns
        relevant.sort((a, b) => b.score - a.score);
        return relevant.slice(0, limit).map(r => r.pattern);
    }

    /**
     * Get intelligence metrics
     */
    getIntelligenceMetrics() {
        return { ...this.memory.intelligenceMetrics };
    }

    /**
     * Get feedback loop history
     */
    getFeedbackLoops(limit = 10) {
        return this.memory.feedbackLoops.slice(-limit);
    }

    /**
     * Get adaptation history
     */
    getAdaptationHistory(limit = 50) {
        return this.memory.adaptationHistory.slice(-limit);
    }

    /**
     * Clear all memory (use with caution)
     */
    async clear() {
        this.memory = {
            version: '1.0',
            lastUpdated: Date.now(),
            patterns: {
                architectural: [],
                problemSolving: [],
                reasoning: [],
                style: []
            },
            feedbackLoops: [],
            intelligenceMetrics: {
                Q: 0.75,
                R: 0.30,
                E: 0.60,
                currentIntelligence: 1.0,
                growthRate: 0.0
            },
            adaptationHistory: []
        };
        await this.save();
        return { success: true };
    }

    /**
     * Get memory statistics
     */
    getStats() {
        const stats = {
            totalPatterns: 0,
            patternsByCategory: {},
            totalFeedbackLoops: this.memory.feedbackLoops.length,
            totalAdaptations: this.memory.adaptationHistory.length,
            intelligenceMetrics: this.memory.intelligenceMetrics,
            lastUpdated: this.memory.lastUpdated
        };

        for (const category in this.memory.patterns) {
            const count = this.memory.patterns[category].length;
            stats.totalPatterns += count;
            stats.patternsByCategory[category] = count;
        }

        return stats;
    }
}

module.exports = MirrorMemory;
