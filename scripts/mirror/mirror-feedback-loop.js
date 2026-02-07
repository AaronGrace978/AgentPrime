/**
 * Opus Mirror Feedback Loop Engine
 * Implements the Mirror Paradox - creates recursive learning loops
 */

const MirrorMemory = require('./mirror-memory');
const MirrorPatternExtractor = require('./mirror-pattern-extractor');

class MirrorFeedbackLoop {
    constructor(mirrorMemory, patternExtractor) {
        this.mirrorMemory = mirrorMemory;
        this.patternExtractor = patternExtractor;
        this.activeLoops = new Map();
    }

    /**
     * Start a feedback loop for a generation task
     */
    async startLoop(task, agentPrimeOutput, opusReference = null) {
        const loopId = `loop_${Date.now()}`;
        
        const loop = {
            loopId,
            task,
            agentPrimeOutput,
            opusReference,
            startTime: Date.now(),
            iterations: [],
            metaQuestions: [],
            resistanceChanges: [],
            experienceGained: []
        };

        this.activeLoops.set(loopId, loop);

        // Initial comparison
        const comparison = await this.compareToOpus(agentPrimeOutput, opusReference);
        
        // Generate meta-questions
        const metaQuestions = await this.generateMetaQuestions(comparison);
        loop.metaQuestions = metaQuestions;

        // Analyze resistance
        const resistance = await this.analyzeResistance(comparison);
        loop.resistanceChanges.push({
            timestamp: Date.now(),
            resistance: resistance.current,
            change: resistance.change
        });

        return { success: true, loopId, loop };
    }

    /**
     * Compare AgentPrime output to Opus 4.5 MAX patterns
     */
    async compareToOpus(agentPrimeOutput, opusReference) {
        const comparison = {
            structuralSimilarity: 0.0,
            styleSimilarity: 0.0,
            reasoningSimilarity: 0.0,
            gaps: [],
            strengths: [],
            differences: []
        };

        if (!opusReference) {
            // Compare against stored patterns
            const patterns = await this.mirrorMemory.retrievePatterns(null, null, 10);
            
            if (patterns.length > 0) {
                // Extract patterns from AgentPrime output
                const agentPatterns = await this.patternExtractor.extractPatterns(agentPrimeOutput);
                
                // Compare structural patterns
                comparison.structuralSimilarity = this.calculateSimilarity(
                    agentPatterns.codeStructure,
                    patterns.filter(p => p.type && p.type.includes('structure'))
                );

                // Compare style patterns
                comparison.styleSimilarity = this.calculateSimilarity(
                    agentPatterns.style,
                    patterns.filter(p => p.type && p.type.includes('style'))
                );

                // Compare reasoning patterns
                comparison.reasoningSimilarity = this.calculateSimilarity(
                    agentPatterns.reasoning,
                    patterns.filter(p => p.type && p.type.includes('reasoning'))
                );
            }
        } else {
            // Direct comparison with Opus reference
            const agentPatterns = await this.patternExtractor.extractPatterns(agentPrimeOutput);
            const opusPatterns = await this.patternExtractor.extractPatterns(opusReference);

            comparison.structuralSimilarity = this.calculateSimilarity(
                agentPatterns.codeStructure,
                opusPatterns.codeStructure
            );

            comparison.styleSimilarity = this.calculateSimilarity(
                agentPatterns.style,
                opusPatterns.style
            );

            comparison.reasoningSimilarity = this.calculateSimilarity(
                agentPatterns.reasoning,
                opusPatterns.reasoning
            );
        }

        // Identify gaps and differences
        comparison.gaps = this.identifyGaps(agentPrimeOutput, opusReference);
        comparison.strengths = this.identifyStrengths(agentPrimeOutput);
        comparison.differences = this.identifyDifferences(agentPrimeOutput, opusReference);

        return comparison;
    }

    /**
     * Calculate similarity between pattern sets
     */
    calculateSimilarity(patterns1, patterns2) {
        if (!patterns1 || !patterns2 || patterns1.length === 0 || patterns2.length === 0) {
            return 0.0;
        }

        let totalSimilarity = 0.0;
        let matches = 0;

        for (const p1 of patterns1) {
            for (const p2 of patterns2) {
                const similarity = this.patternSimilarity(p1, p2);
                if (similarity > 0.5) {
                    totalSimilarity += similarity;
                    matches++;
                }
            }
        }

        return matches > 0 ? totalSimilarity / matches : 0.0;
    }

