/**
 * Opus Mirror Pattern Extractor
 * Analyzes Opus 4.5 MAX code examples and extracts patterns
 */

const fs = require('fs').promises;
const path = require('path');

class MirrorPatternExtractor {
    constructor(opusExamplesPath) {
        this.opusExamplesPath = opusExamplesPath;
        this.patterns = {
            codeStructure: [],
            problemSolving: [],
            reasoning: [],
            style: [],
            promptInterpretation: []
        };
    }

    /**
     * Extract patterns from a code example
     */
    async extractPatterns(codeContent, metadata = {}) {
        const patterns = {
            codeStructure: this.extractCodeStructure(codeContent),
            problemSolving: this.extractProblemSolvingApproach(codeContent),
            reasoning: this.extractReasoningPatterns(codeContent),
            style: this.extractStylePatterns(codeContent),
            promptInterpretation: this.extractPromptInterpretation(codeContent, metadata)
        };

        // Calculate confidence scores
        for (const category in patterns) {
            patterns[category] = patterns[category].map(pattern => ({
                ...pattern,
                confidence: this.calculateConfidence(pattern, codeContent)
            }));
        }

        return patterns;
    }

    /**
     * Extract code structure patterns (architecture, organization)
     */
    extractCodeStructure(codeContent) {
        const patterns = [];
        const lines = codeContent.split('\n');

        // Module/class organization
        const modulePattern = this.detectModularStructure(codeContent);
        if (modulePattern) patterns.push(modulePattern);

        // Function/class hierarchy
        const hierarchyPattern = this.detectHierarchy(codeContent);
        if (hierarchyPattern) patterns.push(hierarchyPattern);

        // Design patterns
        const designPatterns = this.detectDesignPatterns(codeContent);
        patterns.push(...designPatterns);

        // Code organization principles
        const organizationPattern = this.detectOrganization(codeContent);
        if (organizationPattern) patterns.push(organizationPattern);

        return patterns;
    }

