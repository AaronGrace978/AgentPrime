/**
 * Adaptive Code Generator
 * Generates code using learned patterns with adaptation
 */

const MirrorMemory = require('./mirror-memory');
const MirrorPatternExtractor = require('./mirror-pattern-extractor');
const IntelligenceExpansion = require('./intelligence-expansion');
const MirrorFeedbackLoop = require('./mirror-feedback-loop');

class AdaptiveCodeGenerator {
    constructor(mirrorMemory, patternExtractor, intelligenceExpansion, feedbackLoop) {
        this.mirrorMemory = mirrorMemory;
        this.patternExtractor = patternExtractor;
        this.intelligenceExpansion = intelligenceExpansion;
        this.feedbackLoop = feedbackLoop;
    }

    /**
     * Generate code using learned patterns
     */
    async generateCode(task, context = {}) {
        // Step 1: Query mirror memory for relevant patterns
        const relevantPatterns = await this.mirrorMemory.getRelevantPatterns(task, 10);
        
        // Step 2: Apply Intelligence Expansion metrics
        const expansionMetrics = await this.intelligenceExpansion.getMetrics();
        
        // Step 3: Build enhanced prompt with patterns
        const enhancedPrompt = this.buildEnhancedPrompt(task, relevantPatterns, expansionMetrics, context);
        
        return {
            prompt: enhancedPrompt,
            patterns: relevantPatterns,
            metrics: expansionMetrics,
            context
        };
    }

    /**
     * Build enhanced prompt with learned patterns
     */
    buildEnhancedPrompt(task, patterns, metrics, context) {
        let prompt = `Task: ${task}\n\n`;

        // Add pattern guidance
        if (patterns.length > 0) {
            prompt += `--- Learned Patterns (from Opus 4.5 MAX) ---\n`;
            for (const pattern of patterns.slice(0, 5)) {
                prompt += `\nPattern: ${pattern.type || 'unknown'}\n`;
                prompt += `Description: ${pattern.description || 'N/A'}\n`;
                if (pattern.characteristics) {
                    prompt += `Characteristics: ${JSON.stringify(pattern.characteristics)}\n`;
                }
                prompt += `Confidence: ${(pattern.confidence || 0.5).toFixed(2)}\n`;
                prompt += `Success Rate: ${(pattern.successRate || 0).toFixed(2)}\n`;
            }
            prompt += `\n--- End Patterns ---\n\n`;
        }

        // Add intelligence metrics context
        prompt += `Intelligence Metrics:\n`;
        prompt += `- Question Quality (Q): ${metrics.Q.toFixed(2)}\n`;
        prompt += `- Resistance (R): ${metrics.R.toFixed(2)} (lower is better)\n`;
        prompt += `- Experience (E): ${metrics.E.toFixed(2)}\n`;
        prompt += `- Current Intelligence: ${metrics.currentIntelligence.toFixed(2)}\n\n`;

        // Add context if provided
        if (context.filePath) {
            prompt += `Current file: ${context.filePath}\n`;
        }
        if (context.selectedText) {
            prompt += `Selected code:\n\`\`\`\n${context.selectedText}\n\`\`\`\n\n`;
        }
        if (context.fileContent) {
            prompt += `File content:\n\`\`\`\n${context.fileContent.slice(0, 2000)}\n\`\`\`\n\n`;
        }

        prompt += `Generate code following the learned patterns and best practices.\n`;

        return prompt;
    }

