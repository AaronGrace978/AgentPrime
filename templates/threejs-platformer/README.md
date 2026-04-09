# {{projectName}}

{{description}}

A **Vite + React + TypeScript** starter with **Three.js** for a side-scrolling platformer. The baseline includes deterministic WASD movement, a dedicated jump action on Space, layered platforms, collectibles, and a camera that tracks the action from a playful 2.5D angle.

## Features

- Side-scrolling platformer movement with **A/D** for horizontal travel
- **W/S** lane shifting for 2.5D movement depth
- **Space** to jump and **R** to restart the run
- Collectibles, score HUD, respawn handling, and a fixed handcrafted course
- Fast dev workflow with Vite and TypeScript

## Quick Start

```bash
npm install
npm run dev
```

Open the local URL printed by Vite and start running.

## Customize

- **Level layout and collectibles**: `src/game/world/World.ts`
- **Movement and physics**: `src/game/entities/Player.ts`
- **Input rules**: `src/game/utils/Controls.ts`
- **Camera, HUD, and game loop**: `src/game/Game.ts`

## Building for Production

```bash
npm run build
```
