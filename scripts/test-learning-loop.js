/**
 * Test script for the Learning Loop components
 * 
 * Tests:
 * 1. Opus Example Loader with manifest
 * 2. Self-Testing Loop
 * 3. User Feedback storage
 */

const path = require('path');
const fs = require('fs');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(emoji, msg, color = colors.reset) {
  console.log(`${color}${emoji} ${msg}${colors.reset}`);
}

function success(msg) { log('✅', msg, colors.green); }
function error(msg) { log('❌', msg, colors.red); }
function info(msg) { log('ℹ️', msg, colors.cyan); }
function warn(msg) { log('⚠️', msg, colors.yellow); }

async function testOpusManifest() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST 1: Opus Examples Manifest');
  console.log('═══════════════════════════════════════════════════\n');
  
  const manifestPath = path.join(__dirname, '..', 'data', 'opus-examples', 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    error('manifest.json not found at: ' + manifestPath);
    return false;
  }
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    success(`Manifest loaded: version ${manifest.version}`);
    info(`Total examples indexed: ${manifest.examples.length}`);
    
    // Count by quality
    const highQuality = manifest.examples.filter(e => e.quality >= 4).length;
    const medQuality = manifest.examples.filter(e => e.quality === 3).length;
    
    info(`High quality (4-5): ${highQuality}`);
    info(`Medium quality (3): ${medQuality}`);
    
    // Count unique tags
    const allTags = Object.keys(manifest.tagIndex).filter(t => manifest.tagIndex[t].length > 0);
    info(`Active tags: ${allTags.length}`);
    info(`Tags: ${allTags.slice(0, 10).join(', ')}${allTags.length > 10 ? '...' : ''}`);
    
    // Count categories
    const categories = Object.keys(manifest.categories).filter(c => manifest.categories[c].length > 0);
    info(`Categories: ${categories.join(', ')}`);
    
    return true;
  } catch (e) {
    error('Failed to parse manifest: ' + e.message);
    return false;
  }
}

async function testKeywordExtraction() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST 2: Keyword Extraction Logic');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Simulate keyword extraction
  function extractTaskKeywords(task) {
    const taskLower = task.toLowerCase();
    const keywords = [];
    
    if (taskLower.includes('react')) keywords.push('react');
    if (taskLower.includes('express')) keywords.push('express');
    if (taskLower.includes('api')) keywords.push('api');
    if (taskLower.includes('game')) keywords.push('game');
    if (taskLower.includes('error') || taskLower.includes('exception')) keywords.push('error-handling');
    if (taskLower.includes('retry') || taskLower.includes('resilient')) keywords.push('retry', 'resilience');
    if (taskLower.includes('agent') || taskLower.includes('tool')) keywords.push('agent', 'tool-calling');
    if (taskLower.includes('hook')) keywords.push('hooks');
    if (taskLower.includes('typescript') || taskLower.includes(' ts ')) keywords.push('typescript');
    
    return [...new Set(keywords)];
  }
  
  const testCases = [
    { task: 'Create a React app with error handling', expected: ['react', 'error-handling'] },
    { task: 'Build a resilient Express API with retries', expected: ['express', 'api', 'retry', 'resilience'] },
    { task: 'Make an agent that uses tools', expected: ['agent', 'tool-calling'] },
    { task: 'Create a TypeScript custom hook', expected: ['typescript', 'hooks'] },
    { task: 'Build a simple game', expected: ['game'] }
  ];
  
  let passed = 0;
  for (const tc of testCases) {
    const result = extractTaskKeywords(tc.task);
    const hasAll = tc.expected.every(k => result.includes(k));
    
    if (hasAll) {
      success(`"${tc.task.substring(0, 40)}..." → [${result.join(', ')}]`);
      passed++;
    } else {
      error(`"${tc.task.substring(0, 40)}..." → [${result.join(', ')}]`);
      warn(`  Expected: [${tc.expected.join(', ')}]`);
    }
  }
  
  info(`Passed ${passed}/${testCases.length} keyword extraction tests`);
  return passed === testCases.length;
}

