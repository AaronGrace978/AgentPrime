# {{projectName}}

{{description}}

A **Vite + React + TypeScript** starter with **Three.js**. The default scene is a **neutral space environment** (starfield + simple flight controls) — a blank canvas for your game, **not** a voxel/block world.

## Features

- Three.js rendering with a lightweight scene setup
- First-person style look (pointer lock) + **WASD** move, **Space** up, **Shift/C** down, **X** brake
- Fast dev workflow with Vite and TypeScript

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — click the view to capture the mouse.

## Customize

- **Scene & content**: `src/game/world/World.ts`
- **Movement & feel**: `src/game/entities/Player.ts`, `src/game/utils/Controls.ts`
- **Main loop**: `src/game/Game.ts`

## Building for Production

```bash
npm run build
```
