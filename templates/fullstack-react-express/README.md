# {{projectName}}

{{description}}

## Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool

### Backend
- **Express.js** - Node.js web framework
- **TypeScript** - Type safety
- **Node.js** - Runtime

## Getting Started

### Prerequisites
- Node.js 18+

### Quick Start

```bash
# Install all dependencies
npm run install:all

# Run both frontend and backend
npm run dev
```

### Manual Setup

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to `http://localhost:3001`.

## Project Structure

```
{{projectName}}/
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   └── routes/
│   │       └── items.ts
│   ├── package.json
│   └── tsconfig.json
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/items` - List all items
- `POST /api/items` - Create new item
- `GET /api/items/:id` - Get item by ID
- `DELETE /api/items/:id` - Delete item

## License

MIT - Created with AgentPrime
