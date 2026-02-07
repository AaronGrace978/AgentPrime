/**
 * Test script to simulate project creation using the template engine
 */

const TemplateEngine = require('../src/main/legacy/template-engine.js');
const path = require('path');

async function testProjectCreation() {
    console.log('🚀 Testing AgentPrime Template Engine...\n');

    // Initialize template engine
    const engine = new TemplateEngine('./templates');

    try {
        // Load registry
        console.log('📚 Loading template registry...');
        const registry = engine.loadRegistry();
        console.log(`✅ Found ${registry.templates.length} templates in ${registry.categories.length} categories`);

        // Test 1: Create Electron + React project
        console.log('\n🖥️  Testing Electron + React template...');
        const result1 = await engine.createProject('electron-react', './test-projects', {
            projectName: 'test-electron-app',
            author: 'TestUser',
            description: 'A test Electron application'
        });

        console.log('✅ Electron project created successfully!');
        console.log(`📁 Project path: ${result1.projectPath}`);
        console.log(`📄 Files created: ${result1.filesCreated.length}`);
        console.log('Generated .bat files:', result1.filesCreated.filter(f => f.endsWith('.bat')));

        // Test 2: Create Python CLI project
        console.log('\n🐍 Testing Python CLI template...');
        const result2 = await engine.createProject('python-cli', './test-projects', {
            projectName: 'test-python-cli',
            author: 'TestUser',
            description: 'A test Python CLI tool'
        });

        console.log('✅ Python CLI project created successfully!');
        console.log(`📁 Project path: ${result2.projectPath}`);
        console.log(`📄 Files created: ${result2.filesCreated.length}`);
        console.log('Generated .bat files:', result2.filesCreated.filter(f => f.endsWith('.bat')));

        // List created projects
        console.log('\n📋 Created test projects:');
        const fs = require('fs');
        const projects = fs.readdirSync('./test-projects');
        projects.forEach(project => {
            console.log(`  - ${project}`);
        });

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n💡 You can now test the .bat files in the created projects.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testProjectCreation();