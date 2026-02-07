/**
 * Test Desktop Control - Smart icon manipulation
 */

import { classifyIntentFast } from '../src/main/modules/local-brain/intent-classifier';

async function testDesktopPatterns() {
  console.log('🖥️  Testing Desktop Control Patterns\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const testCases = [
    // Move commands
    'move Freelancer to the right of Screenshot',
    'drag Freelancer right of Screenshot',
    'put Freelancer next to Screenshot',
    'move Game left of Documents',
    'drag file.txt below folder',
    
    // List/find commands
    'list desktop',
    'show my desktop',
    'what\'s on desktop',
    'find Freelancer on desktop',
    'where is Screenshot on my desktop',
    
    // Arrange commands
    'arrange desktop',
    'arrange my desktop by name',
    'arrange desktop by type',
  ];

  for (const input of testCases) {
    const result = classifyIntentFast(input);
    if (result) {
      console.log(`✅ "${input}"`);
      console.log(`   → Action: ${result.action} (${(result.confidence * 100).toFixed(0)}%)`);
      if (result.params) {
        console.log(`   → Params:`, JSON.stringify(result.params));
      }
    } else {
      console.log(`❌ "${input}" → No pattern match`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('Desktop Control patterns test complete!');
}

testDesktopPatterns().catch(console.error);