    /**
     * Calculate similarity between two patterns
     */
    patternSimilarity(pattern1, pattern2) {
        let similarity = 0.0;
        let factors = 0;

        // Type similarity
        if (pattern1.type === pattern2.type) {
            similarity += 0.3;
        }
        factors += 0.3;

        // Description similarity
        if (pattern1.description && pattern2.description) {
            const desc1 = pattern1.description.toLowerCase();
            const desc2 = pattern2.description.toLowerCase();
            if (desc1 === desc2) {
                similarity += 0.4;
            } else if (desc1.includes(desc2) || desc2.includes(desc1)) {
                similarity += 0.2;
            }
        }
        factors += 0.4;

        // Characteristics similarity
        if (pattern1.characteristics && pattern2.characteristics) {
            const keys1 = Object.keys(pattern1.characteristics);
            const keys2 = Object.keys(pattern2.characteristics);
            const commonKeys = keys1.filter(k => keys2.includes(k));
            
            if (commonKeys.length > 0) {
                let charSimilarity = 0.0;
                for (const key of commonKeys) {
                    if (pattern1.characteristics[key] === pattern2.characteristics[key]) {
                        charSimilarity += 1.0;
                    }
                }
                similarity += (charSimilarity / commonKeys.length) * 0.3;
            }
        }
        factors += 0.3;

        return factors > 0 ? similarity / factors : 0.0;
    }

