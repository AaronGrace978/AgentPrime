/**
 * AgentPrime Codebase Indexer
 * Parses project files to build a symbol index for intelligent code navigation
 */

const fs = require('fs').promises;
const path = require('path');

class CodebaseIndexer {
    constructor(workspacePath) {
        this.workspacePath = workspacePath;
        this.index = {
            files: new Map(),      // filePath -> FileInfo
            symbols: new Map(),    // symbolName -> [SymbolInfo]
            imports: new Map(),    // filePath -> [imports]
            exports: new Map(),    // filePath -> [exports]
            dependencies: new Map(), // filePath -> [dependentFiles]
            embeddings: new Map()   // filePath -> embedding vector
        };
        this.vectorStore = new Map(); // For semantic search - stores code chunks with embeddings
        this.fileWatcher = null;
        this.isIndexing = false;
        this.lastIndexTime = null;
        this.embeddingModel = null; // Will be set if embedding service available
        
        // File patterns to index
        this.includePatterns = [
            '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', 
            '.rs', '.cpp', '.c', '.h', '.hpp', '.cs', '.rb', '.php',
            '.vue', '.svelte', '.astro'
        ];
        
        // Directories to skip
        this.excludeDirs = [
            'node_modules', '.git', 'dist', 'build', '__pycache__',
            '.next', '.nuxt', 'vendor', 'venv', '.venv', 'env',
            'coverage', '.cache', 'tmp', 'temp'
        ];
    }

    /**
     * Build complete index of the workspace
     */
    async buildIndex() {
        if (this.isIndexing) {
            return { status: 'already_indexing' };
        }

        this.isIndexing = true;
        const startTime = Date.now();
        
        try {
            // Clear existing index
            this.index.files.clear();
            this.index.symbols.clear();
            this.index.imports.clear();
            this.index.exports.clear();
            this.index.dependencies.clear();
            this.index.embeddings.clear();
            this.vectorStore.clear();

            // Recursively find and index all files
            await this.indexDirectory(this.workspacePath);
            
            // Build dependency graph
            this.buildDependencyGraph();
            
            // Generate embeddings for semantic search (async, non-blocking)
            this.generateEmbeddings().catch(err => {
                console.warn('[CodebaseIndexer] Embedding generation failed:', err.message);
            });
            
            this.lastIndexTime = Date.now();
            const duration = this.lastIndexTime - startTime;
            
            return {
                status: 'complete',
                filesIndexed: this.index.files.size,
                symbolsFound: this.index.symbols.size,
                duration
            };
        } finally {
            this.isIndexing = false;
        }
    }

    /**
     * Recursively index a directory
     */
    async indexDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(this.workspacePath, fullPath);
                
