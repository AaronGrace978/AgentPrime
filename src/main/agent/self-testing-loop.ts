/**
 * Self-Testing Learning Loop
 * 
 * Closes the feedback loop between project creation and learning:
 * 1. After agent creates a project, run it with ProjectRunner
 * 2. Capture success/failure and errors
 * 3. Store patterns based on results:
 *    - Success → Store patterns with high confidence
 *    - Failure → Store errors as anti-patterns
 * 
 * This is Phase 2 of the AgentPrime Evolution Roadmap:
 * "AgentPrime creates projects but doesn't know if they actually work.
 *  Add self-testing to close the loop."
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectRunner, ProjectInfo } from './tools/projectRunner';
import { storeTaskLearning, getRelevantPatterns } from '../mirror/mirror-singleton';

/**
 * Result of a self-test run
 */
export interface SelfTestResult {
  success: boolean;
  projectInfo: ProjectInfo;
  installSuccess: boolean;
  runSuccess: boolean;
  errors: string[];
  warnings: string[];
  patternsExtracted: ExtractedPattern[];
  learningStored: boolean;
  duration: number;
}

/**
 * Pattern extracted from a successful project
 */
export interface ExtractedPattern {
  id: string;
  type: 'structure' | 'technique' | 'architecture' | 'error-handling';
  description: string;
  confidence: number;
  source: string;
  code?: string;
}

/**
 * Self-Testing Learning Loop
 * 
 * Wire this into the agent after task completion to:
 * 1. Test the created project
 * 2. Learn from the results
 * 3. Improve future outputs
 */
export class SelfTestingLoop {
  private workspacePath: string;
  private task: string;
  private verbose: boolean;
  
  constructor(workspacePath: string, task: string, verbose: boolean = true) {
    this.workspacePath = workspacePath;
    this.task = task;
    this.verbose = verbose;
  }
  
  /**
   * Run the complete self-testing loop
   */
  async run(): Promise<SelfTestResult> {
    const startTime = Date.now();
    const result: SelfTestResult = {
      success: false,
      projectInfo: {
        type: 'unknown',
        kind: 'unknown',
        displayName: 'Unknown Project',
        hasPackageJson: false,
        hasRequirements: false,
        hasIndexHtml: false,
        requiresInstall: false,
        readinessSummary: 'Project type not detected yet.',
      },
      installSuccess: false,
      runSuccess: false,
      errors: [],
      warnings: [],
      patternsExtracted: [],
      learningStored: false,
      duration: 0
    };
    
    try {
      this.log('🧪 Starting self-testing loop...');
      
      // Step 1: Detect and validate project
      this.log('📁 Detecting project type...');
      result.projectInfo = await ProjectRunner.detectProject(this.workspacePath);
      this.log(`   Detected: ${result.projectInfo.type} project`);
      
      if (result.projectInfo.type === 'unknown') {
        result.errors.push('Could not detect project type');
        result.warnings.push('No package.json, requirements.txt, or index.html found');
        await this.storeFailureLearning(result.errors);
        result.duration = Date.now() - startTime;
        return result;
      }
      
      // Step 2: Validate structure
      this.log('✅ Validating project structure...');
      const validation = await ProjectRunner.validateProject(this.workspacePath, result.projectInfo);
      
      if (!validation.valid) {
        result.errors.push(...validation.issues);
        this.log(`   ❌ Validation failed: ${validation.issues.join(', ')}`);
      }
      
      // Step 3: Install dependencies
      if (result.projectInfo.type !== 'html') {
        this.log('📦 Installing dependencies...');
        const installResult = await ProjectRunner.installDependencies(this.workspacePath, result.projectInfo);
        result.installSuccess = installResult.success;
        
        if (!installResult.success) {
          result.errors.push(`Dependency installation failed: ${installResult.output}`);
          this.log(`   ❌ Install failed: ${installResult.output.substring(0, 200)}`);
        } else {
          this.log('   ✅ Dependencies installed');
        }
      } else {
        result.installSuccess = true; // HTML projects don't need install
      }
      
      // Step 4: Try to run the project
      if (result.projectInfo.startCommand && result.installSuccess) {
        this.log(`🚀 Running project: ${result.projectInfo.startCommand}`);
        
        try {
          const runResult = await ProjectRunner.runProject(this.workspacePath, result.projectInfo);
          result.runSuccess = runResult.success;
          
          if (!runResult.success) {
            result.errors.push(`Run failed: ${runResult.output}`);
            this.log(`   ❌ Run failed: ${runResult.output.substring(0, 200)}`);
            
            // Parse common errors
            const parsedErrors = this.parseErrors(runResult.output);
            result.errors.push(...parsedErrors);
          } else {
            this.log(`   ✅ Project running${runResult.port ? ` on port ${runResult.port}` : ''}`);
          }
        } catch (runError: any) {
          result.errors.push(`Runtime error: ${runError.message}`);
        }
      } else if (!result.projectInfo.startCommand) {
        result.warnings.push('No start command found');
      }
      
      // Step 5: Determine overall success
      result.success = result.installSuccess && (result.runSuccess || result.projectInfo.type === 'html');
      
      // Step 6: Extract patterns from successful project
      if (result.success) {
        this.log('🧠 Extracting patterns from successful project...');
        result.patternsExtracted = await this.extractPatterns();
        this.log(`   Found ${result.patternsExtracted.length} patterns`);
      }
      
      // Step 7: Store learning
      this.log('💾 Storing learning...');
      if (result.success) {
        await this.storeSuccessLearning(result.patternsExtracted);
      } else {
        await this.storeFailureLearning(result.errors);
      }
      result.learningStored = true;
      
      // Summary
      result.duration = Date.now() - startTime;
      this.logSummary(result);
      
    } catch (error: any) {
      result.errors.push(`Self-test error: ${error.message}`);
      result.duration = Date.now() - startTime;
      console.error('[SelfTest] Unexpected error:', error);
    }
    
    return result;
  }
  