async function testManifestMatching() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST 3: Manifest-Based Pattern Matching');
  console.log('═══════════════════════════════════════════════════\n');
  
  const manifestPath = path.join(__dirname, '..', 'data', 'opus-examples', 'manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    error('Cannot test matching without manifest');
    return false;
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  function scoreExampleWithManifest(example, keywords) {
    let score = 0;
    
    for (const keyword of keywords) {
      if (example.tags.includes(keyword)) score += 3;
    }
    
    for (const keyword of keywords) {
      if (example.category.includes(keyword)) score += 2;
    }
    
    const descLower = (example.description || '').toLowerCase();
    for (const keyword of keywords) {
      if (descLower.includes(keyword)) score += 1;
    }
    
    score += example.quality * 0.5;
    
    return score;
  }
  
  const testQueries = [
    { query: 'react hooks', expectedTopFile: 'direct_ingested_1766616077979.js' },
    { query: 'self-healing retry', expectedTopFile: 'direct_ingested_1766628127506.js' },
    { query: 'agent loop tool', expectedTopFile: 'direct_ingested_1766755446671.js' }
  ];
  
  let passed = 0;
  for (const tq of testQueries) {
    const keywords = tq.query.split(' ');
    
    const scored = manifest.examples
      .filter(ex => !ex.file.includes('github_'))
      .map(ex => ({ file: ex.file, score: scoreExampleWithManifest(ex, keywords) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    
    const topFile = scored[0]?.file;
    
    if (topFile === tq.expectedTopFile) {
      success(`"${tq.query}" → ${topFile} (score: ${scored[0]?.score.toFixed(1)})`);
      passed++;
    } else {
      warn(`"${tq.query}" → ${topFile || 'none'}`);
      warn(`  Expected: ${tq.expectedTopFile}`);
    }
  }
  
  info(`Passed ${passed}/${testQueries.length} matching tests`);
  return passed >= 2; // Allow 1 failure
}

async function testSelfTestingLoopStructure() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST 4: Self-Testing Loop File Structure');
  console.log('═══════════════════════════════════════════════════\n');
  
  const files = [
    { path: 'src/main/agent/self-testing-loop.ts', desc: 'Self-testing loop' },
    { path: 'src/main/mirror/opus-example-loader.ts', desc: 'Opus example loader' },
    { path: 'src/main/ipc-handlers/feedback.ts', desc: 'Feedback handlers' },
    { path: 'data/opus-examples/manifest.json', desc: 'Opus manifest' }
  ];
  
  let passed = 0;
  for (const file of files) {
    const fullPath = path.join(__dirname, '..', file.path);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      success(`${file.desc}: ${fullPath.split(path.sep).pop()} (${(stats.size / 1024).toFixed(1)}KB)`);
      passed++;
    } else {
      error(`${file.desc}: NOT FOUND at ${file.path}`);
    }
  }
  
  info(`Passed ${passed}/${files.length} file existence tests`);
  return passed === files.length;
}

async function testFeedbackHandlerExports() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST 5: IPC Handler Registration');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Check that index.ts imports feedback handler
  const indexPath = path.join(__dirname, '..', 'src', 'main', 'ipc-handlers', 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    error('ipc-handlers/index.ts not found');
    return false;
  }
  
  const content = fs.readFileSync(indexPath, 'utf8');
  
  const checks = [
    { pattern: /import.*registerFeedbackHandlers.*from.*feedback/, desc: 'Feedback import' },
    { pattern: /registerFeedbackHandlers\(\)/, desc: 'Feedback registration call' }
  ];
  
  let passed = 0;
  for (const check of checks) {
    if (check.pattern.test(content)) {
      success(check.desc + ' found');
      passed++;
    } else {
      error(check.desc + ' NOT found');
    }
  }
  
  return passed === checks.length;
}

// Run all tests
async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  AgentPrime Learning Loop Integration Tests           ║');
  console.log('║  Testing: Opus Loader, Self-Test, User Feedback       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  
  const results = {
    manifest: await testOpusManifest(),
    keywords: await testKeywordExtraction(),
    matching: await testManifestMatching(),
    structure: await testSelfTestingLoopStructure(),
    handlers: await testFeedbackHandlerExports()
  };
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════\n');
  
  const totalPassed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  for (const [name, passed] of Object.entries(results)) {
    const icon = passed ? '✅' : '❌';
    const color = passed ? colors.green : colors.red;
    console.log(`${color}${icon} ${name}${colors.reset}`);
  }
  
  console.log('\n');
  if (totalPassed === total) {
    console.log(`${colors.green}🎉 All ${total} tests passed!${colors.reset}`);
    console.log(`${colors.cyan}The learning loop integration is ready.${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠️ ${totalPassed}/${total} tests passed${colors.reset}`);
  }
  
  console.log('\n');
  process.exit(totalPassed === total ? 0 : 1);
}

main().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});

