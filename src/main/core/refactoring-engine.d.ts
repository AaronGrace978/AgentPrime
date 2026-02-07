/**
 * AgentPrime - AI-Powered Refactoring Engine
 * Intelligent code refactoring with safety guarantees
 */
/**
 * Refactoring type
 */
export type RefactoringType = 'extract-function' | 'extract-method' | 'rename-symbol' | 'move-code' | 'convert-async' | 'simplify-expression' | 'remove-dead-code' | 'inline-variable' | 'extract-variable';
/**
 * Refactoring request
 */
export interface RefactoringRequest {
    type: RefactoringType;
    filePath: string;
    selection?: {
        startLine: number;
        endLine: number;
        startColumn?: number;
        endColumn?: number;
    };
    target?: string;
    workspacePath: string;
}
/**
 * Refactoring result
 */
export interface RefactoringResult {
    success: boolean;
    changes: RefactoringChange[];
    preview: string;
    safetyScore: number;
    warnings: string[];
    errors: string[];
}
/**
 * Refactoring change
 */
export interface RefactoringChange {
    filePath: string;
    type: 'modified' | 'created' | 'deleted';
    diff: string;
    oldContent: string;
    newContent: string;
}
/**
 * Refactoring Engine - AI-powered refactoring with safety
 */
export declare class RefactoringEngine {
    private coordinator;
    private orchestrator;
    /**
     * Perform refactoring with safety checks
     */
    refactor(request: RefactoringRequest): Promise<RefactoringResult>;
    /**
     * Extract function/method
     */
    extractFunction(filePath: string, selection: {
        startLine: number;
        endLine: number;
    }, functionName: string, workspacePath: string): Promise<RefactoringResult>;
    /**
     * Rename symbol with references
     */
    renameSymbol(filePath: string, symbolName: string, newName: string, workspacePath: string): Promise<RefactoringResult>;
    /**
     * Move code between files
     */
    moveCode(sourceFile: string, selection: {
        startLine: number;
        endLine: number;
    }, targetFile: string, workspacePath: string): Promise<RefactoringResult>;
    /**
     * Convert to async/await
     */
    convertToAsync(filePath: string, selection: {
        startLine: number;
        endLine: number;
    }, workspacePath: string): Promise<RefactoringResult>;
    /**
     * Perform safety checks before refactoring
     */
    private performSafetyChecks;
    /**
     * Build refactoring plan
     */
    private buildRefactoringPlan;
    /**
     * Execute refactoring using specialized agents
     */
    private executeRefactoring;
    /**
     * Validate refactoring changes
     */
    private validateChanges;
    /**
     * Find symbol references across codebase
     */
    private findSymbolReferences;
    /**
     * Search files manually for symbol
     */
    private searchFilesManually;
    /**
     * Check syntax of code
     */
    private checkSyntax;
    /**
     * Check imports
     */
    private checkImports;
    /**
     * Check references
     */
    private checkReferences;
    /**
     * Generate diff preview
     */
    private generatePreview;
    /**
     * Generate diff between old and new content
     */
    private generateDiff;
    /**
     * Build refactoring task description
     */
    private buildRefactoringTask;
    /**
     * Get selected content
     */
    private getSelectedContent;
    /**
     * Get original content (from git or backup)
     */
    private getOriginalContent;
    /**
     * Get symbol name from request
     */
    private getSymbolName;
    /**
     * Estimate risk of refactoring
     */
    private estimateRisk;
    /**
     * Resolve import path
     */
    private resolveImportPath;
    /**
     * Should skip directory
     */
    private shouldSkipDirectory;
    /**
     * Should search file
     */
    private shouldSearchFile;
}
export declare function getRefactoringEngine(): RefactoringEngine;
//# sourceMappingURL=refactoring-engine.d.ts.map