  /**
   * Parse error output to extract specific issues
   */
  private parseErrors(output: string): string[] {
    const errors: string[] = [];
    const outputLower = output.toLowerCase();
    
    // Common Node.js errors
    if (outputLower.includes('cannot find module')) {
      const match = output.match(/Cannot find module ['"]([^'"]+)['"]/);
      if (match) {
        errors.push(`Missing module: ${match[1]}`);
      }
    }
    
    if (outputLower.includes('syntaxerror')) {
      const match = output.match(/SyntaxError: ([^\n]+)/);
      if (match) {
        errors.push(`Syntax error: ${match[1]}`);
      }
    }
    
    if (outputLower.includes('typeerror')) {
      const match = output.match(/TypeError: ([^\n]+)/);
      if (match) {
        errors.push(`Type error: ${match[1]}`);
      }
    }
    
    if (outputLower.includes('referenceerror')) {
      const match = output.match(/ReferenceError: ([^\n]+)/);
      if (match) {
        errors.push(`Reference error: ${match[1]}`);
      }
    }
    
    if (outputLower.includes('eaddrinuse')) {
      errors.push('Port already in use');
    }
    
    // Python errors
    if (outputLower.includes('modulenotfounderror')) {
      const match = output.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/);
      if (match) {
        errors.push(`Missing Python module: ${match[1]}`);
      }
    }
    
    if (outputLower.includes('importerror')) {
      const match = output.match(/ImportError: ([^\n]+)/);
      if (match) {
        errors.push(`Import error: ${match[1]}`);
      }
    }
    
    if (outputLower.includes('indentationerror')) {
      errors.push('Python indentation error');
    }
    
