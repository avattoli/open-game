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

export function getTerrainHeight(x: number, z: number) {
  return (
    noise.GetNoise(x * TERRAIN.noiseScale, -z * TERRAIN.noiseScale) *
    TERRAIN.amplitude
  );
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
