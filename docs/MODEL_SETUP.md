# Model Setup Guide

## Finding the Correct Model Name

If you're getting "model not found" errors, follow these steps:

### Step 1: Check Available Models

Run the model checker:
```bash
npm run check-models
```

Or directly:
```bash
node check-models.js
```

This will list all models available in your Ollama instance.

### Step 2: Common Qwen Model Names

If you're using local Ollama, try these model names:
- `qwen2.5-coder:32b` (recommended - best quality)
- `qwen2.5-coder:14b` (good balance)
- `qwen2.5-coder:7b` (faster, smaller)
- `qwen2.5-coder` (default variant)

### Step 3: Pull a Model (if needed)

If no models are found, pull one:
```bash
ollama pull qwen2.5-coder:32b
```

Or for other coding models:
```bash
ollama pull deepseek-coder:6.7b
ollama pull codellama:13b
```

### Step 4: Update Model Name

Once you know the correct model name, update it in:

1. **main.js** (line ~13):
   ```javascript
   const OLLAMA_MODEL = 'qwen2.5-coder:32b'; // Your model name here
   ```

2. **backend/app/config.py** (line ~7):
   ```python
   OLLAMA_MODEL: str = "qwen2.5-coder:32b"
   ```

3. **start.bat** (line ~66):
   ```batch
   set OLLAMA_MODEL=qwen2.5-coder:32b
   ```

### For Ollama Cloud Users

If you're using Ollama Cloud with an API key:
- The model name format might be different
- Check your Ollama Cloud dashboard for exact model names
- Model names might include `-cloud` suffix
- Example: `qwen3-coder:480b-cloud` (if that's what your cloud instance provides)

### Testing a Model

To test if a model works:
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5-coder:32b",
  "prompt": "Hello",
  "stream": false
}'
```

### Quick Fix

If you just want to get it working quickly, try:
1. Pull a model: `ollama pull qwen2.5-coder:32b`
2. Update `main.js` to use: `qwen2.5-coder:32b`
3. Restart the app

