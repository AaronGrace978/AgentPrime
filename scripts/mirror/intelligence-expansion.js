/**
 * Intelligence Expansion Module
 * Implements I(n+1) = I(n) + (Q/R) × E equation
 */

const MirrorMemory = require('./mirror-memory');

class IntelligenceExpansion {
    constructor(mirrorMemory) {
        this.mirrorMemory = mirrorMemory;
    }

    /**
     * Calculate intelligence growth using I(n+1) = I(n) + (Q/R) × E
     */
    async calculateGrowth(questionQuality, resistance, experience) {
        const metrics = await this.mirrorMemory.getIntelligenceMetrics();
        const currentIntelligence = metrics.currentIntelligence || 1.0;

        // Ensure R is not zero to avoid division by zero
        const R = Math.max(0.1, resistance);
        
        // Calculate growth
        const growth = (questionQuality / R) * experience;
        const newIntelligence = currentIntelligence + growth;

        return {
            currentIntelligence,
            newIntelligence,
            growth,
            Q: questionQuality,
            R: resistance,
            E: experience
        };
    }

    /**
     * Generate meta-questions about code patterns (Q - Question Quality)
     */
    async generateMetaQuestions(code, patterns = null) {
        const questions = [];
        
        if (!patterns) {
            patterns = await this.mirrorMemory.retrievePatterns(null, null, 10);
        }

        // Questions about code structure
        if (!/class\s+\w+|function\s+\w+|const\s+\w+\s*=/.test(code)) {
            questions.push({
                question: 'Should this code be organized into functions or classes?',
                category: 'structure',
                quality: 0.8
            });
        }

        // Questions about error handling
        if (!/try\s*\{|catch|error|Error/.test(code)) {
            questions.push({
                question: 'How should error handling be implemented here?',
                category: 'error_handling',
                quality: 0.9
            });
        }

        // Questions about patterns
        for (const pattern of patterns.slice(0, 5)) {
            if (pattern.description && !code.includes(pattern.description.substring(0, 20))) {
                questions.push({
                    question: `Should we apply the pattern: ${pattern.description}?`,
                    category: 'pattern_application',
                    quality: pattern.confidence || 0.7,
                    patternId: pattern.id
                });
            }
        }

        // Calculate average question quality
        const avgQuality = questions.length > 0
            ? questions.reduce((sum, q) => sum + (q.quality || 0.7), 0) / questions.length
            : 0.5;

        return {
            questions,
            quality: avgQuality,
            count: questions.length
        };
    }

    /**
     * Measure resistance to change (R - Resistance)
     */
    async measureResistance(code, suggestedPatterns) {
        const metrics = await this.mirrorMemory.getIntelligenceMetrics();
        const baseResistance = metrics.R || 0.30;

        let resistance = baseResistance;

        // Code complexity increases resistance
        const complexity = this.estimateComplexity(code);
        if (complexity === 'complex') {
            resistance += 0.1;
        } else if (complexity === 'simple') {
            resistance -= 0.05;
        }

        // Number of suggested patterns affects resistance
        if (suggestedPatterns && suggestedPatterns.length > 5) {
            resistance += 0.05; // More patterns = more change needed
        }

        // Pattern success rate reduces resistance
        if (suggestedPatterns && suggestedPatterns.length > 0) {
            const avgSuccessRate = suggestedPatterns.reduce((sum, p) => 
                sum + (p.successRate || 0.5), 0) / suggestedPatterns.length;
            resistance -= avgSuccessRate * 0.1; // Higher success rate = less resistance
        }

        // Ensure resistance is in valid range
        resistance = Math.max(0.1, Math.min(1.0, resistance));

        return {
            resistance,
            baseResistance,
            change: resistance - baseResistance,
            factors: {
                complexity,
                patternCount: suggestedPatterns ? suggestedPatterns.length : 0
            }
        };
    }

    /**
     * Track experience diversity (E - Experience)
     */
    async trackExperience(code, taskType) {
        const metrics = await this.mirrorMemory.getIntelligenceMetrics();
        const currentExperience = metrics.E || 0.60;

        // Analyze code diversity
        const diversity = this.analyzeDiversity(code, taskType);

        // Update experience metric
        const newExperience = Math.min(1.0, currentExperience + diversity.gain);

        return {
            experience: newExperience,
            previous: currentExperience,
            gain: diversity.gain,
            diversity: diversity
        };
    }

    /**
     * Analyze code diversity
     */
    analyzeDiversity(code, taskType) {
        const features = {
            hasAsync: /async|await|Promise/.test(code),
            hasClasses: /class\s+\w+/.test(code),
            hasFunctions: /(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|def\s+)/.test(code),
            hasImports: /^(import|require|from)/m.test(code),
            hasErrorHandling: /try\s*\{|catch|error/.test(code),
            hasTests: /test|spec|describe|it\(/.test(code),
            hasDocs: /\/\*\*|\/\/|"""/.test(code)
        };

        const featureCount = Object.values(features).filter(v => v).length;
        const diversityScore = featureCount / Object.keys(features).length;

        // Gain experience based on diversity
        const gain = diversityScore * 0.05; // Small incremental gain

        return {
            features,
            diversityScore,
            gain,
            taskType
        };
    }

    /**
     * Estimate code complexity
     */
    estimateComplexity(code) {
        const lines = code.split('\n').length;
        const functions = (code.match(/(?:function|def|const\s+\w+\s*=\s*(?:async\s*)?\()/g) || []).length;
        const classes = (code.match(/class\s+/g) || []).length;
        const conditionals = (code.match(/if\s*\(|switch\s*\(/g) || []).length;
        const loops = (code.match(/for\s*\(|while\s*\(/g) || []).length;

        const complexityScore = lines * 0.1 + functions * 2 + classes * 3 + conditionals * 1.5 + loops * 1.5;

        if (complexityScore < 20) return 'simple';
        if (complexityScore < 50) return 'moderate';
        return 'complex';
    }

    /**
     * Reduce resistance through pattern adaptation
     */
    async reduceResistance(patternId, success) {
        const metrics = await this.mirrorMemory.getIntelligenceMetrics();
        const currentResistance = metrics.R || 0.30;

        // Successful pattern application reduces resistance
        if (success) {
            const newResistance = Math.max(0.1, currentResistance - 0.02);
            await this.mirrorMemory.updateIntelligenceMetrics({
                R: newResistance
            });
            return {
                success: true,
                previous: currentResistance,
                new: newResistance,
                change: -0.02
            };
        }

        return {
            success: false,
            previous: currentResistance,
            new: currentResistance,
            change: 0
        };
    }

    /**
     * Apply intelligence expansion to a generation task
     */
    async applyExpansion(task, code, suggestedPatterns = null) {
        // Generate meta-questions (Q)
        const questions = await this.generateMetaQuestions(code, suggestedPatterns);
        const Q = questions.quality;

        // Measure resistance (R)
        const resistance = await this.measureResistance(code, suggestedPatterns);
        const R = resistance.resistance;

        // Track experience (E)
        const experience = await this.trackExperience(code, task);
        const E = experience.experience;

        // Calculate growth
        const growth = await this.calculateGrowth(Q, R, E);

        // Update metrics
        await this.mirrorMemory.updateIntelligenceMetrics({
            Q,
            R,
            E,
            currentIntelligence: growth.newIntelligence,
            growthRate: growth.growth
        });

        return {
            success: true,
            metrics: {
                Q,
                R,
                E,
                currentIntelligence: growth.newIntelligence,
                growth: growth.growth
            },
            questions: questions.questions,
            resistance: resistance,
            experience: experience
        };
    }

    /**
     * Get current intelligence metrics
     */
    async getMetrics() {
        return await this.mirrorMemory.getIntelligenceMetrics();
    }

    /**
     * Get growth history
     */
    async getGrowthHistory(limit = 50) {
        const history = await this.mirrorMemory.getAdaptationHistory(limit);
        return history.filter(h => h.afterMetrics && h.beforeMetrics).map(h => ({
            timestamp: h.timestamp,
            growth: (h.afterMetrics.currentIntelligence || 0) - (h.beforeMetrics.currentIntelligence || 0),
            metrics: h.afterMetrics
        }));
    }

    /**
     * Predict future intelligence growth
     */
    async predictGrowth(iterations = 10) {
        const metrics = await this.mirrorMemory.getIntelligenceMetrics();
        const current = metrics.currentIntelligence || 1.0;
        const avgGrowth = metrics.growthRate || 0.0;

        const predictions = [];
        let predicted = current;

        for (let i = 1; i <= iterations; i++) {
            // Assume Q, R, E remain relatively stable
            const Q = metrics.Q || 0.75;
            const R = metrics.R || 0.30;
            const E = metrics.E || 0.60;

            const growth = (Q / R) * E * 0.1; // Scaled growth per iteration
            predicted += growth;

            predictions.push({
                iteration: i,
                predictedIntelligence: predicted,
                growth: growth
            });
        }

        return {
            current,
            predictions,
            projectedGrowth: predicted - current
        };
    }
}

module.exports = IntelligenceExpansion;
