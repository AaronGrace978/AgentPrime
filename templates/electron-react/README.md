# {{projectName}}

{{description}}

## Tech Stack

- **Electron** - Cross-platform desktop app framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
# Run in development mode
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Start production build
npm start
```

## Project Structure

```
{{projectName}}/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts     # Main entry point
│   │   └── preload.ts  # Preload script
│   └── renderer/       # React frontend
│       ├── index.html
│       ├── index.tsx
│       ├── App.tsx
│       └── styles.css
├── package.json
└── tsconfig.json
```

## License

MIT - Created with AgentPrime
