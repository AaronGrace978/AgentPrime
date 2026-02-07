const axios = require('axios');

const testMessages = [
  { role: 'user', content: 'Hello, can you help me with coding?' },
  { role: 'user', content: 'Create a simple function to add two numbers' },
  { role: 'user', content: '{"plan": ["Scaffold HTML5 Canvas game structure"], "current_step": 0, "name": "scaffold_project", "arguments": {"project_type": "html_game", "project_name": "tetris"}}' }
];

async function testClaude() {
  for (let i = 0; i < testMessages.length; i++) {
    try {
      console.log(`\n🔍 Test ${i + 1}: ${testMessages[i].content.substring(0, 50)}...`);
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [testMessages[i]]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01'
        },
        timeout: 15000
      });

      const content = response.data.content[0]?.text || 'EMPTY RESPONSE';
      console.log(`✅ Response: ${content.substring(0, 100)}...`);
    } catch (error) {
      console.log(`❌ Error: ${error.response?.data?.error?.message || error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
  }
}

testClaude();