    return errors;
  }
  
  /**
   * Extract patterns from a successful project
   */
  private async extractPatterns(): Promise<ExtractedPattern[]> {
    const patterns: ExtractedPattern[] = [];
    
    try {
      // Pattern 1: Project structure
      if (fs.existsSync(path.join(this.workspacePath, 'package.json'))) {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(this.workspacePath, 'package.json'), 'utf8')
        );
        
        patterns.push({
          id: `structure_${Date.now()}`,
          type: 'structure',
          description: `Node.js project structure with ${Object.keys(packageJson.dependencies || {}).length} dependencies`,
          confidence: 0.9,
          source: this.task.substring(0, 50)
        });
        
        // Pattern: Specific dependencies used
        if (packageJson.dependencies?.express) {
          patterns.push({
            id: `tech_express_${Date.now()}`,
            type: 'technique',
            description: 'Express.js server setup',
            confidence: 0.85,
            source: this.task.substring(0, 50)
          });
        }
        
        if (packageJson.dependencies?.react) {
          patterns.push({
            id: `tech_react_${Date.now()}`,
            type: 'technique',
            description: 'React application structure',
            confidence: 0.85,
            source: this.task.substring(0, 50)
          });
        }
      }
      
      // Pattern 2: Python project structure
      if (fs.existsSync(path.join(this.workspacePath, 'requirements.txt'))) {
        const requirements = fs.readFileSync(
          path.join(this.workspacePath, 'requirements.txt'), 'utf8'
        );
        const depCount = requirements.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
        
        patterns.push({
          id: `structure_python_${Date.now()}`,
          type: 'structure',
          description: `Python project with ${depCount} dependencies`,
          confidence: 0.9,
          source: this.task.substring(0, 50)
        });
        
        if (requirements.includes('fastapi')) {
          patterns.push({
            id: `tech_fastapi_${Date.now()}`,
            type: 'technique',
            description: 'FastAPI application structure',
            confidence: 0.85,
            source: this.task.substring(0, 50)
          });
        }
      }
      
      // Pattern 3: Error handling in main files
      const mainFiles = ['server.js', 'index.js', 'app.js', 'main.py', 'app.py'];
      for (const file of mainFiles) {
        const filePath = path.join(this.workspacePath, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          
          if (content.includes('try') && content.includes('catch')) {
            patterns.push({
              id: `error_handling_${Date.now()}`,
              type: 'error-handling',
              description: 'Proper try-catch error handling in main file',
              confidence: 0.8,
              source: file
            });
          }
        }
      }
      
    } catch (error) {
      console.warn('[SelfTest] Error extracting patterns:', error);
    }
    
    return patterns;
  }
  
  /**
   * Store learning from a successful test
   */
  private async storeSuccessLearning(patterns: ExtractedPattern[]): Promise<void> {
    try {
      const mirrorPatterns = patterns.map(p => ({
        id: p.id,
        type: p.type,
        description: p.description,
        confidence: p.confidence,
        source: 'self-test-success',
        task: this.task.substring(0, 100),
        successRate: 0.95,
        category: p.type
      }));
      
      await storeTaskLearning(this.task, true, mirrorPatterns, []);
      this.log(`   ✅ Stored ${patterns.length} patterns as successful`);
    } catch (error) {
      console.warn('[SelfTest] Error storing success learning:', error);
    }
  }
  
  /**
   * Store learning from a failed test
   */
  private async storeFailureLearning(errors: string[]): Promise<void> {
    try {
      // Store errors as anti-patterns
      const mistakes = errors.map(e => `Avoid: ${e}`);
      
      await storeTaskLearning(this.task, false, [], mistakes);
      this.log(`   ⚠️ Stored ${errors.length} errors as anti-patterns`);
    } catch (error) {
      console.warn('[SelfTest] Error storing failure learning:', error);
    }
  }
  
  /**
   * Log with prefix
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(`[SelfTest] ${message}`);
    }
  }
  
  /**
   * Log summary
   */
  private logSummary(result: SelfTestResult): void {
    if (!this.verbose) return;
    
    console.log('\n[SelfTest] ═══════════════════════════════════════');
    console.log(`[SelfTest] Self-Test Complete: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`[SelfTest] Duration: ${result.duration}ms`);
    console.log(`[SelfTest] Project Type: ${result.projectInfo.type}`);
    console.log(`[SelfTest] Install: ${result.installSuccess ? '✅' : '❌'}`);
    console.log(`[SelfTest] Run: ${result.runSuccess ? '✅' : '❌'}`);
    
    if (result.errors.length > 0) {
      console.log(`[SelfTest] Errors: ${result.errors.length}`);
      for (const error of result.errors.slice(0, 3)) {
        console.log(`[SelfTest]   - ${error.substring(0, 100)}`);
      }
    }
    
    if (result.patternsExtracted.length > 0) {
      console.log(`[SelfTest] Patterns Learned: ${result.patternsExtracted.length}`);
    }
    
    console.log('[SelfTest] ═══════════════════════════════════════\n');
  }
}

/**
 * Quick function to run self-test on a workspace
 */
export async function selfTestProject(
  workspacePath: string, 
  task: string,
  verbose: boolean = true
): Promise<SelfTestResult> {
  const loop = new SelfTestingLoop(workspacePath, task, verbose);
  return loop.run();
}

/**
 * Run self-test and return a simple summary for the agent
 */
export async function selfTestWithSummary(
  workspacePath: string,
  task: string
): Promise<{ success: boolean; summary: string; errors: string[] }> {
  const result = await selfTestProject(workspacePath, task, false);
  
  let summary = '';
  if (result.success) {
    summary = `✅ Project works! Tested ${result.projectInfo.type} project. ` +
              `Learned ${result.patternsExtracted.length} patterns.`;
  } else {
    summary = `❌ Project has issues. ${result.errors.length} errors found. ` +
              `Stored as anti-patterns for future improvement.`;
  }
  
  return {
    success: result.success,
    summary,
    errors: result.errors
  };
}

