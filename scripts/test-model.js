/**
 * Test if qwen3-coder:480b-cloud is available
 */

const axios = require('axios');

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'qwen3-coder:480b-cloud';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

async function testModel() {
    console.log(`🧪 Testing model: ${OLLAMA_MODEL}\n`);
    
    const headers = {
        'Content-Type': 'application/json'
    };
    if (OLLAMA_API_KEY) {
        headers['Authorization'] = `Bearer ${OLLAMA_API_KEY}`;
    }
    
    try {
        // Try a simple generate request
        console.log('Sending test request...');
        const response = await axios.post(
            `${OLLAMA_URL}/api/generate`,
            {
                model: OLLAMA_MODEL,
                prompt: 'Hello',
                stream: false,
                options: {
                    num_predict: 10
                }
            },
            {
                headers,
                timeout: 30000
            }
        );
        
        console.log('✅ Model is available and working!');
        console.log(`Response: ${response.data.response}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.status === 404) {
                console.log('\n💡 The model might need to be pulled first.');
                console.log('   Try running: ollama pull qwen3-coder:480b-cloud');
                console.log('   Or check your Ollama Cloud dashboard to activate it.');
            }
        } else if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Cannot connect to Ollama. Is it running?');
        } else if (error.code === 'ECONNABORTED') {
            console.log('\n💡 Request timed out. The model might be too large or unavailable.');
        }
    }
}

testModel();

