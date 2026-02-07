
const { AgentLoop } = require('./src/main/agent-loop');

async function testAgentLoop() {
  console.log('Testing agent loop with validation...');

  const context = {
    workspacePath: './test-workspace',
    currentFile: null,
    openFiles: [],
    terminalHistory: [],
    model: 'test-model'
  };

  const agent = new AgentLoop(context);

  // Test validation pipeline
  const testToolCalls = [{
    function: {
      name: 'write_file',
      arguments: JSON.stringify({
        path: 'test.js',
        content: 'console.log("Hello World");\n// Valid JavaScript'
      })
    }
  }];

  const validationResult = await agent.runValidationPipeline({
    toolCalls: testToolCalls,
    context,
    currentPlan: ['Create test file'],
    currentStep: 0
  });

  console.log('Validation confidence:', validationResult.overallConfidence);
  console.log('Issues found:', validationResult.issues.length);
  console.log('Auto-fixed:', validationResult.autoFixed);

  if (validationResult.overallConfidence > 0.8) {
    console.log('✅ Validation pipeline working correctly');
  } else {
    console.log('⚠️ Validation confidence lower than expected');
  }

  return validationResult;
}

testAgentLoop().then(() => {
  console.log('🎯 Integration test completed successfully');
}).catch(err => {
  console.error('❌ Integration test failed:', err.message);
  process.exit(1);
});
