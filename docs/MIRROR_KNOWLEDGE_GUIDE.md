# Mirror Knowledge Ingestion Guide

## Overview

The Mirror Knowledge Ingestion system allows you to feed code examples from online sources directly into AgentPrime's learning system. This enables the system to learn patterns from:

- GitHub repositories
- GitHub Gists
- Direct code URLs
- Pasted code snippets
- Any online code source

## How to Use

### 1. Ingest from GitHub URL

**Example URLs:**
- Raw file: `https://raw.githubusercontent.com/user/repo/main/file.js`
- Repository file: `https://github.com/user/repo/blob/main/src/index.js`
- Gist: `https://gist.github.com/username/gist-id`

**From Frontend (JavaScript):**
```javascript
// Single URL
const result = await window.electronAPI.invoke('mirror-ingest-url', 
    'https://raw.githubusercontent.com/user/repo/main/file.js'
);

// Multiple URLs
const results = await window.electronAPI.invoke('mirror-ingest-urls', [
    'https://github.com/user/repo/blob/main/file1.js',
    'https://github.com/user/repo/blob/main/file2.js',
    'https://gist.github.com/username/gist-id'
]);
```

### 2. Ingest from Pasted Code

**From Frontend:**
```javascript
const code = `// Your code here
function example() {
    return "Hello, World!";
}`;

const result = await window.electronAPI.invoke('mirror-ingest-content', 
    code,
    { source: 'manual_paste', description: 'Example function' }
);
```

### 3. Ingest from Clipboard

You can create a UI button that:
1. Reads from clipboard
2. Sends to ingestion system
3. Shows success/failure

**Example:**
```javascript
async function ingestFromClipboard() {
    try {
        const clipboardText = await navigator.clipboard.readText();
        const result = await window.electronAPI.invoke('mirror-ingest-content', 
            clipboardText,
            { source: 'clipboard', timestamp: Date.now() }
        );
        
        if (result.success) {
            console.log(`✅ Ingested ${result.patternsExtracted} patterns!`);
        }
    } catch (error) {
        console.error('Failed to ingest:', error);
    }
}
```

## Supported Sources

### GitHub Raw Files
```
https://raw.githubusercontent.com/owner/repo/branch/path/to/file.js
```

### GitHub Repository Files
```
https://github.com/owner/repo/blob/branch/path/to/file.js
```

### GitHub Gists
```
https://gist.github.com/username/gist-id
```

### Direct URLs
Any URL that returns code/text content:
```
https://example.com/code.js
https://pastebin.com/raw/xxxxx
```

## What Happens When You Ingest?

1. **Download**: The system fetches the code from the URL
2. **Save**: Code is saved to `data/opus-examples/` directory
3. **Extract**: Patterns are automatically extracted:
   - Code structure patterns
   - Problem-solving approaches
   - Reasoning patterns
   - Style patterns
4. **Store**: Patterns are stored in mirror memory
5. **Learn**: System immediately starts using these patterns

## Checking Ingestion Status

```javascript
// Get ingestion history
const history = await window.electronAPI.invoke('mirror-get-ingestion-history', 20);

// Check patterns learned
const patterns = await window.electronAPI.invoke('mirror-get-patterns', null, 50);

// Get intelligence metrics
const metrics = await window.electronAPI.invoke('mirror-get-metrics');
```

## Best Practices

1. **Quality over Quantity**: Ingest high-quality code examples
2. **Diverse Sources**: Get examples from different projects/styles
3. **Relevant Code**: Focus on code similar to what you want AgentPrime to generate
4. **Regular Updates**: Periodically ingest new examples to keep learning

## Example Workflow

```javascript
// 1. Find a great code example online
const url = 'https://github.com/example/awesome-project/blob/main/src/utils.js';

// 2. Ingest it
const result = await window.electronAPI.invoke('mirror-ingest-url', url);

// 3. Check what was learned
if (result.success) {
    console.log(`Learned ${result.patternsExtracted} patterns!`);
    console.log('Patterns by category:', result.patterns);
}

// 4. The system now uses these patterns automatically
// (if mirror learning mode is enabled)
```

## Troubleshooting

**Error: "Knowledge ingester not initialized"**
- Make sure the app has fully started
- Check console for initialization errors

**Error: "No content fetched from URL"**
- URL might be invalid or require authentication
- Try accessing the URL directly in a browser first

**Error: "Invalid GitHub URL"**
- Make sure the URL format is correct
- For repository files, use the `/blob/` format

## Advanced Usage

### Ingest with Metadata

```javascript
await window.electronAPI.invoke('mirror-ingest-url', url, {
    metadata: {
        description: 'React component patterns',
        tags: ['react', 'components', 'patterns'],
        quality: 'high'
    }
});
```

### Batch Ingestion

```javascript
const urls = [
    'https://github.com/user/repo/blob/main/file1.js',
    'https://github.com/user/repo/blob/main/file2.js',
    'https://gist.github.com/user/gist-id'
];

const results = await window.electronAPI.invoke('mirror-ingest-urls', urls);
console.log(`Successfully ingested ${results.successful}/${results.total} sources`);
```

## Integration with UI

You can add a "Learn from URL" button in your UI:

```javascript
// In your UI component
async function handleLearnFromURL() {
    const url = prompt('Enter code URL to learn from:');
    if (url) {
        const result = await window.electronAPI.invoke('mirror-ingest-url', url);
        if (result.success) {
            showNotification(`✅ Learned ${result.patternsExtracted} patterns from ${url}`);
        } else {
            showNotification(`❌ Failed: ${result.error}`);
        }
    }
}
```

## Next Steps

1. Enable mirror learning mode: `mirror-toggle-learning` (true)
2. Start chatting - the system will use learned patterns
3. Monitor metrics: `mirror-get-metrics`
4. View learned patterns: `mirror-get-patterns`

Happy learning! 🚀
