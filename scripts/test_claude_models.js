const axios = require('axios');

const CLAUDE_MODELS = [
  'claude-sonnet-4-20250514',  // The model you mentioned
  'claude-opus-4-20250514',    // The model you mentioned
  'claude-3-5-sonnet-20241022', // Current "latest" in code
  'claude-3-5-haiku-20241022',  // Working model we found
];

const API_KEY = process.env.ANTHROPIC_API_KEY || '';

async function testModel(model) {
  try {
    console.log(`🔍 Testing ${model}...`);
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      timeout: 10000
    });

    console.log(`✅ ${model}: ${response.data.content[0].text.trim()}`);
    return true;
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.log(`❌ ${model}: ${errorMsg}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing Claude API Key Access (Focused Test)\n');

  for (const model of CLAUDE_MODELS) {
    await testModel(model);
    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

main().catch(console.error);
