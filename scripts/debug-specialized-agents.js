// Debug script for specialized agents - using improved parseToolCalls function
const fs = require('fs');

// Improved parseToolCalls function (copy from specialized-agents.ts)
function parseToolCalls(content) {
  const toolCalls = [];

  // First try to parse as a single JSON array/object
  try {
    const parsed = JSON.parse(content.trim());
    if (Array.isArray(parsed)) {
      // Handle array of tool calls
      for (const item of parsed) {
        if (item.name && (item.name === 'write_file' || item.name === 'run_command' || item.name === 'scaffold_project')) {
          toolCalls.push({
            function: {
              name: item.name,
              arguments: item.arguments || item.args || {}
            }
          });
        }
      }
      return toolCalls;
    } else if (parsed.name && (parsed.name === 'write_file' || parsed.name === 'run_command' || parsed.name === 'scaffold_project')) {
      // Handle single tool call
      toolCalls.push({
        function: {
          name: parsed.name,
          arguments: parsed.arguments || parsed.args || {}
        }
      });
      return toolCalls;
    }
  } catch (e) {
    // Not a single JSON object/array, try parsing multiple objects
  }

  // Split content by newlines and try to parse each line as JSON
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  for (const line of lines) {
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.name && (parsed.name === 'write_file' || parsed.name === 'run_command' || parsed.name === 'scaffold_project')) {
          toolCalls.push({
            function: {
              name: parsed.name,
              arguments: parsed.arguments || parsed.args || {}
            }
          });
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    }
  }

  // Fallback: Look for JSON tool call patterns with improved regex
  if (toolCalls.length === 0) {
    const jsonMatches = content.match(/\{[^{}]*\}/g);
    if (jsonMatches) {
      for (const match of jsonMatches) {
        try {
          const parsed = JSON.parse(match);
          if (parsed.name && (parsed.name === 'write_file' || parsed.name === 'run_command' || parsed.name === 'scaffold_project')) {
            toolCalls.push({
              function: {
                name: parsed.name,
                arguments: parsed.arguments || parsed.args || {}
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  }

  return toolCalls;
}

// Test with sample response from logs
const sampleResponse = `{"name": "write_file", "arguments": {"path": "index.html", "content": "<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>"}}`;

console.log('Testing with sample response...');
const tools = parseToolCalls(sampleResponse);
console.log('Parsed tools:', tools.length);

console.log('\nTesting with multiple tool calls...');
const multiResponse = `{"name": "write_file", "arguments": {"path": "index.html", "content": "<html></html>"}}
{"name": "write_file", "arguments": {"path": "styles.css", "content": "body{}"}}
{"name": "run_command", "arguments": {"command": "echo hello"}}`;

const multiTools = parseToolCalls(multiResponse);
console.log('Parsed multi tools:', multiTools.length);
multiTools.forEach((tool, i) => {
  console.log(`Tool ${i}:`, tool.function.name, tool.function.arguments.path || tool.function.arguments.command);
});
