# Open Game

A tiny pirate-desert world experiment built with Three.js. The vibe is: cute
third-person character, sandy procedural worlds, random props, and the start of
a Growtopia-style world/economy sandbox.

## What It Does

- Generates chunky sandy terrain from noise.
- Streams the world in chunks around the player.
- Populates chunks with palms, rocks, ships, chests, tools, and little desert
  props.
- Uses a third-person orbit camera that follows the player.
- Uses Rapier for solid object collision and player sliding.
- Plays idle/walk character animations from a GLTF cowboy model.
- Has a debug collider view you can toggle with `B`.

## Terrain

Terrain is generated mathematically instead of being hand-modeled.

The height at any `(x, z)` comes from `getTerrainHeight` in
`src/world.ts`. It uses OpenSimplex noise through `fastnoise-lite`, then stacks
multiple octaves together using fractal brownian motion:

```txt
big slow noise + smaller faster noise + tiny detail noise = sandy hills
```

After the noise value is built, it gets shaped with an exponent so the terrain
has clearer peaks and flatter basins. Since terrain height is a pure function of
world position, neighboring chunks line up cleanly at their edges.

## Movement

The player is a visible Three.js character, but the solid body is handled by
Rapier.

The current setup is:

- `playerRoot` is the visual player position.
- Rapier owns a kinematic capsule collider for the player.
- WASD creates a movement vector relative to the camera yaw.
- Rapier's character controller computes how far the player can actually move.
- The Three.js character is synced back to the Rapier result.

That gives sliding along boxes/rocks/props without the old custom push-out math
getting too weird.

## Camera

The camera is a third-person orbit camera.

It does not move independently like a first-person camera. Instead:

```txt
camera position = player position + orbit offset
camera looks at player chest/head
```

The orbit offset comes from three values:

- `camera_radius`: how far the camera is from the player
- `cameraYaw`: left/right rotation around the player
- `cameraPitch`: up/down angle

Mouse movement changes yaw and pitch. Scroll changes the radius. Every frame the
camera recalculates its offset and looks back at the character.

## Running Locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Format:

```bash
npm run format
```

## Controls

- `WASD`: move
- `Shift`: sprint
- `Space`: jump
- mouse: orbit camera after pointer lock
- scroll: zoom camera
- `1 2 3 4`: hotbar slots
- `B`: toggle Rapier collider debug lines

## Stack

- Vite
- TypeScript
- Three.js
- Rapier 3D
- fastnoise-lite

## Current Goal

Make a small playable pirate-themed sandbox world first. The big dream is
worlds, trading, items, and economy systems later. For now, the fun part is
making the sand feel good under your boots.
