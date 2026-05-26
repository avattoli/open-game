import * as THREE from "three";
import {
  CURRENT_TERRAIN,
  LIGHTING,
  TERRAIN,
  TERRAIN_TYPES,
  WORLD,
} from "./constants";

// using ESM
import FastNoiseLite from "fastnoise-lite";

const noise = new FastNoiseLite();
noise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);

// secondary noise layer for high-frequency facets — gives each triangle its
// own slight tilt so flat shading produces visible variation.
const detailNoise = new FastNoiseLite(1337);
detailNoise.SetNoiseType(FastNoiseLite.NoiseType.OpenSimplex2);

export function createFloor() {
  const floorGeometry = new THREE.PlaneGeometry(
    WORLD.floorSize,
    WORLD.floorSize,
    TERRAIN.segments, // this is number of cuts across the width
    TERRAIN.segments, // this is number of cuts across the depth
  );

  const positions = floorGeometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);

    const height = getTerrainHeight(x, -y);
    positions.setZ(i, height);
  }
  positions.needsUpdate = true;
  floorGeometry.computeVertexNormals();

  const terrainColor =
    CURRENT_TERRAIN === TERRAIN_TYPES.forest
      ? WORLD.forestColor
      : WORLD.sandColor;

  const floorMaterial =
    CURRENT_TERRAIN === TERRAIN_TYPES.sand
      ? createSandMaterial(terrainColor)
      : new THREE.MeshStandardMaterial({
          color: terrainColor,
          roughness: 1,
          metalness: 0,
        });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;

  return floor;
}

function createSandMaterial(color: number) {
  const sandTexture = createSandTexture();
  sandTexture.wrapS = THREE.RepeatWrapping;
  sandTexture.wrapT = THREE.RepeatWrapping;
  sandTexture.repeat.set(TERRAIN.textureRepeat, TERRAIN.textureRepeat);
  sandTexture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    color,
    map: sandTexture,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}

function createSandTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create sand texture canvas context.");
  }

  const imageData = context.createImageData(size, size);

  for (let i = 0; i < imageData.data.length; i += 4) {
    const grain = Math.random() * 6 - 1;
    const red = 255;
    const green = 232 + grain * 0.6;
    const blue = 138 + grain * 0.4;

    imageData.data[i] = red;
    imageData.data[i + 1] = green;
    imageData.data[i + 2] = blue;
    imageData.data[i + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);

  return new THREE.CanvasTexture(canvas);
}

// Build a terrain chunk centered at (cx*size, cz*size). Vertices are sampled
// via `getTerrainHeight`, which is pure noise — neighbouring chunks share
// boundary vertex heights, so chunk seams are watertight.
export function createChunkTerrain(
  cx: number,
  cz: number,
  size: number,
  segments: number,
) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const positions = geometry.attributes.position;
  const worldOriginX = cx * size;
  const worldOriginZ = cz * size;

  for (let i = 0; i < positions.count; i++) {
    // PlaneGeometry is in XY at the time we read; rotate -90° around X later
    // turns local Y into world -Z, so we feed (-localY) into the noise.
    const localX = positions.getX(i);
    const localY = positions.getY(i);
    const worldX = worldOriginX + localX;
    const worldZ = worldOriginZ + -localY;
    positions.setZ(i, getTerrainHeight(worldX, worldZ));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const terrainColor =
    CURRENT_TERRAIN === TERRAIN_TYPES.forest
      ? WORLD.forestColor
      : WORLD.sandColor;

  const material =
    CURRENT_TERRAIN === TERRAIN_TYPES.sand
      ? createSandMaterial(terrainColor)
      : new THREE.MeshStandardMaterial({
          color: terrainColor,
          roughness: 1,
          metalness: 0,
          flatShading: true,
        });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(worldOriginX, 0, worldOriginZ);
  return mesh;
}

export function getTerrainHeight(x: number, z: number) {
  // fractal brownian motion: sum N octaves at doubling frequency / halving
  // amplitude. produces large mountain shapes with smaller hill detail
  // baked in from a single deterministic function.
  let amp = 1;
  let freq = TERRAIN.noiseScale;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < TERRAIN.octaves; i++) {
    sum += noise.GetNoise(x * freq, -z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  const n = sum / norm; // -1..1

  // shape the curve so peaks stand out and basins read flatter
  const shaped = Math.sign(n) * Math.pow(Math.abs(n), TERRAIN.ridgeExponent);
  const base = shaped * TERRAIN.amplitude;

  const detail =
    detailNoise.GetNoise(
      x * TERRAIN.detailNoiseScale,
      -z * TERRAIN.detailNoiseScale,
    ) * TERRAIN.detailAmplitude;

  return base + detail;
}

export function createSun() {
  const sunGeometry = new THREE.SphereGeometry(1.5, 32, 16);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: LIGHTING.sunColor,
  });

  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.copy(LIGHTING.sunPosition);

  return sun;
}