                if (entry.isDirectory()) {
                    // Skip excluded directories
                    if (!this.excludeDirs.includes(entry.name)) {
                        await this.indexDirectory(fullPath);
                    }
                } else if (entry.isFile()) {
                    // Check if file should be indexed
                    const ext = path.extname(entry.name).toLowerCase();
                    if (this.includePatterns.includes(ext)) {
                        await this.indexFile(fullPath, relativePath);
                    }
                }
            }
        } catch (error) {
            // Directory might not exist or be inaccessible
            console.error(`Error indexing directory ${dirPath}:`, error.message);
        }
    }

    /**
     * Index a single file
     */
    async indexFile(fullPath, relativePath) {
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const ext = path.extname(fullPath).toLowerCase();
            const stats = await fs.stat(fullPath);
            
            // Store file info
            const fileInfo = {
                path: relativePath,
                fullPath,
                size: stats.size,
                modified: stats.mtime,
                language: this.getLanguage(ext),
                lineCount: content.split('\n').length
            };
            this.index.files.set(relativePath, fileInfo);
            
            // Parse based on language
            const parser = this.getParser(ext);
            if (parser) {
                const parseResult = parser(content, relativePath);
                
                // Store symbols
                for (const symbol of parseResult.symbols) {
                    if (!this.index.symbols.has(symbol.name)) {
                        this.index.symbols.set(symbol.name, []);
                    }
                    this.index.symbols.get(symbol.name).push({
                        ...symbol,
                        file: relativePath
                    });
                }
                
                // Store imports/exports
                this.index.imports.set(relativePath, parseResult.imports);
                this.index.exports.set(relativePath, parseResult.exports);
            }
        } catch (error) {
            console.error(`Error indexing file ${relativePath}:`, error.message);
        }
    }

    /**
     * Update index for a single file (incremental)
     */
    async updateFile(relativePath) {
        const fullPath = path.join(this.workspacePath, relativePath);
        
        // Remove old symbols for this file
        for (const [symbolName, locations] of this.index.symbols) {
            const filtered = locations.filter(loc => loc.file !== relativePath);
            if (filtered.length === 0) {
                this.index.symbols.delete(symbolName);
            } else {
                this.index.symbols.set(symbolName, filtered);
            }
        }
        
        // Re-index the file
        try {
            await fs.access(fullPath);
            await this.indexFile(fullPath, relativePath);
        } catch {
            // File was deleted
            this.index.files.delete(relativePath);
            this.index.imports.delete(relativePath);
            this.index.exports.delete(relativePath);
        }
        
        // Rebuild dependency graph
        this.buildDependencyGraph();
    }

    /**
     * Get language from file extension
     */
    getLanguage(ext) {
        const langMap = {
            '.js': 'javascript', '.jsx': 'javascriptreact',
            '.ts': 'typescript', '.tsx': 'typescriptreact',
            '.py': 'python', '.java': 'java', '.go': 'go',
            '.rs': 'rust', '.cpp': 'cpp', '.c': 'c',
            '.h': 'c', '.hpp': 'cpp', '.cs': 'csharp',
            '.rb': 'ruby', '.php': 'php', '.vue': 'vue',
            '.svelte': 'svelte', '.astro': 'astro'
        };
        return langMap[ext] || 'plaintext';
    }

    /**
     * Get parser function for file type
     */
    getParser(ext) {
        const parsers = {
            '.js': this.parseJavaScript.bind(this),
            '.jsx': this.parseJavaScript.bind(this),
            '.ts': this.parseTypeScript.bind(this),
            '.tsx': this.parseTypeScript.bind(this),
            '.py': this.parsePython.bind(this),
            '.go': this.parseGo.bind(this),
            '.java': this.parseJava.bind(this),
            '.rs': this.parseRust.bind(this),
            '.c': this.parseC.bind(this),
            '.cpp': this.parseC.bind(this),
            '.h': this.parseC.bind(this),
            '.hpp': this.parseC.bind(this)
        };
        return parsers[ext];
    }

    /**
     * Parse JavaScript/JSX files
     */
    parseJavaScript(content, filePath) {
        const symbols = [];
        const imports = [];
        const exports = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Functions: function name(), async function name()
            const funcMatch = line.match(/(?:async\s+)?function\s+(\w+)\s*\(/);
            if (funcMatch) {
                symbols.push({ name: funcMatch[1], type: 'function', line: lineNum });
            }

            // Arrow functions: const name = () => or const name = async () =>
            const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
            if (arrowMatch) {
                symbols.push({ name: arrowMatch[1], type: 'function', line: lineNum });
            }

            // Classes: class Name
            const classMatch = line.match(/class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/);
            if (classMatch) {
                symbols.push({ name: classMatch[1], type: 'class', line: lineNum });
            }

            // Methods: methodName() { or async methodName() {
            const methodMatch = line.match(/^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/);
            if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
                symbols.push({ name: methodMatch[1], type: 'method', line: lineNum });
            }

            // Imports
            const importMatch = line.match(/import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/);
            if (importMatch) {
                imports.push({ module: importMatch[1], line: lineNum });
            }
            const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
            if (requireMatch) {
                imports.push({ module: requireMatch[1], line: lineNum });
            }

            // Exports
            const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/);
            if (exportMatch) {
                exports.push({ name: exportMatch[1], line: lineNum });
            }
            const moduleExports = line.match(/module\.exports\s*=\s*(\w+)/);
            if (moduleExports) {
                exports.push({ name: moduleExports[1], line: lineNum });
            }
        }

        return { symbols, imports, exports };
    }

    /**
     * Parse TypeScript/TSX files (extends JS parsing)
     */
    parseTypeScript(content, filePath) {
        const result = this.parseJavaScript(content, filePath);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Interfaces: interface Name
            const interfaceMatch = line.match(/interface\s+(\w+)/);
            if (interfaceMatch) {
                result.symbols.push({ name: interfaceMatch[1], type: 'interface', line: lineNum });
            }

            // Type aliases: type Name =
            const typeMatch = line.match(/type\s+(\w+)\s*=/);
            if (typeMatch) {
                result.symbols.push({ name: typeMatch[1], type: 'type', line: lineNum });
            }

            // Enums: enum Name
            const enumMatch = line.match(/enum\s+(\w+)/);
            if (enumMatch) {
                result.symbols.push({ name: enumMatch[1], type: 'enum', line: lineNum });
            }
        }

        return result;
    }

    /**
     * Parse Python files
     */
    parsePython(content, filePath) {
        const symbols = [];
        const imports = [];
        const exports = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Functions: def name(
            const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
            if (funcMatch) {
                symbols.push({ name: funcMatch[1], type: 'function', line: lineNum });
            }

            // Classes: class Name
            const classMatch = line.match(/^class\s+(\w+)/);
            if (classMatch) {
                symbols.push({ name: classMatch[1], type: 'class', line: lineNum });
            }

            // Methods (indented def)
            const methodMatch = line.match(/^\s+(?:async\s+)?def\s+(\w+)\s*\(/);
            if (methodMatch) {
                symbols.push({ name: methodMatch[1], type: 'method', line: lineNum });
            }

            // Imports
            const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
            if (importMatch) {
                imports.push({ module: importMatch[1] || importMatch[2], line: lineNum });
            }

            // __all__ exports
            const allMatch = line.match(/__all__\s*=\s*\[([^\]]+)\]/);
            if (allMatch) {
                const exportNames = allMatch[1].match(/['"](\w+)['"]/g);
                if (exportNames) {
                    exportNames.forEach(name => {
                        exports.push({ name: name.replace(/['"]/g, ''), line: lineNum });
                    });
                }
            }
        }

        return { symbols, imports, exports };
    }

    /**
     * Parse Go files
     */
    parseGo(content, filePath) {
        const symbols = [];
        const imports = [];
        const exports = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Functions: func Name(
            const funcMatch = line.match(/^func\s+(\w+)\s*\(/);
            if (funcMatch) {
                const isExported = funcMatch[1][0] === funcMatch[1][0].toUpperCase();
                symbols.push({ name: funcMatch[1], type: 'function', line: lineNum, exported: isExported });
                if (isExported) exports.push({ name: funcMatch[1], line: lineNum });
            }

            // Methods: func (r *Type) Name(
            const methodMatch = line.match(/^func\s+\([^)]+\)\s+(\w+)\s*\(/);
            if (methodMatch) {
                symbols.push({ name: methodMatch[1], type: 'method', line: lineNum });
            }

            // Types: type Name struct/interface
            const typeMatch = line.match(/^type\s+(\w+)\s+(?:struct|interface)/);
            if (typeMatch) {
                const isExported = typeMatch[1][0] === typeMatch[1][0].toUpperCase();
                symbols.push({ name: typeMatch[1], type: 'type', line: lineNum, exported: isExported });
                if (isExported) exports.push({ name: typeMatch[1], line: lineNum });
            }

            // Imports
            const importMatch = line.match(/import\s+(?:\(\s*)?["']([^"']+)["']/);
            if (importMatch) {
                imports.push({ module: importMatch[1], line: lineNum });
            }
        }

        return { symbols, imports, exports };
    }

    /**
     * Parse Java files
     */
    parseJava(content, filePath) {
        const symbols = [];
        const imports = [];
        const exports = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Classes: public class Name
            const classMatch = line.match(/(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/);
            if (classMatch) {
                symbols.push({ name: classMatch[1], type: 'class', line: lineNum });
                exports.push({ name: classMatch[1], line: lineNum });
            }

            // Interfaces: public interface Name
            const interfaceMatch = line.match(/(?:public\s+)?interface\s+(\w+)/);
            if (interfaceMatch) {
                symbols.push({ name: interfaceMatch[1], type: 'interface', line: lineNum });
            }

            // Methods
            const methodMatch = line.match(/(?:public|private|protected)?\s*(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/);
            if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'class', 'interface'].includes(methodMatch[1])) {
                symbols.push({ name: methodMatch[1], type: 'method', line: lineNum });
            }

            // Imports
            const importMatch = line.match(/import\s+([^;]+);/);
            if (importMatch) {
                imports.push({ module: importMatch[1], line: lineNum });
            }
        }

        return { symbols, imports, exports };
    }

    /**
     * Parse Rust files
     */
    parseRust(content, filePath) {
        const symbols = [];
        const imports = [];
        const exports = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Functions: fn name( or pub fn name(
            const funcMatch = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
            if (funcMatch) {
                const isExported = line.includes('pub ');
                symbols.push({ name: funcMatch[1], type: 'function', line: lineNum, exported: isExported });
                if (isExported) exports.push({ name: funcMatch[1], line: lineNum });
            }

            // Structs: struct Name or pub struct Name
            const structMatch = line.match(/(?:pub\s+)?struct\s+(\w+)/);
            if (structMatch) {
                symbols.push({ name: structMatch[1], type: 'struct', line: lineNum });
            }

            // Enums: enum Name or pub enum Name
            const enumMatch = line.match(/(?:pub\s+)?enum\s+(\w+)/);
            if (enumMatch) {
                symbols.push({ name: enumMatch[1], type: 'enum', line: lineNum });
            }

            // Traits: trait Name or pub trait Name
            const traitMatch = line.match(/(?:pub\s+)?trait\s+(\w+)/);
            if (traitMatch) {
                symbols.push({ name: traitMatch[1], type: 'trait', line: lineNum });
            }

            // Imports: use
            const useMatch = line.match(/use\s+([^;]+);/);
            if (useMatch) {
                imports.push({ module: useMatch[1], line: lineNum });
            }
        }

        return { symbols, imports, exports };
    }

    /**
     * Parse C/C++ files
     */
    parseC(content, filePath) {
        const symbols = [];
        const imports = [];
        const exports = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Functions: type name(
            const funcMatch = line.match(/^(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*(?:\{|$)/);
            if (funcMatch && !['if', 'for', 'while', 'switch', 'return'].includes(funcMatch[1])) {
                symbols.push({ name: funcMatch[1], type: 'function', line: lineNum });
            }

            // Structs: struct Name
            const structMatch = line.match(/struct\s+(\w+)/);
            if (structMatch) {
                symbols.push({ name: structMatch[1], type: 'struct', line: lineNum });
            }

            // Classes (C++): class Name
            const classMatch = line.match(/class\s+(\w+)/);
            if (classMatch) {
                symbols.push({ name: classMatch[1], type: 'class', line: lineNum });
            }

            // Includes
            const includeMatch = line.match(/#include\s*[<"]([^>"]+)[>"]/);
            if (includeMatch) {
                imports.push({ module: includeMatch[1], line: lineNum });
            }

            // Defines
            const defineMatch = line.match(/#define\s+(\w+)/);
            if (defineMatch) {
                symbols.push({ name: defineMatch[1], type: 'macro', line: lineNum });
            }
        }

        return { symbols, imports, exports };
    }

    /**
     * Build dependency graph from imports
     */
    buildDependencyGraph() {
        this.index.dependencies.clear();
        
        for (const [filePath, fileImports] of this.index.imports) {
            for (const imp of fileImports) {
                // Try to resolve import to a file in the workspace
                const resolvedPath = this.resolveImport(imp.module, filePath);
                if (resolvedPath && this.index.files.has(resolvedPath)) {
                    if (!this.index.dependencies.has(resolvedPath)) {
                        this.index.dependencies.set(resolvedPath, []);
                    }
                    this.index.dependencies.get(resolvedPath).push(filePath);
                }
            }
        }
    }

    /**
     * Resolve import path to workspace file
     */
    resolveImport(importPath, fromFile) {
        // Handle relative imports
        if (importPath.startsWith('.')) {
            const fromDir = path.dirname(fromFile);
            let resolved = path.normalize(path.join(fromDir, importPath));
            
            // Try common extensions
            const extensions = ['', '.js', '.ts', '.tsx', '.jsx', '/index.js', '/index.ts'];
            for (const ext of extensions) {
                const withExt = resolved + ext;
                if (this.index.files.has(withExt)) {
                    return withExt;
                }
            }
        }
        
        return null;
    }

    /**
     * Search symbols by name (fuzzy)
     */
    searchSymbols(query, limit = 50) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        for (const [symbolName, locations] of this.index.symbols) {
            const nameLower = symbolName.toLowerCase();
            
            // Exact match priority
            if (nameLower === queryLower) {
                results.unshift(...locations.map(loc => ({ ...loc, score: 100 })));
            }
            // Starts with
            else if (nameLower.startsWith(queryLower)) {
                results.push(...locations.map(loc => ({ ...loc, score: 80 })));
            }
            // Contains
            else if (nameLower.includes(queryLower)) {
                results.push(...locations.map(loc => ({ ...loc, score: 60 })));
            }
            // Fuzzy (camelCase matching)
            else if (this.fuzzyMatch(symbolName, query)) {
                results.push(...locations.map(loc => ({ ...loc, score: 40 })));
            }
        }
        
        // Sort by score and limit
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Fuzzy match for camelCase/snake_case
     */
    fuzzyMatch(symbolName, query) {
        const queryChars = query.toLowerCase().split('');
        const symbolLower = symbolName.toLowerCase();
        let symbolIdx = 0;
        
        for (const char of queryChars) {
            const found = symbolLower.indexOf(char, symbolIdx);
            if (found === -1) return false;
            symbolIdx = found + 1;
        }
        
        return true;
    }

    /**
     * Search files by name
     */
    searchFiles(query, limit = 50) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        for (const [filePath, fileInfo] of this.index.files) {
            const fileName = path.basename(filePath).toLowerCase();
            const pathLower = filePath.toLowerCase();
            
            if (fileName === queryLower) {
                results.unshift({ ...fileInfo, score: 100 });
            } else if (fileName.startsWith(queryLower)) {
                results.push({ ...fileInfo, score: 80 });
            } else if (fileName.includes(queryLower)) {
                results.push({ ...fileInfo, score: 60 });
            } else if (pathLower.includes(queryLower)) {
                results.push({ ...fileInfo, score: 40 });
            }
        }
        
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Get all symbols in a file
     */
    getFileSymbols(filePath) {
        const symbols = [];
        for (const [symbolName, locations] of this.index.symbols) {
            for (const loc of locations) {
                if (loc.file === filePath) {
                    symbols.push({ name: symbolName, ...loc });
                }
            }
        }
        return symbols.sort((a, b) => a.line - b.line);
    }

    /**
     * Get files that depend on a given file
     */
    getDependents(filePath) {
        return this.index.dependencies.get(filePath) || [];
    }

    /**
     * Get files that a given file imports from
     */
    getDependencies(filePath) {
        const imports = this.index.imports.get(filePath) || [];
        const deps = [];
        
        for (const imp of imports) {
            const resolved = this.resolveImport(imp.module, filePath);
            if (resolved) {
                deps.push({ path: resolved, module: imp.module });
            }
        }
        
        return deps;
    }

    /**
     * Get related files (imports + dependents)
     */
    getRelatedFiles(filePath, depth = 1) {
        const related = new Set();
        const toProcess = [{ path: filePath, currentDepth: 0 }];
        
        while (toProcess.length > 0) {
            const { path: currentPath, currentDepth } = toProcess.shift();
            
            if (currentDepth >= depth) continue;
            
            // Add dependencies
            for (const dep of this.getDependencies(currentPath)) {
                if (!related.has(dep.path)) {
                    related.add(dep.path);
                    toProcess.push({ path: dep.path, currentDepth: currentDepth + 1 });
                }
            }
            
            // Add dependents
            for (const dependent of this.getDependents(currentPath)) {
                if (!related.has(dependent)) {
                    related.add(dependent);
                    toProcess.push({ path: dependent, currentDepth: currentDepth + 1 });
                }
            }
        }
        
        return Array.from(related);
    }

    /**
     * Get index statistics
     */
    getStats() {
        const symbolTypes = {};
        for (const [, locations] of this.index.symbols) {
            for (const loc of locations) {
                symbolTypes[loc.type] = (symbolTypes[loc.type] || 0) + 1;
            }
        }
        
        return {
            files: this.index.files.size,
            symbols: this.index.symbols.size,
            symbolTypes,
            lastIndexTime: this.lastIndexTime,
            isIndexing: this.isIndexing
        };
    }

    /**
     * Get context for AI (symbols + related files for a given file)
     */
    getAIContext(filePath, maxTokens = 4000) {
        const context = {
            currentFile: filePath,
            symbols: this.getFileSymbols(filePath),
            imports: this.index.imports.get(filePath) || [],
            exports: this.index.exports.get(filePath) || [],
            relatedFiles: this.getRelatedFiles(filePath, 1),
            projectStructure: this.getProjectStructure()
        };
        
        return context;
    }

    /**
     * Find files by query (enhanced search with relevance scoring)
     */
    findFilesByQuery(query, limit = 20) {
        const queryLower = query.toLowerCase();
        const results = [];
        
        // Split query into terms
        const terms = queryLower.split(/\s+/).filter(t => t.length > 2);
        
        for (const [filePath, fileInfo] of this.index.files) {
            const fileName = path.basename(filePath).toLowerCase();
            const pathLower = filePath.toLowerCase();
            let score = 0;
            
            // Exact filename match
            if (fileName === queryLower) {
                score = 100;
            }
            // Filename starts with query
            else if (fileName.startsWith(queryLower)) {
                score = 90;
            }
            // Filename contains query
            else if (fileName.includes(queryLower)) {
                score = 70;
            }
            // Path contains query
            else if (pathLower.includes(queryLower)) {
                score = 50;
            }
            
            // Multi-term matching
            if (terms.length > 1) {
                let termMatches = 0;
                for (const term of terms) {
                    if (fileName.includes(term) || pathLower.includes(term)) {
                        termMatches++;
                    }
                }
                if (termMatches > 0) {
                    score = Math.max(score, termMatches * 15);
                }
            }
            
            if (score > 0) {
                results.push({
                    ...fileInfo,
                    score,
                    path: filePath
                });
            }
        }
        
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Find symbols by query
     */
    findSymbolsByQuery(query, limit = 20) {
        const queryLower = query.toLowerCase();
        const results = [];
        
        for (const [symbolName, locations] of this.index.symbols) {
            const nameLower = symbolName.toLowerCase();
            let score = 0;
            
            // Exact match
            if (nameLower === queryLower) {
                score = 100;
            }
            // Starts with
            else if (nameLower.startsWith(queryLower)) {
                score = 80;
            }
            // Contains
            else if (nameLower.includes(queryLower)) {
                score = 60;
            }
            // Fuzzy match
            else if (this.fuzzyMatch(symbolName, query)) {
                score = 40;
            }
            
            if (score > 0) {
                for (const loc of locations) {
                    results.push({
                        ...loc,
                        name: symbolName,
                        score
                    });
                }
            }
        }
        
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Get folder context (all files in folder with summaries)
     */
    getFolderContext(folderPath) {
        const files = [];
        const folderPathLower = folderPath.toLowerCase().replace(/\\/g, '/');
        
        for (const [filePath, fileInfo] of this.index.files) {
            const filePathLower = filePath.toLowerCase().replace(/\\/g, '/');
            
            // Check if file is in the folder
            if (filePathLower.startsWith(folderPathLower + '/') || 
                filePathLower === folderPathLower) {
                files.push({
                    path: filePath,
                    name: path.basename(filePath),
                    size: fileInfo.size,
                    language: fileInfo.language,
                    lineCount: fileInfo.lineCount,
                    modified: fileInfo.modified
                });
            }
        }
        
        return {
            path: folderPath,
            fileCount: files.length,
            files: files.sort((a, b) => a.path.localeCompare(b.path))
        };
    }

    /**
     * Get related files for a query
     */
    getRelatedFilesForQuery(query, currentFilePath = null) {
        const relatedFiles = new Set();
        
        // Find files matching query
        const matchingFiles = this.findFilesByQuery(query, 10);
        for (const file of matchingFiles) {
            relatedFiles.add(file.path);
            
            // Get dependencies of matching files
            if (this.options?.includeDependencies !== false) {
                const deps = this.getDependencies(file.path);
                for (const dep of deps) {
                    relatedFiles.add(dep.path);
                }
                
                const dependents = this.getDependents(file.path);
                for (const dependent of dependents) {
                    relatedFiles.add(dependent);
                }
            }
        }
        
        // If current file exists, include its related files
        if (currentFilePath && this.index.files.has(currentFilePath)) {
            const related = this.getRelatedFiles(currentFilePath, 1);
            for (const relPath of related) {
                relatedFiles.add(relPath);
            }
        }
        
        return Array.from(relatedFiles);
    }

    /**
     * Get high-level project structure
     */
    getProjectStructure() {
        const structure = {};
        
        for (const [filePath] of this.index.files) {
            const parts = filePath.split(path.sep);
            let current = structure;
            
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            
            const fileName = parts[parts.length - 1];
            current[fileName] = 'file';
        }
        
        return structure;
    }

    /**
     * Generate embeddings for code chunks (for semantic search)
     * Uses simple TF-IDF-like approach if no embedding service available
     */
    async generateEmbeddings() {
        console.log('[CodebaseIndexer] Generating embeddings for semantic search...');
        let chunksIndexed = 0;
        
        for (const [filePath, fileInfo] of this.index.files) {
            try {
                // Read file content
                const content = await fs.readFile(filePath, 'utf-8');
                
                // Split into code chunks (functions, classes, etc.)
                const chunks = this.extractCodeChunks(content, fileInfo.language);
                
                for (const chunk of chunks) {
                    // Generate embedding (simple hash-based for now, can be replaced with real embeddings)
                    const embedding = this.generateSimpleEmbedding(chunk.code, chunk.context);
                    
                    // Store in vector store
                    const chunkId = `${filePath}:${chunk.startLine}:${chunk.endLine}`;
                    this.vectorStore.set(chunkId, {
                        id: chunkId,
                        filePath,
                        code: chunk.code,
                        context: chunk.context,
                        embedding,
                        startLine: chunk.startLine,
                        endLine: chunk.endLine,
                        type: chunk.type,
                        name: chunk.name
                    });
                    
                    chunksIndexed++;
                }
            } catch (err) {
                // Skip files that can't be read
                continue;
            }
        }
        
        console.log(`[CodebaseIndexer] Generated embeddings for ${chunksIndexed} code chunks`);
        return { chunksIndexed };
    }
    
    /**
     * Extract code chunks (functions, classes, etc.) from file content
     */
    extractCodeChunks(content, language) {
        const chunks = [];
        const lines = content.split('\n');
        
        // Simple pattern matching for common structures
        const patterns = {
            'function': /^(export\s+)?(async\s+)?function\s+(\w+)/,
            'class': /^(export\s+)?class\s+(\w+)/,
            'method': /^\s*(async\s+)?(\w+)\s*\(/,
            'interface': /^(export\s+)?interface\s+(\w+)/,
            'type': /^(export\s+)?type\s+(\w+)/,
        };
        
        let currentChunk = null;
        let braceDepth = 0;
        let inChunk = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check for chunk start
            for (const [type, pattern] of Object.entries(patterns)) {
                const match = line.match(pattern);
                if (match && !inChunk) {
                    if (currentChunk) {
                        chunks.push(currentChunk);
                    }
                    currentChunk = {
                        type,
                        name: match[2] || match[3] || 'anonymous',
                        startLine: i + 1,
                        endLine: i + 1,
                        code: line,
                        context: this.getContextLines(lines, i, 3)
                    };
                    inChunk = true;
                    braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                    break;
                }
            }
            
            if (inChunk && currentChunk) {
                currentChunk.code += '\n' + line;
                currentChunk.endLine = i + 1;
                
                // Track braces to detect end of chunk
                braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                
                if (braceDepth <= 0 && line.trim().endsWith('}')) {
                    chunks.push(currentChunk);
                    currentChunk = null;
                    inChunk = false;
                    braceDepth = 0;
                }
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        // If no chunks found, create one for the whole file
        if (chunks.length === 0) {
            chunks.push({
                type: 'file',
                name: 'file',
                startLine: 1,
                endLine: lines.length,
                code: content.substring(0, 1000), // Limit size
                context: []
            });
        }
        
        return chunks;
    }
    
    /**
     * Get context lines around a position
     */
    getContextLines(lines, centerLine, contextSize) {
        const start = Math.max(0, centerLine - contextSize);
        const end = Math.min(lines.length, centerLine + contextSize + 1);
        return lines.slice(start, end).join('\n');
    }
    
    /**
     * Generate simple embedding vector (TF-IDF-like)
     * Can be replaced with real embedding service (OpenAI, Sentence Transformers, etc.)
     */
    generateSimpleEmbedding(code, context) {
        // Simple bag-of-words approach with normalization
        const text = (code + ' ' + context).toLowerCase();
        const words = text.match(/\b\w+\b/g) || [];
        const wordFreq = new Map();
        
        for (const word of words) {
            if (word.length > 2) { // Skip very short words
                wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
            }
        }
        
        // Create normalized vector (simple hash-based)
        const vector = [];
        const sortedWords = Array.from(wordFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 100); // Top 100 words
        
        for (const [word, freq] of sortedWords) {
            // Simple hash to create consistent vector dimension
            const hash = this.simpleHash(word);
            const index = hash % 128; // 128-dimensional vector
            vector[index] = (vector[index] || 0) + freq;
        }
        
        // Normalize vector
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + (val || 0) ** 2, 0));
        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] = (vector[i] || 0) / magnitude;
            }
        }
        
        // Pad to 128 dimensions
        while (vector.length < 128) {
            vector.push(0);
        }
        
        return vector.slice(0, 128);
    }
    
    /**
     * Simple hash function
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    
    /**
     * Semantic search using vector similarity
     */
    semanticSearch(query, limit = 10) {
        if (this.vectorStore.size === 0) {
            return [];
        }
        
        // Generate query embedding
        const queryEmbedding = this.generateSimpleEmbedding(query, '');
        
        // Calculate cosine similarity with all chunks
        const results = [];
        for (const [chunkId, chunk] of this.vectorStore) {
            const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
            if (similarity > 0.1) { // Threshold
                results.push({
                    ...chunk,
                    similarity,
                    score: similarity * 100
                });
            }
        }
        
        // Sort by similarity and return top results
        return results
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }
    
    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
            return 0;
        }
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < vecA.length; i++) {
            const a = vecA[i] || 0;
            const b = vecB[i] || 0;
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }
        
        if (normA === 0 || normB === 0) {
            return 0;
        }
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    
    /**
     * Get similar code chunks for a given code snippet
     */
    findSimilarCode(codeSnippet, limit = 5) {
        return this.semanticSearch(codeSnippet, limit);
    }

    /**
     * Serialize index for persistence
     */
    serialize() {
        return {
            files: Array.from(this.index.files.entries()),
            symbols: Array.from(this.index.symbols.entries()),
            imports: Array.from(this.index.imports.entries()),
            exports: Array.from(this.index.exports.entries()),
            embeddings: Array.from(this.index.embeddings.entries()),
            lastIndexTime: this.lastIndexTime
        };
    }

    /**
     * Restore index from serialized data
     */
    deserialize(data) {
        this.index.files = new Map(data.files);
        this.index.symbols = new Map(data.symbols);
        this.index.imports = new Map(data.imports);
        this.index.exports = new Map(data.exports);
        if (data.embeddings) {
            this.index.embeddings = new Map(data.embeddings);
        }
        this.lastIndexTime = data.lastIndexTime;
        this.buildDependencyGraph();
        
        // Regenerate embeddings if needed
        if (this.vectorStore.size === 0 && this.index.files.size > 0) {
            this.generateEmbeddings().catch(err => {
                console.warn('[CodebaseIndexer] Embedding regeneration failed:', err.message);
            });
        }
    }
}

module.exports = CodebaseIndexer;