    /**
     * Self-evaluate generated code against Opus 4.5 MAX standards
     */
    async selfEvaluate(generatedCode, task) {
        const evaluation = {
            score: 0.0,
            strengths: [],
            weaknesses: [],
            suggestions: []
        };

        // Extract patterns from generated code
        const generatedPatterns = await this.patternExtractor.extractPatterns(generatedCode);

        // Compare with stored patterns
        const storedPatterns = await this.mirrorMemory.retrievePatterns(null, null, 10);

        // Evaluate structure
        const structureScore = this.evaluateStructure(generatedCode, storedPatterns);
        evaluation.score += structureScore * 0.3;
        if (structureScore > 0.7) {
            evaluation.strengths.push('Well-structured code');
        } else {
            evaluation.weaknesses.push('Code structure could be improved');
            evaluation.suggestions.push('Consider organizing code into modules or classes');
        }

        // Evaluate style
        const styleScore = this.evaluateStyle(generatedCode, storedPatterns);
        evaluation.score += styleScore * 0.2;
        if (styleScore > 0.7) {
            evaluation.strengths.push('Consistent coding style');
        } else {
            evaluation.weaknesses.push('Style inconsistencies detected');
            evaluation.suggestions.push('Review naming conventions and formatting');
        }

        // Evaluate error handling
        const errorHandlingScore = this.evaluateErrorHandling(generatedCode);
        evaluation.score += errorHandlingScore * 0.2;
        if (errorHandlingScore > 0.7) {
            evaluation.strengths.push('Good error handling');
        } else {
            evaluation.weaknesses.push('Missing error handling');
            evaluation.suggestions.push('Add try-catch blocks or error handling logic');
        }

        // Evaluate documentation
        const docsScore = this.evaluateDocumentation(generatedCode);
        evaluation.score += docsScore * 0.15;
        if (docsScore > 0.7) {
            evaluation.strengths.push('Well-documented code');
        } else {
            evaluation.weaknesses.push('Insufficient documentation');
            evaluation.suggestions.push('Add comments and documentation');
        }

        // Evaluate completeness
        const completenessScore = this.evaluateCompleteness(generatedCode, task);
        evaluation.score += completenessScore * 0.15;
        if (completenessScore > 0.7) {
            evaluation.strengths.push('Complete implementation');
        } else {
            evaluation.weaknesses.push('Implementation may be incomplete');
            evaluation.suggestions.push('Review task requirements');
        }

        return evaluation;
    }

