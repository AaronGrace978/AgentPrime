# TaskFlow 📋

A modern, intelligent CLI task management tool built with TypeScript.

## Features

- ✅ **Interactive Commands** - Add, list, complete, and delete tasks with ease
- 🎨 **Color-Coded Output** - Beautiful terminal interface with priority colors
- 📅 **Due Dates** - Set and track due dates with overdue highlighting
- 🔍 **Search & Filter** - Find tasks by title, description, priority, or status
- 💾 **Persistent Storage** - Tasks saved automatically in JSON format
- 📤 **Export** - Export your tasks to JSON or CSV
- 🎯 **Priority Levels** - Organize tasks by low, medium, or high priority
- ⚡ **Type-Safe** - Built with TypeScript for reliability

## Installation

```bash
npm install
npm run build
```

## Usage

### Add a Task
```bash
npm run dev add
# or
node dist/index.js add
```

### List Tasks
```bash
npm run dev list
npm run dev list -- --incomplete
npm run dev list -- --priority high
npm run dev list -- --search "meeting"
```

### Complete Tasks
```bash
npm run dev complete
```

### Delete Tasks
```bash
npm run dev delete
```

### Export Tasks
```bash
npm run dev export
```

## Project Structure

```
taskflow/
├── src/
│   ├── commands/      # Command handlers
│   │   ├── add.ts
│   │   ├── list.ts
│   │   ├── complete.ts
│   │   ├── delete.ts
│   │   └── export.ts
│   ├── types.ts       # TypeScript definitions
│   ├── storage.ts     # JSON persistence
│   ├── utils.ts       # Helper functions
│   └── index.ts       # Main entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
# Build
npm run build

# Run in development mode
npm run dev

# Watch mode
npm run watch
```

## License

MIT

