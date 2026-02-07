/**
 * Check available Ollama models - DUAL OLLAMA EDITION
 * Run with: node check-models.js
 */

const axios = require('axios');

// Dual Ollama Configuration
const OLLAMA_PRIMARY = {
    url: 'http://localhost:11434',
    name: 'PRIMARY (qwen3-coder)',
    model: 'qwen3-coder:480b-cloud'
};

const OLLAMA_SECONDARY = {
    url: 'http://localhost:11435', 
    name: 'SECONDARY (deepseek)',
    model: 'deepseek-v3.1:671b-cloud'
};

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

async function checkInstance(instance) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🦙 ${instance.name}`);
    console.log(`  📍 ${instance.url}`);
    console.log(`  🎯 Target Model: ${instance.model}`);
    console.log(`${'═'.repeat(60)}`);
    
    try {
        const headers = {};
        if (OLLAMA_API_KEY) {
            headers['Authorization'] = `Bearer ${OLLAMA_API_KEY}`;
        }
        
        const response = await axios.get(`${instance.url}/api/tags`, { 
            headers, 
            timeout: 10000 
        });
        
        const models = response.data?.models || [];
        
        if (models.length === 0) {
            console.log('  ❌ No models found on this instance');
            console.log(`  💡 Run: ollama pull ${instance.model}`);
            return { online: true, models: [] };
        }
        
        console.log(`  ✅ Found ${models.length} model(s):\n`);
        
        models.forEach((model, index) => {
            const isTarget = model.name === instance.model;
            const marker = isTarget ? '🎯' : '  ';
            console.log(`  ${marker} ${index + 1}. ${model.name}`);
            if (model.size) {
                const sizeGB = (model.size / 1024 / 1024 / 1024).toFixed(2);
                console.log(`       Size: ${sizeGB} GB`);
            }
        });
        
        const hasTarget = models.some(m => m.name === instance.model);
        if (!hasTarget) {
            console.log(`\n  ⚠️  Target model not found!`);
            console.log(`  💡 Run: ollama pull ${instance.model}`);
        } else {
            console.log(`\n  ✅ Target model ready!`);
        }
        
        return { online: true, models, hasTarget };
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('  ❌ Instance OFFLINE');
            console.log('  💡 Start with: ollama serve');
        } else {
            console.log(`  ❌ Error: ${error.message}`);
        }
        return { online: false, models: [] };
    }
}

async function checkModels() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       AgentPrime - Dual Ollama Model Checker                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    const primary = await checkInstance(OLLAMA_PRIMARY);
    const secondary = await checkInstance(OLLAMA_SECONDARY);
    
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('  SUMMARY');
    console.log('═'.repeat(60));
    console.log(`  Primary:   ${primary.online ? '🟢 ONLINE' : '🔴 OFFLINE'} ${primary.hasTarget ? '✅ Model Ready' : '⚠️ Need Pull'}`);
    console.log(`  Secondary: ${secondary.online ? '🟢 ONLINE' : '🔴 OFFLINE'} ${secondary.hasTarget ? '✅ Model Ready' : '⚠️ Need Pull'}`);
    console.log('═'.repeat(60));
    
    if (!primary.online || !secondary.online) {
        console.log('\n💡 To start dual Ollama: run start-dual-ollama.bat');
    }
    if (!primary.hasTarget || !secondary.hasTarget) {
        console.log('💡 To pull all models: run pull-all-models.bat');
    }
    
    console.log('\n');
}

checkModels();

