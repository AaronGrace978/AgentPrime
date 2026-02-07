# AgentPrime Project Templates

When AgentPrime creates projects, it ensures they are runnable on your system.

## What Gets Created

### For Node.js Projects:
- `package.json` - With all dependencies
- `README.md` - With setup and run instructions
- `.gitignore` - Standard Node.js ignores
- Main application files
- Proper folder structure

### For Python Projects:
- `requirements.txt` - With all dependencies
- `README.md` - With setup and run instructions
- `.gitignore` - Standard Python ignores
- Main application files
- Proper folder structure

### For Web Projects:
- `package.json` or `requirements.txt`
- `index.html` or main entry point
- CSS/JS files
- README with instructions

## How to Run Projects

After AgentPrime creates a project:

1. **Install dependencies:**
   ```bash
   # For Node.js
   npm install
   
   # For Python
   pip install -r requirements.txt
   ```

2. **Run the project:**
   ```bash
   # Check README.md for specific commands
   npm start
   # or
   python app.py
   ```

## Platform Support

AgentPrime detects your platform (Windows/Linux/Mac) and:
- Uses correct shell commands
- Creates appropriate scripts (.bat for Windows, .sh for Unix)
- Sets up paths correctly
- Includes platform-specific instructions

## Example: Creating a Runnable Project

Ask AgentPrime:
- "Create a Node.js Express API with authentication"
- "Create a Python Flask web app"
- "Create a React component library"

It will create:
- ✅ Complete folder structure
- ✅ All necessary files
- ✅ package.json/requirements.txt
- ✅ README with instructions
- ✅ .gitignore
- ✅ Runnable code

Then just:
1. `npm install` (or `pip install -r requirements.txt`)
2. `npm start` (or check README for run command)
3. Done! 🚀

