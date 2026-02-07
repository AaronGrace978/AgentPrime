# AgentPrime Test Prompts by Capability

## 1. PROJECT SCAFFOLDING / TEMPLATES

### Test Prompt 1.1: Scaffold Phaser Game
```
scaffold_project phaser_game MyAwesomeGame
```
**Expected Result**: Creates a complete Phaser 3 game project with:
- `index.html` with Phaser CDN
- `game.js` with basic game loop, player controls, physics
- `styles.css` with game styling
- `package.json` with proper scripts
- README with setup instructions

### Test Prompt 1.2: Scaffold HTML5 Canvas Game
```
scaffold_project html_game SpaceShooter
```
**Expected Result**: Creates HTML5 Canvas game with:
- `index.html` with canvas element
- `game.js` with game loop, player movement (WASD/arrows)
- `styles.css` with game container styling
- Basic UI overlay with score and start button

### Test Prompt 1.3: Scaffold Express API
```
scaffold_project express_api TodoAPI
```
**Expected Result**: Creates Express.js REST API with:
- `server.js` with Express setup
- `package.json` with express dependency
- Basic route structure
- README with API documentation

### Test Prompt 1.4: Scaffold Python FastAPI
```
scaffold_project python_fastapi BookAPI
```
**Expected Result**: Creates FastAPI project with:
- `main.py` with FastAPI app
- `requirements.txt` with dependencies
- Basic route examples
- README with setup instructions

### Test Prompt 1.5: Scaffold Python Script
```
scaffold_project python_script DataProcessor
```
**Expected Result**: Creates Python CLI tool with:
- `main.py` with CLI interface
- `requirements.txt`
- Basic argument parsing
- README with usage examples

---
