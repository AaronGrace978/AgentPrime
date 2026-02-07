/**
 * Test script for new modules: LocalBrain, ActionEngine, Anticipator
 * Run with: npx ts-node scripts/test-modules.ts
 */

import { initializeLocalBrain, getLocalBrain, classifyIntentFast } from '../src/main/modules/local-brain';
import { getActionEngine, initializeActionEngine } from '../src/main/modules/action-engine';
import { getAnticipator, initializeAnticipator } from '../src/main/modules/anticipator';

async function testLocalBrain() {
  console.log('\n🧠 Testing LocalBrain...\n');
  
  try {
    // Test FastPath (regex patterns)
    console.log('1. Testing FastPath classification:');
    const testInputs = [
      'open outlook',
      'add hackathon to my calendar for february 7th',
      'what time is it',
      'mute',
      'launch borderlands',
      'send email to john',
      'remind me in 30 minutes'
    ];
    
    for (const input of testInputs) {
      const result = classifyIntentFast(input);
      if (result) {
        console.log(`   "${input}"`);
        console.log(`   → ${result.category} (${(result.confidence * 100).toFixed(0)}%) | ${result.routing} | action: ${result.action || 'none'}`);
      } else {
        console.log(`   "${input}" → No pattern match`);
      }
    }
    
    // Test LocalBrain initialization
    console.log('\n2. Testing LocalBrain initialization:');
    const brain = await initializeLocalBrain({ model: 'phi3', fallbackModel: 'llama3.2' });
    const status = await brain.getStatus();
    console.log(`   Status: ${status.available ? '✅ Available' : '❌ Not available'}`);
    console.log(`   Model: ${status.model || 'None'}`);
    console.log(`   Ollama Running: ${status.ollamaRunning ? 'Yes' : 'No'}`);
    console.log(`   Cache Size: ${status.cacheSize}`);
    
    // Test classification with LocalBrain
    console.log('\n3. Testing LocalBrain classification:');
    const classified = await brain.classify('open spotify and play music');
    console.log(`   Input: "open spotify and play music"`);
    console.log(`   Result: ${classified.category} (${(classified.confidence * 100).toFixed(0)}%) | ${classified.routing}`);
    
    console.log('\n✅ LocalBrain tests passed!\n');
  } catch (error) {
    console.error('❌ LocalBrain test failed:', error);
  }
}

async function testActionEngine() {
  console.log('\n⚙️  Testing ActionEngine...\n');
  
  try {
    const engine = getActionEngine({ maxConcurrent: 3 });
    
    // Mock executor for testing
    let executionCount = 0;
    engine.setExecutor(async (action: string, params: Record<string, any>) => {
      executionCount++;
      console.log(`   [Executor] Executing: ${action}`, params);
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
      return { success: true, message: `Executed ${action}` };
    });
    
    console.log('1. Testing action queueing:');
    const id1 = engine.enqueue('test_action_1', { param: 'value1' }, { priority: 'high' });
    const id2 = engine.enqueue('test_action_2', { param: 'value2' }, { priority: 'normal' });
    const id3 = engine.enqueue('test_action_3', { param: 'value3' }, { priority: 'low' });
    
    console.log(`   Queued actions: ${id1}, ${id2}, ${id3}`);
    
    // Wait for execution
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`   Executions completed: ${executionCount}`);
    
    console.log('\n2. Testing parallel queueing:');
    const ids = engine.queueParallel([
      { action: 'parallel_1', params: { test: 1 } },
      { action: 'parallel_2', params: { test: 2 } },
      { action: 'parallel_3', params: { test: 3 } }
    ]);
    console.log(`   Queued ${ids.length} parallel actions`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('\n3. Testing status:');
    const status = engine.getStatus();
    console.log(`   Queue length: ${status.queueLength}`);
    console.log(`   Running: ${status.running}`);
    console.log(`   Stats: ${status.stats.executed} executed, ${status.stats.succeeded} succeeded, ${status.stats.failed} failed`);
    
    console.log('\n✅ ActionEngine tests passed!\n');
  } catch (error) {
    console.error('❌ ActionEngine test failed:', error);
  }
}

async function testAnticipator() {
  console.log('\n🔮 Testing Anticipator...\n');
  
  try {
    const anticipator = await initializeAnticipator();
    
    console.log('1. Testing action recording:');
    anticipator.recordAction('open_app', { app: 'outlook' }, true);
    anticipator.recordAction('calendar_add_event', { subject: 'meeting' }, true);
    anticipator.recordAction('open_app', { app: 'outlook' }, true);
    anticipator.recordAction('calendar_add_event', { subject: 'standup' }, true);
    console.log('   Recorded 4 actions');
    
    console.log('\n2. Testing predictions:');
    const predictions = anticipator.predict({ lastAction: 'open_app' });
    console.log(`   Found ${predictions.predictions.length} predictions:`);
    predictions.predictions.slice(0, 3).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.action} (${(p.confidence * 100).toFixed(0)}%) - ${p.reasoning}`);
    });
    
    console.log('\n3. Testing suggestions:');
    const suggestions = anticipator.getSuggestions();
    console.log(`   Found ${suggestions.length} suggestions:`);
    suggestions.slice(0, 3).forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.action} - ${s.reason} (${(s.confidence * 100).toFixed(0)}%)`);
    });
    
    console.log('\n4. Testing status:');
    const status = anticipator.getStatus();
    console.log(`   Enabled: ${status.enabled ? 'Yes' : 'No'}`);
    console.log(`   Patterns: ${status.patternsCount}`);
    
    console.log('\n✅ Anticipator tests passed!\n');
  } catch (error) {
    console.error('❌ Anticipator test failed:', error);
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Testing AgentPrime Modules');
  console.log('═══════════════════════════════════════════════════════');
  
  await testLocalBrain();
  await testActionEngine();
  await testAnticipator();
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  All tests completed!');
  console.log('═══════════════════════════════════════════════════════');
}

// Run tests
runAllTests().catch(console.error);
