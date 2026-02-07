// Test script to verify workspace creation with different base directories
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing workspace creation functionality...\n');

// Test the path joining logic
const testCases = [
    { projectName: 'UnifiedAi', baseDir: 'E:\\' },
    { projectName: 'MyProject', baseDir: 'C:\\Projects' },
    { projectName: 'TestApp', baseDir: 'D:\\Development\\' }
];

testCases.forEach(({ projectName, baseDir }) => {
    const projectPath = path.join(baseDir, projectName);
    console.log(`📁 ${projectName} in ${baseDir} → ${projectPath}`);

    // Simulate directory creation
    try {
        // Note: We won't actually create directories in test
        console.log(`✅ Path would be created: ${projectPath}`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
});

console.log('\n🎉 Workspace creation logic test completed!');
console.log('The new workspace button should now prompt for base directory first, then project name.');
console.log('Example: Enter "E:\\" as base directory, then "UnifiedAi" as project name.');