    /**
     * Identify gaps in AgentPrime output
     */
    identifyGaps(agentOutput, opusReference) {
        const gaps = [];

        // Check for missing error handling
        if (!/try\s*\{|catch|error|Error/.test(agentOutput)) {
            gaps.push({
                type: 'error_handling',
                description: 'Missing error handling patterns',
                severity: 'medium'
            });
        }

        // Check for missing documentation
        const commentRatio = (agentOutput.match(/\/\/|\/\*|#/g) || []).length / agentOutput.split('\n').length;
        if (commentRatio < 0.05) {
            gaps.push({
                type: 'documentation',
                description: 'Low documentation coverage',
                severity: 'low'
            });
        }

        // Check for missing modular structure
        if (!/^(import|require|export|module\.exports)/m.test(agentOutput)) {
            gaps.push({
                type: 'modularity',
                description: 'Code lacks modular structure',
                severity: 'medium'
            });
        }

        return gaps;
    }

    /**
     * Identify strengths in AgentPrime output
     */
    identifyStrengths(agentOutput) {
        const strengths = [];

        // Check for good structure
        if (/class\s+\w+|function\s+\w+|const\s+\w+\s*=/.test(agentOutput)) {
            strengths.push({
                type: 'structure',
                description: 'Well-structured code with clear organization'
            });
        }

        // Check for modern patterns
        if (/async|await|Promise|const\s+\w+\s*=\s*\(/.test(agentOutput)) {
            strengths.push({
                type: 'modern_patterns',
                description: 'Uses modern JavaScript/TypeScript patterns'
            });
        }

        return strengths;
    }

    /**
     * Identify differences between outputs
     */
    identifyDifferences(agentOutput, opusReference) {
        const differences = [];

        if (!opusReference) return differences;

        // Compare line counts
        const agentLines = agentOutput.split('\n').length;
        const opusLines = opusReference.split('\n').length;
        if (Math.abs(agentLines - opusLines) > opusLines * 0.2) {
            differences.push({
                type: 'length',
                description: `Length difference: AgentPrime ${agentLines} lines vs Opus ${opusLines} lines`,
                agentValue: agentLines,
                opusValue: opusLines
            });
        }

        // Compare function counts
        const agentFunctions = (agentOutput.match(/(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|def\s+)/g) || []).length;
        const opusFunctions = (opusReference.match(/(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|def\s+)/g) || []).length;
        if (Math.abs(agentFunctions - opusFunctions) > 2) {
            differences.push({
                type: 'functions',
                description: `Function count difference: AgentPrime ${agentFunctions} vs Opus ${opusFunctions}`,
                agentValue: agentFunctions,
                opusValue: opusFunctions
            });
        }

        return differences;
    }

    /**
     * Generate meta-questions about differences (Q in Intelligence Expansion)
     */
    async generateMetaQuestions(comparison) {
        const questions = [];

        // Questions about structural differences
        if (comparison.structuralSimilarity < 0.7) {
            questions.push({
                question: 'Why does the code structure differ from Opus patterns?',
                category: 'structure',
                priority: 'high'
            });
        }

        // Questions about style differences
        if (comparison.styleSimilarity < 0.7) {
            questions.push({
                question: 'What style conventions should be adopted from Opus?',
                category: 'style',
                priority: 'medium'
            });
        }

        // Questions about gaps
        for (const gap of comparison.gaps) {
            questions.push({
                question: `How can we address the gap: ${gap.description}?`,
                category: gap.type,
                priority: gap.severity === 'high' ? 'high' : 'medium'
            });
        }

        // Questions about reasoning
        if (comparison.reasoningSimilarity < 0.7) {
            questions.push({
                question: 'What reasoning patterns from Opus should be adopted?',
                category: 'reasoning',
                priority: 'high'
            });
        }

        return questions;
    }

    /**
     * Analyze resistance to change (R in Intelligence Expansion)
     */
    async analyzeResistance(comparison) {
        const metrics = await this.mirrorMemory.getIntelligenceMetrics();
        const currentResistance = metrics.R || 0.30;

        // Calculate resistance change based on comparison
        let resistanceChange = 0.0;

        // High similarity reduces resistance
        const avgSimilarity = (
            comparison.structuralSimilarity +
            comparison.styleSimilarity +
            comparison.reasoningSimilarity
        ) / 3;

        if (avgSimilarity > 0.8) {
            resistanceChange = -0.05; // Reduce resistance
        } else if (avgSimilarity < 0.5) {
            resistanceChange = 0.05; // Increase resistance (more adaptation needed)
        }

        // Gaps increase resistance
        resistanceChange += comparison.gaps.length * 0.02;

        const newResistance = Math.max(0.0, Math.min(1.0, currentResistance + resistanceChange));

        return {
            current: newResistance,
            previous: currentResistance,
            change: resistanceChange
        };
    }

    /**
     * Process feedback loop iteration
     */
    async processIteration(loopId, adaptedOutput) {
        const loop = this.activeLoops.get(loopId);
        if (!loop) {
            return { success: false, error: 'Loop not found' };
        }

        const iteration = {
            iterationNumber: loop.iterations.length + 1,
            timestamp: Date.now(),
            output: adaptedOutput,
            comparison: null,
            metaQuestions: [],
            resistanceChange: null
        };

        // Compare adapted output
        iteration.comparison = await this.compareToOpus(adaptedOutput, loop.opusReference);
        
        // Generate new meta-questions
        iteration.metaQuestions = await this.generateMetaQuestions(iteration.comparison);
        
        // Analyze resistance change
        const resistance = await this.analyzeResistance(iteration.comparison);
        iteration.resistanceChange = resistance;

        loop.iterations.push(iteration);
        loop.metaQuestions.push(...iteration.metaQuestions);
        loop.resistanceChanges.push({
            timestamp: Date.now(),
            resistance: resistance.current,
            change: resistance.change
        });

        return { success: true, iteration };
    }

    /**
     * Complete feedback loop and calculate intelligence growth
     */
    async completeLoop(loopId) {
        const loop = this.activeLoops.get(loopId);
        if (!loop) {
            return { success: false, error: 'Loop not found' };
        }

        // Calculate intelligence growth from this loop
        const avgSimilarity = loop.iterations.length > 0
            ? loop.iterations.reduce((sum, iter) => {
                const sim = (
                    iter.comparison.structuralSimilarity +
                    iter.comparison.styleSimilarity +
                    iter.comparison.reasoningSimilarity
                ) / 3;
                return sum + sim;
            }, 0) / loop.iterations.length
            : 0.5;

        const finalResistance = loop.resistanceChanges.length > 0
            ? loop.resistanceChanges[loop.resistanceChanges.length - 1].resistance
            : 0.30;

        const experienceGained = loop.iterations.length;

        // Intelligence growth: I(n+1) = I(n) + (Q/R) × E
        // Q = question quality (based on meta-questions generated)
        // R = resistance
        // E = experience (iterations)
        const Q = Math.min(1.0, loop.metaQuestions.length / 10.0); // Normalize to 0-1
        const R = Math.max(0.1, finalResistance); // Avoid division by zero
        const E = Math.min(1.0, experienceGained / 5.0); // Normalize to 0-1

        const intelligenceGrowth = (Q / R) * E;

        loop.intelligenceGrowth = intelligenceGrowth;
        loop.experienceGained = experienceGained;
        loop.endTime = Date.now();

        // Save to memory
        await this.mirrorMemory.addFeedbackLoop({
            iterations: loop.iterations,
            intelligenceGrowth,
            metaQuestions: loop.metaQuestions,
            resistanceChanges: loop.resistanceChanges,
            experienceGained
        });

        // Update intelligence metrics
        const currentMetrics = await this.mirrorMemory.getIntelligenceMetrics();
        await this.mirrorMemory.updateIntelligenceMetrics({
            Q: Math.max(0.5, Math.min(1.0, (currentMetrics.Q + Q) / 2)),
            R: finalResistance,
            E: Math.max(0.5, Math.min(1.0, (currentMetrics.E + E) / 2)),
            currentIntelligence: currentMetrics.currentIntelligence + intelligenceGrowth
        });

        this.activeLoops.delete(loopId);

        return {
            success: true,
            loop,
            intelligenceGrowth,
            metrics: {
                Q,
                R,
                E,
                growth: intelligenceGrowth
            }
        };
    }

    /**
     * Get active loop
     */
    getActiveLoop(loopId) {
        return this.activeLoops.get(loopId);
    }

    /**
     * Get all active loops
     */
    getAllActiveLoops() {
        return Array.from(this.activeLoops.values());
    }
}

module.exports = MirrorFeedbackLoop;
