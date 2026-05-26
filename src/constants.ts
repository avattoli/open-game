import * as THREE from "three";

export const CAMERA = {
  fov: 75,
  near: 0.1,
  far: 1000,
  startPosition: new THREE.Vector3(0, 5, 10),
  lookAt: new THREE.Vector3(0, 0, 0),
};

export const PLAYER = {
  height: 2,
  radius: 0.45,
  groundHeight: 2,
  moveSpeed: 0.08,
  sprintMultiplier: 1.8,
  jumpStrength: 0.18,
  gravity: 0.003,
  spawnPosition: new THREE.Vector3(0, 0, 0),
};

export const WORLD = {
  skyColor: 0x87ceeb,
  sandColor: 0xffdc7a,
  forestColor: 0x4f8f3a,
  floorSize: 260,
};

export const TERRAIN_TYPES = {
  sand: 1,
  forest: 2,
};

export const CURRENT_TERRAIN = TERRAIN_TYPES.sand;

export const TERRAIN = {
  segments: 220,
  // base frequency for the fbm stack — lower = bigger mountain features
  noiseScale: 0.4,
  // peak height in world units. octaves are normalized to [-1, 1] then shaped.
  amplitude: 30,
  // how many octaves to sum; each doubles frequency, halves amplitude
  octaves: 5,
  // exponent applied to abs(noise) before scaling — >1 sharpens peaks/valleys
  ridgeExponent: 1.6,
  detailNoiseScale: 18,
  detailAmplitude: 0.18,
  textureRepeat: 12,
};

export const LIGHTING = {
  ambientColor: 0xffffff,
  ambientIntensity: 0.35,
  sunColor: 0xfff2b0,
  sunIntensity: 2.2,
  sunPosition: new THREE.Vector3(15, 40, 10),
};