    /**
     * Evaluate code structure
     */
    evaluateStructure(code, storedPatterns) {
        let score = 0.5; // Base score

        // Check for modular structure
        if (/^(import|require|export|module\.exports)/m.test(code)) {
            score += 0.2;
        }

        // Check for classes or functions
        if (/class\s+\w+|function\s+\w+|const\s+\w+\s*=/.test(code)) {
            score += 0.2;
        }

        // Check against stored patterns
        const structurePatterns = storedPatterns.filter(p => 
            p.type && (p.type.includes('structure') || p.type.includes('hierarchy'))
        );
        if (structurePatterns.length > 0) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * Evaluate coding style
     */
    evaluateStyle(code, storedPatterns) {
        let score = 0.5; // Base score

        // Check for consistent naming
        const camelCase = (code.match(/\b[a-z][a-zA-Z0-9]*\b/g) || []).length;
        const total = (code.match(/\b\w+\b/g) || []).length;
        if (total > 0 && camelCase / total > 0.5) {
            score += 0.2;
        }

        // Check formatting
        const hasConsistentIndentation = /^ {2,}|\t/.test(code);
        if (hasConsistentIndentation) {
            score += 0.2;
        }

        // Check against stored style patterns
        const stylePatterns = storedPatterns.filter(p => 
            p.type && p.type.includes('style')
        );
        if (stylePatterns.length > 0) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * Evaluate error handling
     */
    evaluateErrorHandling(code) {
        let score = 0.0;

        if (/try\s*\{/.test(code)) {
            score += 0.4;
        }
        if (/catch/.test(code)) {
            score += 0.3;
        }
        if (/error|Error|exception|Exception/.test(code)) {
            score += 0.2;
        }
        if (/validate|check|assert/.test(code)) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    /**
     * Evaluate documentation
     */
    evaluateDocumentation(code) {
        const lines = code.split('\n');
        const commentLines = lines.filter(l => 
            /\/\/|\/\*|#|"""/.test(l.trim())
        ).length;
        const commentRatio = commentLines / lines.length;

        let score = 0.0;
        if (commentRatio > 0.1) {
            score = 1.0;
        } else if (commentRatio > 0.05) {
            score = 0.7;
        } else if (commentRatio > 0.02) {
            score = 0.4;
        }

        // Check for JSDoc or docstrings
        if (/\/\*\*|\*\//.test(code) || /""".*?"""/.test(code)) {
            score = Math.min(1.0, score + 0.2);
        }

        return score;
    }

    /**
     * Evaluate completeness
     */
    evaluateCompleteness(code, task) {
        let score = 0.5; // Base score

        // Check if code has functions/classes (not just empty)
        if (code.trim().length > 50) {
            score += 0.2;
        }

        // Check if code has imports (if task suggests it)
        if (task.toLowerCase().includes('import') || task.toLowerCase().includes('module')) {
            if (/^(import|require|from)/m.test(code)) {
                score += 0.2;
            }
        }

        // Check if code has exports (if task suggests it)
        if (task.toLowerCase().includes('export') || task.toLowerCase().includes('module')) {
            if (/^(export|module\.exports)/m.test(code)) {
                score += 0.1;
            }
        }

        return Math.min(1.0, score);
    }

    /**
     * Update patterns based on feedback
     */
    async updatePatternsFromFeedback(generatedCode, evaluation, task) {
        // Extract patterns from generated code
        const patterns = await this.patternExtractor.extractPatterns(generatedCode, {
            originalPrompt: task,
            fileCount: 1,
            hasReadme: false
        });

        // Store successful patterns
        if (evaluation.score > 0.7) {
            for (const category in patterns) {
                for (const pattern of patterns[category]) {
                    await this.mirrorMemory.storePattern(pattern, this.mapCategory(category));
                    await this.mirrorMemory.recordPatternApplication(
                        pattern.id,
                        this.mapCategory(category),
                        true
                    );
                }
            }
        }

        // Record adaptation
        const beforeMetrics = await this.mirrorMemory.getIntelligenceMetrics();
        await this.intelligenceExpansion.applyExpansion(task, generatedCode, patterns.architectural);
        const afterMetrics = await this.mirrorMemory.getIntelligenceMetrics();

        await this.mirrorMemory.recordAdaptation({
            type: 'pattern_application',
            description: `Applied patterns for task: ${task.substring(0, 50)}`,
            success: evaluation.score > 0.7,
            beforeMetrics,
            afterMetrics
        });

        return { success: true, patternsStored: Object.keys(patterns).length };
    }

    /**
     * Map pattern category
     */
    mapCategory(category) {
        const mapping = {
            codeStructure: 'architectural',
            problemSolving: 'problemSolving',
            reasoning: 'reasoning',
            style: 'style'
        };
        return mapping[category] || 'architectural';
    }

    /**
     * Complete generation cycle with feedback loop
     */
    async generateWithFeedback(task, context = {}, opusReference = null) {
        // Step 1: Generate code
        const generation = await this.generateCode(task, context);
        
        // Step 2: Start feedback loop
        const loopResult = await this.feedbackLoop.startLoop(
            task,
            generation.prompt, // This would be the actual generated code in real implementation
            opusReference
        );

        // Step 3: Self-evaluate
        const evaluation = await this.selfEvaluate(generation.prompt, task);

        // Step 4: Update patterns
        await this.updatePatternsFromFeedback(generation.prompt, evaluation, task);

        // Step 5: Complete feedback loop
        if (loopResult.success) {
            await this.feedbackLoop.completeLoop(loopResult.loopId);
        }

        return {
            generation,
            evaluation,
            feedbackLoop: loopResult,
            success: true
        };
    }
}

module.exports = AdaptiveCodeGenerator;
