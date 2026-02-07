/**
 * Test Script for AgentPrime Tools
 * Run with: npx ts-node src/main/tools/test-tools.ts
 * 
 * This demonstrates how each tool works and what they can do!
 */

import { 
  WebSearchTool, 
  WebFetchTool,
  FileOrganizerTool,
  FileAnalyzerTool,
  DocumentReaderTool,
  createAllTools,
  getToolDescriptionsForLLM
} from './index';

async function testWebSearch() {
  console.log('\n🔍 Testing Web Search Tool...\n');
  
  const searchTool = new WebSearchTool();
  const results = await searchTool.execute({ 
    query: 'React 19 new features',
    maxResults: 3
  });
  
  console.log(`Found ${results.results.length} results:`);
  for (const result of results.results) {
    console.log(`  📄 ${result.title}`);
    console.log(`     ${result.url}`);
    console.log(`     ${result.snippet.substring(0, 100)}...`);
    console.log();
  }
}

async function testFileAnalyzer() {
  console.log('\n📁 Testing File Analyzer Tool...\n');
  
  const analyzerTool = new FileAnalyzerTool();
  const folderPath = process.cwd(); // Analyze current folder
  
  const result = await analyzerTool.execute({
    folderPath,
    includeSubfolders: false,
    checkDuplicates: true
  });
  
  console.log(`Analyzed ${result.totalFiles} files:`);
  for (const [category, info] of Object.entries(result.categories)) {
    console.log(`  📂 ${category}: ${info.count} files`);
  }
  console.log(`  ❓ Uncategorized: ${result.uncategorized.count} files`);
  
  if (result.duplicates.length > 0) {
    console.log(`\n⚠️  Found ${result.duplicates.length} potential duplicates`);
  }
  
  console.log('\n📊 Largest files:');
  for (const file of result.largestFiles.slice(0, 5)) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    console.log(`  ${sizeMB} MB - ${file.name.split(/[/\\]/).pop()}`);
  }
}

async function testDocumentReader() {
  console.log('\n📖 Testing Document Reader Tool...\n');
  
  const docTool = new DocumentReaderTool();
  
  // Try to read README.md as a test
  const result = await docTool.execute({
    filePath: 'README.md',
    maxLength: 500
  });
  
  if (result.success) {
    console.log(`Read ${result.fileName} (${result.metadata?.wordCount} words):`);
    console.log(`---\n${result.content.substring(0, 300)}...\n---`);
  } else {
    console.log(`Could not read document: ${result.error}`);
  }
}

async function showToolDescriptions() {
  console.log('\n🛠️  All Available Tools:\n');
  console.log('=' .repeat(60));
  
  const tools = createAllTools();
  for (const tool of tools) {
    console.log(`\n📌 ${tool.name}`);
    console.log(`   ${tool.description}`);
    const params = Object.keys(tool.parameters);
    if (params.length > 0) {
      console.log(`   Parameters: ${params.join(', ')}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\nTotal: ${tools.length} tools available`);
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  🤖 AgentPrime Tools Test Suite');
  console.log('═'.repeat(60));
  
  // Show all available tools
  await showToolDescriptions();
  
  // Test individual tools
  // Uncomment to run specific tests:
  
  // await testWebSearch();
  // await testFileAnalyzer();
  // await testDocumentReader();
  
  console.log('\n✅ Tool system ready! The AI can now use these tools.');
  console.log('\n📋 Example commands you can give the AI:');
  console.log('  - "Search the web for TypeScript best practices"');
  console.log('  - "Organize my Downloads folder"');
  console.log('  - "Read my resume and extract my skills"');
  console.log('  - "Fill out this job application form"');
  console.log('  - "Copy this text to clipboard"');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { testWebSearch, testFileAnalyzer, testDocumentReader, showToolDescriptions };

