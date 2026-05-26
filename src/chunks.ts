import * as THREE from "three";
import type { Collider } from "@dimforge/rapier3d-compat";
import type { PhysicsWorld } from "./physics";
import { createChunkTerrain } from "./world";
import { populateChunk } from "./mapPopulation";

type ChunkKey = string;

interface LoadedChunk {
  cx: number;
  cz: number;
  objects: THREE.Object3D[];
  colliders: Collider[];
}

export interface ChunkManagerOptions {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  worldSeed: number;
  chunkSize: number;       // world units per chunk side
  chunkSegments: number;   // terrain mesh resolution per chunk
  viewRadius: number;      // load chunks within this Chebyshev distance
  unloadRadius: number;    // unload chunks beyond this (hysteresis)
}

export function createChunkManager(opts: ChunkManagerOptions) {
  const loaded = new Map<ChunkKey, LoadedChunk>();
  let lastCx = Number.POSITIVE_INFINITY;
  let lastCz = Number.POSITIVE_INFINITY;

  function key(cx: number, cz: number): ChunkKey {
    return `${cx},${cz}`;
  }

  function toChunkCoord(world: number) {
    return Math.round(world / opts.chunkSize);
  }

  function update(playerX: number, playerZ: number) {
    const cx = toChunkCoord(playerX);
    const cz = toChunkCoord(playerZ);
    if (cx === lastCx && cz === lastCz) return;
    lastCx = cx;
    lastCz = cz;

    // load anything inside the view radius that isn't loaded
    for (let dz = -opts.viewRadius; dz <= opts.viewRadius; dz++) {
      for (let dx = -opts.viewRadius; dx <= opts.viewRadius; dx++) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!loaded.has(key(nx, nz))) load(nx, nz);
      }
    }

    // unload anything outside the unload radius
    for (const [k, chunk] of loaded) {
      const distance = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
      if (distance > opts.unloadRadius) unload(k);
    }
  }

  function load(cx: number, cz: number) {
    const chunk: LoadedChunk = { cx, cz, objects: [], colliders: [] };

    const terrain = createChunkTerrain(
      cx,
      cz,
      opts.chunkSize,
      opts.chunkSegments,
    );
    opts.scene.add(terrain);
    chunk.objects.push(terrain);
    // TODO: terrain has no collider — player relies on `getTerrainHeight`
    // for snapping. When NPCs / projectiles need real terrain collision,
    // build a Rapier heightfield or trimesh collider per chunk here.

    populateChunk({
      cx,
      cz,
      chunkSize: opts.chunkSize,
      worldSeed: opts.worldSeed,
      scene: opts.scene,
      physics: opts.physics,
      onObjectAdded: (obj) => chunk.objects.push(obj),
      onCollidersAdded: (cs) => chunk.colliders.push(...cs),
    });

    loaded.set(key(cx, cz), chunk);
  }

  function unload(k: ChunkKey) {
    const chunk = loaded.get(k);
    if (!chunk) return;

    for (const obj of chunk.objects) {
      opts.scene.remove(obj);
      disposeDeep(obj);
    }
    for (const c of chunk.colliders) opts.physics.removeCollider(c);
    loaded.delete(k);
  }

  function disposeDeep(root: THREE.Object3D) {
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry?.dispose();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) m?.dispose();
    });
  }

  return { update };
}