    /**
     * Detect modular structure (separate files, clear boundaries)
     */
    detectModularStructure(codeContent) {
        const hasImports = /^(import|require|from|using)\s+/.test(codeContent);
        const hasExports = /^(export|module\.exports|exports\.)/.test(codeContent);
        const hasClasses = /class\s+\w+/.test(codeContent);
        const hasFunctions = /(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|def\s+\w+\s*\()/.test(codeContent);

        if (hasImports || hasExports || (hasClasses && hasFunctions)) {
            return {
                id: `pattern_${Date.now()}_modular`,
                type: 'modular_structure',
                description: 'Code organized into modules with clear boundaries',
                characteristics: {
                    hasImports,
                    hasExports,
                    hasClasses,
                    hasFunctions
                },
                examples: [codeContent.substring(0, 500)]
            };
        }
        return null;
    }

    /**
     * Detect class/function hierarchy
     */
    detectHierarchy(codeContent) {
        const classMatches = codeContent.match(/class\s+(\w+)(?:\s+extends\s+(\w+))?/g);
        const functionMatches = codeContent.match(/(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|def\s+)(\w+)\s*\(/g);

        if (classMatches || functionMatches) {
            const hierarchy = {
                classes: classMatches ? classMatches.map(m => {
                    const match = m.match(/class\s+(\w+)(?:\s+extends\s+(\w+))?/);
                    return { name: match[1], extends: match[2] || null };
                }) : [],
                functions: functionMatches ? functionMatches.map(m => {
                    const match = m.match(/(?:function|const\s+(\w+)\s*=|def\s+)(\w+)/);
                    return match[2] || match[1];
                }) : []
            };

            return {
                id: `pattern_${Date.now()}_hierarchy`,
                type: 'hierarchy',
                description: 'Code organized in hierarchical structure',
                characteristics: hierarchy,
                examples: [codeContent.substring(0, 500)]
            };
        }
        return null;
    }

    /**
     * Detect common design patterns
     */
    detectDesignPatterns(codeContent) {
        const patterns = [];

        // Singleton
        if (/getInstance\s*\(|private\s+static\s+\w+\s*instance/.test(codeContent)) {
            patterns.push({
                id: `pattern_${Date.now()}_singleton`,
                type: 'design_pattern',
                pattern: 'singleton',
                description: 'Singleton pattern detected'
            });
        }

        // Factory
        if (/create\w+|factory|Factory/.test(codeContent)) {
            patterns.push({
                id: `pattern_${Date.now()}_factory`,
                type: 'design_pattern',
                pattern: 'factory',
                description: 'Factory pattern detected'
            });
        }

        // Observer/Event
        if (/on\(|emit\(|subscribe\(|addEventListener\(/.test(codeContent)) {
            patterns.push({
                id: `pattern_${Date.now()}_observer`,
                type: 'design_pattern',
                pattern: 'observer',
                description: 'Observer/Event pattern detected'
            });
        }

        // Strategy
        if (/strategy|Strategy|execute\(|algorithm/.test(codeContent)) {
            patterns.push({
                id: `pattern_${Date.now()}_strategy`,
                type: 'design_pattern',
                pattern: 'strategy',
                description: 'Strategy pattern detected'
            });
        }

        return patterns;
    }

    /**
     * Detect code organization principles
     */
    detectOrganization(codeContent) {
        const lines = codeContent.split('\n');
        const sections = {
            imports: 0,
            constants: 0,
            classes: 0,
            functions: 0,
            exports: 0
        };

        for (const line of lines) {
            if (/^(import|require|from|using)/.test(line.trim())) sections.imports++;
            if (/^(const|let|var)\s+\w+\s*=\s*[A-Z_]/.test(line.trim())) sections.constants++;
            if (/^class\s+/.test(line.trim())) sections.classes++;
            if (/^(function|const\s+\w+\s*=\s*(?:async\s*)?\(|def\s+)/.test(line.trim())) sections.functions++;
            if (/^(export|module\.exports)/.test(line.trim())) sections.exports++;
        }

        if (sections.imports > 0 || sections.exports > 0 || sections.classes > 0) {
            return {
                id: `pattern_${Date.now()}_organization`,
                type: 'organization',
                description: 'Code follows organized structure',
                characteristics: sections,
                examples: [codeContent.substring(0, 500)]
            };
        }
        return null;
    }

    /**
     * Extract problem-solving approaches
     */
    extractProblemSolvingApproach(codeContent) {
        const patterns = [];

        // Task breakdown
        const taskBreakdown = this.detectTaskBreakdown(codeContent);
        if (taskBreakdown) patterns.push(taskBreakdown);

        // Error handling approach
        const errorHandling = this.detectErrorHandling(codeContent);
        if (errorHandling) patterns.push(errorHandling);

        // Data flow
        const dataFlow = this.detectDataFlow(codeContent);
        if (dataFlow) patterns.push(dataFlow);

        return patterns;
    }

    /**
     * Detect how tasks are broken down
     */
    detectTaskBreakdown(codeContent) {
        const hasMultipleFunctions = (codeContent.match(/(?:function|def|const\s+\w+\s*=\s*(?:async\s*)?\()/g) || []).length > 1;
        const hasComments = (codeContent.match(/\/\/|\/\*|#/g) || []).length > 3;
        const hasSteps = /step|TODO|FIXME|NOTE/.test(codeContent);

        if (hasMultipleFunctions || hasComments || hasSteps) {
            return {
                id: `pattern_${Date.now()}_breakdown`,
                type: 'task_breakdown',
                description: 'Code shows clear task decomposition',
                characteristics: {
                    hasMultipleFunctions,
                    hasComments,
                    hasSteps
                }
            };
        }
        return null;
    }

    /**
     * Detect error handling patterns
     */
    detectErrorHandling(codeContent) {
        const hasTryCatch = /try\s*\{/.test(codeContent);
        const hasErrorHandling = /catch|error|Error|exception|Exception/.test(codeContent);
        const hasValidation = /validate|check|assert|if\s*\([^)]*error/.test(codeContent);

        if (hasTryCatch || hasErrorHandling || hasValidation) {
            return {
                id: `pattern_${Date.now()}_error_handling`,
                type: 'error_handling',
                description: 'Robust error handling approach',
                characteristics: {
                    hasTryCatch,
                    hasErrorHandling,
                    hasValidation
                }
            };
        }
        return null;
    }

    /**
     * Detect data flow patterns
     */
    detectDataFlow(codeContent) {
        const hasAsync = /async|await|Promise|then\(|callback/.test(codeContent);
        const hasState = /state|State|useState|setState/.test(codeContent);
        const hasProps = /props|Props|parameters|params/.test(codeContent);

        if (hasAsync || hasState || hasProps) {
            return {
                id: `pattern_${Date.now()}_data_flow`,
                type: 'data_flow',
                description: 'Clear data flow patterns',
                characteristics: {
                    hasAsync,
                    hasState,
                    hasProps
                }
            };
        }
        return null;
    }

    /**
     * Extract reasoning patterns (decision-making logic)
     */
    extractReasoningPatterns(codeContent) {
        const patterns = [];

        // Comments and documentation
        const comments = this.extractComments(codeContent);
        if (comments.length > 0) patterns.push(...comments);

        // Decision points
        const decisions = this.extractDecisions(codeContent);
        if (decisions.length > 0) patterns.push(...decisions);

        return patterns;
    }

    /**
     * Extract meaningful comments
     */
    extractComments(codeContent) {
        const patterns = [];
        const lines = codeContent.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const commentMatch = line.match(/(?:\/\/|\/\*|#)\s*(.+)/);
            if (commentMatch) {
                const comment = commentMatch[1].trim();
                if (comment.length > 10 && !comment.match(/^(TODO|FIXME|NOTE|XXX)/i)) {
                    patterns.push({
                        id: `pattern_${Date.now()}_comment_${i}`,
                        type: 'reasoning_comment',
                        description: 'Explanatory comment showing reasoning',
                        content: comment,
                        line: i + 1
                    });
                }
            }
        }

        return patterns.slice(0, 10); // Limit to 10 most relevant
    }

    /**
     * Extract decision-making points
     */
    extractDecisions(codeContent) {
        const patterns = [];
        const lines = codeContent.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Look for conditional logic with meaningful conditions
            const ifMatch = line.match(/if\s*\(([^)]+)\)/);
            if (ifMatch && ifMatch[1].length > 5) {
                patterns.push({
                    id: `pattern_${Date.now()}_decision_${i}`,
                    type: 'decision_point',
                    description: 'Decision-making logic',
                    condition: ifMatch[1].trim(),
                    line: i + 1
                });
            }
        }

        return patterns.slice(0, 10);
    }

    /**
     * Extract style patterns (naming, formatting, conventions)
     */
    extractStylePatterns(codeContent) {
        const patterns = [];

        // Naming conventions
        const naming = this.detectNamingConventions(codeContent);
        if (naming) patterns.push(naming);

        // Formatting preferences
        const formatting = this.detectFormatting(codeContent);
        if (formatting) patterns.push(formatting);

        // Documentation style
        const docs = this.detectDocumentationStyle(codeContent);
        if (docs) patterns.push(docs);

        return patterns;
    }

    /**
     * Detect naming conventions
     */
    detectNamingConventions(codeContent) {
        const camelCase = (codeContent.match(/\b[a-z][a-zA-Z0-9]*\b/g) || []).length;
        const PascalCase = (codeContent.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || []).length;
        const snake_case = (codeContent.match(/\b[a-z]+_[a-z]+\b/g) || []).length;
        const UPPER_CASE = (codeContent.match(/\b[A-Z][A-Z_0-9]+\b/g) || []).length;

        const total = camelCase + PascalCase + snake_case + UPPER_CASE;
        if (total > 0) {
            return {
                id: `pattern_${Date.now()}_naming`,
                type: 'naming_convention',
                description: 'Naming convention patterns',
                characteristics: {
                    camelCase: camelCase / total,
                    PascalCase: PascalCase / total,
                    snake_case: snake_case / total,
                    UPPER_CASE: UPPER_CASE / total
                }
            };
        }
        return null;
    }

    /**
     * Detect formatting preferences
     */
    detectFormatting(codeContent) {
        const usesTabs = (codeContent.match(/\t/g) || []).length;
        const usesSpaces = (codeContent.match(/^ {2,}/gm) || []).length;
        const lineLength = Math.max(...codeContent.split('\n').map(l => l.length));
        const avgLineLength = codeContent.split('\n').reduce((sum, l) => sum + l.length, 0) / codeContent.split('\n').length;

        return {
            id: `pattern_${Date.now()}_formatting`,
            type: 'formatting',
            description: 'Code formatting preferences',
            characteristics: {
                indentation: usesTabs > usesSpaces ? 'tabs' : 'spaces',
                maxLineLength: lineLength,
                avgLineLength: Math.round(avgLineLength)
            }
        };
    }

    /**
     * Detect documentation style
     */
    detectDocumentationStyle(codeContent) {
        const hasJSDoc = (codeContent.match(/\/\*\*\s*\n[\s\S]*?\*\//g) || []).length;
        const hasDocstrings = (codeContent.match(/""".*?"""/gs) || []).length;
        const hasInlineComments = (codeContent.match(/\/\/|#/g) || []).length;

        if (hasJSDoc || hasDocstrings || hasInlineComments > 5) {
            return {
                id: `pattern_${Date.now()}_documentation`,
                type: 'documentation_style',
                description: 'Documentation approach',
                characteristics: {
                    hasJSDoc: hasJSDoc > 0,
                    hasDocstrings: hasDocstrings > 0,
                    hasInlineComments: hasInlineComments > 5
                }
            };
        }
        return null;
    }

    /**
     * Extract prompt interpretation patterns
     */
    extractPromptInterpretation(codeContent, metadata) {
        const patterns = [];

        if (metadata.originalPrompt) {
            patterns.push({
                id: `pattern_${Date.now()}_interpretation`,
                type: 'prompt_interpretation',
                description: 'How the prompt was interpreted',
                originalPrompt: metadata.originalPrompt,
                codeFeatures: {
                    hasMultipleFiles: metadata.fileCount > 1,
                    hasTests: /test|spec|__tests__/.test(codeContent),
                    hasReadme: metadata.hasReadme,
                    complexity: this.estimateComplexity(codeContent)
                }
            });
        }

        return patterns;
    }

    /**
     * Estimate code complexity
     */
    estimateComplexity(codeContent) {
        const lines = codeContent.split('\n').length;
        const functions = (codeContent.match(/(?:function|def|const\s+\w+\s*=\s*(?:async\s*)?\()/g) || []).length;
        const classes = (codeContent.match(/class\s+/g) || []).length;
        const conditionals = (codeContent.match(/if\s*\(|switch\s*\(/g) || []).length;

        if (lines < 50 && functions < 3) return 'simple';
        if (lines < 200 && functions < 10) return 'moderate';
        return 'complex';
    }

    /**
     * Calculate confidence score for a pattern
     */
    calculateConfidence(pattern, codeContent) {
        let confidence = 0.5; // Base confidence

        // Increase confidence based on pattern characteristics
        if (pattern.examples && pattern.examples.length > 0) confidence += 0.2;
        if (pattern.characteristics && Object.keys(pattern.characteristics).length > 0) confidence += 0.2;
        if (pattern.description && pattern.description.length > 20) confidence += 0.1;

        return Math.min(confidence, 1.0);
    }

    /**
     * Cluster similar patterns
     */
    clusterPatterns(patterns) {
        const clusters = {
            architectural: [],
            problemSolving: [],
            reasoning: [],
            style: []
        };

        for (const pattern of patterns) {
            if (pattern.type.includes('structure') || pattern.type.includes('hierarchy') || pattern.type.includes('organization')) {
                clusters.architectural.push(pattern);
            } else if (pattern.type.includes('breakdown') || pattern.type.includes('error') || pattern.type.includes('data')) {
                clusters.problemSolving.push(pattern);
            } else if (pattern.type.includes('reasoning') || pattern.type.includes('comment') || pattern.type.includes('decision')) {
                clusters.reasoning.push(pattern);
            } else if (pattern.type.includes('naming') || pattern.type.includes('formatting') || pattern.type.includes('documentation')) {
                clusters.style.push(pattern);
            }
        }

        return clusters;
    }

    /**
     * Analyze all Opus examples in directory
     */
    async analyzeOpusExamples() {
        if (!this.opusExamplesPath) {
            return { patterns: [], error: 'Opus examples path not set' };
        }

        try {
            const files = await fs.readdir(this.opusExamplesPath);
            const allPatterns = [];

            for (const file of files) {
                const filePath = path.join(this.opusExamplesPath, file);
                const stats = await fs.stat(filePath);

                if (stats.isFile()) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const patterns = await this.extractPatterns(content, {
                        fileName: file,
                        fileCount: 1,
                        hasReadme: false
                    });

                    allPatterns.push({
                        source: file,
                        patterns
                    });
                }
            }

            return { patterns: allPatterns, success: true };
        } catch (error) {
            return { patterns: [], error: error.message };
        }
    }
}

module.exports = MirrorPatternExtractor;
