# AgentPrime Project Creation Test

## Test: Create a Complete, Intelligent Project

### Challenge: Build "TaskFlow" - A Modern CLI Task Manager

**Test the AI's intelligence by asking it to create:**

A TypeScript CLI task management tool with:
- Interactive commands (add, list, complete, delete, search)
- Persistent JSON storage
- Priority levels (low, medium, high)
- Due dates with reminders
- Color-coded terminal output
- Export to JSON/CSV
- Clean architecture with proper error handling
- Complete project setup (package.json, tsconfig, README)

### How to Test:

1. Open AgentPrime
2. Open Composer (Ctrl+Shift+C or click Composer button)
3. Enter this prompt:

```
Create a modern TypeScript CLI task management tool called TaskFlow. It should have:
- Interactive commands (add, list, complete, delete tasks)
- Persistent storage in JSON file
- Priority levels (low, medium, high) and due dates
- Search and filter capabilities
- Beautiful color-coded terminal output using chalk
- Export tasks to JSON/CSV formats
- Clean, maintainable code structure with proper TypeScript types
- Complete project setup with package.json, tsconfig.json, and README
- Error handling and input validation
- Ready to run with npm install && npm start
```

### Success Criteria:

✅ **Intelligence Check:**
- AI understands the full scope and creates a proper architecture
- Generates ALL necessary files (not just main.ts)
- Includes proper dependencies in package.json
- Sets up TypeScript configuration correctly

✅ **Code Quality:**
- No placeholder code or TODOs
- Proper error handling throughout
- Type-safe with TypeScript
- Clean, readable, maintainable code
- Actually works when run

✅ **Completeness:**
- package.json with correct dependencies
- tsconfig.json properly configured
- README.md with usage instructions
- Proper project structure
- All imports and dependencies correct

✅ **User Experience:**
- Intuitive command interface
- Helpful error messages
- Color-coded output
- Export functionality works

### What Makes This Test Good:

This isn't just generating boilerplate - it requires:
1. **Architectural thinking** (how to structure the CLI, storage, commands)
2. **Dependency management** (knowing what packages to use: chalk, commander, etc.)
3. **TypeScript expertise** (proper types, interfaces, generics)
4. **User experience** (making it intuitive and polished)
5. **Completeness** (all files needed, not just code snippets)

### Expected Output:

The AI should generate:
- `package.json` - with dependencies (chalk, commander, date-fns, etc.)
- `tsconfig.json` - proper TypeScript config
- `src/index.ts` - main entry point
- `src/commands/` - command handlers
- `src/storage.ts` - JSON file persistence
- `src/types.ts` - TypeScript interfaces
- `src/utils.ts` - helper functions
- `README.md` - complete documentation
- `.gitignore` - proper ignores

All code should be complete, working, and production-ready.

---

**This test separates intelligent code generation from "stupid code bots" that just generate templates.**

