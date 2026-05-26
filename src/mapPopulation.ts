import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Collider } from "@dimforge/rapier3d-compat";
import { WORLD } from "./constants";
import type { PhysicsWorld } from "./physics";
import { getTerrainHeight } from "./world";

// shared across all chunks; loading the same GLB twice is wasteful
const sharedModelCache = new Map<string, Promise<THREE.Object3D>>();
const sharedLoader = new GLTFLoader();

const DESERT_MODEL_BASE = "/models/kenney-desert/";

const POPULATION = {
  seed: 813817,
  mapPadding: 18,
  shipChance: 0.7,
  treasureNearShipChance: 0.75,
  palmCount: 18,
  grassCount: 28,
  cactusCount: 12,
  rockCount: 18,
  structureCount: 9,
};

type ModelPlacement = {
  file: string;
  x: number;
  z: number;
  scale: number;
  rotationY: number;
  yOffset?: number;
};

type CompoundPart = {
  // model-local units at scale=1; origin = bottom-center of model AABB
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  width: number;
  height: number;
  depth: number;
};

type ModelCollider =
  | {
      shape: "box";
      widthScale?: number;
      depthScale?: number;
      heightScale?: number;
    }
  | {
      shape: "cylinder";
      radiusScale?: number;
      heightScale?: number;
      // extend the collider downward by this many world units below the
      // model's visible bottom. useful on uneven terrain where a slope
      // would otherwise expose an air gap on the downhill side.
      bottomPad?: number;
      // anchor the cylinder's x/z at the model's origin instead of the
      // bbox center. use this for bent / offset models (e.g. curved palm)
      // where the trunk base sits at the origin but the bbox drifts off.
      anchorAtOrigin?: boolean;
    }
  | {
      shape: "compound";
      parts: CompoundPart[];
    }
  | {
      shape: "none";
    };

const PALM_MODELS = [
  "palm-straight.glb",
  "palm-bend.glb",
  "palm-detailed-straight.glb",
  "palm-detailed-bend.glb",
];

const GRASS_MODELS = [
  "grass.glb",
  "grass-plant.glb",
  "grass-patch.glb",
  "patch-grass.glb",
  "patch-grass-foliage.glb",
  "patch-sand-foliage.glb",
];

const ROCK_MODELS = [
  "rocks-a.glb",
  "rocks-b.glb",
  "rocks-c.glb",
  "rocks-sand-a.glb",
  "rocks-sand-b.glb",
  "rocks-sand-c.glb",
];

const STRUCTURE_MODELS = [
  "structure.glb",
  "structure-fence.glb",
  "structure-fence-sides.glb",
  "structure-platform.glb",
  "structure-platform-small.glb",
  "tower-complete-small.glb",
  "flag-pirate.glb",
  "cannon.glb",
];

const SHIP_MODELS = [
  "ship-wreck.glb",
  "ship-pirate-small.glb",
  "ship-pirate-medium.glb",
  "boat-row-small.glb",
];

const TREASURE_MODELS = [
  "chest.glb",
  "crate.glb",
  "crate-bottles.glb",
  "barrel.glb",
  "bottle.glb",
  "bottle-large.glb",
  "tool-shovel.glb",
];

const MODEL_COLLIDERS: Record<string, ModelCollider> = {
  "palm-straight.glb": {
    shape: "cylinder",
    radiusScale: 0.12,
    heightScale: 0.85,
  },
  "palm-bend.glb": {
    shape: "cylinder",
    radiusScale: 0.12,
    heightScale: 0.8,
    anchorAtOrigin: true,
  },
  "palm-detailed-straight.glb": {
    shape: "cylinder",
    radiusScale: 0.12,
    heightScale: 0.85,
  },
  "palm-detailed-bend.glb": {
    shape: "cylinder",
    radiusScale: 0.12,
    heightScale: 0.8,
    anchorAtOrigin: true,
  },

  "grass.glb": { shape: "none" },
  "grass-plant.glb": { shape: "none" },
  "grass-patch.glb": { shape: "none" },
  "patch-grass.glb": { shape: "none" },
  "patch-grass-foliage.glb": { shape: "none" },
  "patch-sand-foliage.glb": { shape: "none" },

  "rocks-a.glb": { shape: "cylinder", radiusScale: 0.95, heightScale: 0.9, bottomPad: 1.5 },
  "rocks-b.glb": { shape: "cylinder", radiusScale: 0.95, heightScale: 0.9, bottomPad: 1.5 },
  "rocks-c.glb": { shape: "cylinder", radiusScale: 0.95, heightScale: 0.9, bottomPad: 1.5 },
  "rocks-sand-a.glb": {
    shape: "cylinder",
    radiusScale: 0.95,
    heightScale: 0.9,
    bottomPad: 1.5,
  },
  "rocks-sand-b.glb": {
    shape: "cylinder",
    radiusScale: 0.95,
    heightScale: 0.9,
    bottomPad: 1.5,
  },
  "rocks-sand-c.glb": {
    shape: "cylinder",
    radiusScale: 0.95,
    heightScale: 0.9,
    bottomPad: 1.5,
  },

  "structure.glb": { shape: "box", widthScale: 0.85, depthScale: 0.85 },
  "structure-fence.glb": {
    shape: "box",
    widthScale: 0.95,
    depthScale: 0.45,
  },
  "structure-fence-sides.glb": {
    shape: "box",
    widthScale: 0.9,
    depthScale: 0.9,
  },
  "structure-platform.glb": {
    shape: "box",
    widthScale: 0.85,
    depthScale: 0.85,
    heightScale: 0.7,
  },
  "structure-platform-small.glb": {
    shape: "box",
    widthScale: 0.85,
    depthScale: 0.85,
    heightScale: 0.7,
  },
  "tower-complete-small.glb": {
    shape: "box",
    widthScale: 0.85,
    depthScale: 0.85,
  },
  "flag-pirate.glb": { shape: "cylinder", radiusScale: 0.12, heightScale: 0.9 },
  "cannon.glb": { shape: "box", widthScale: 0.8, depthScale: 0.8 },

  // ships: hand-authored compound colliders. parts are in model-local units
  // (scale=1); origin is at the bottom-center of the model's AABB, +Z is
  // forward in model space. tweak these in place to dial in the feel.
  "ship-wreck.glb": {
    shape: "compound",
    parts: [
      { offsetY: 0.25, width: 1.2, height: 0.5, depth: 3.2 },
    ],
  },
  "ship-pirate-small.glb": {
    shape: "compound",
    parts: [
      { offsetY: 0.3, width: 1.3, height: 0.6, depth: 3.4 },
      { offsetY: 0.9, offsetZ: -1.3, width: 1.1, height: 0.5, depth: 1.0 },
    ],
  },
  "ship-pirate-medium.glb": {
    shape: "compound",
    parts: [
      { offsetY: 0.3, width: 1.4, height: 0.6, depth: 4.2 },
      { offsetY: 1.0, offsetZ: -1.6, width: 1.2, height: 0.5, depth: 1.2 },
    ],
  },
  "boat-row-small.glb": { shape: "box", widthScale: 0.8, depthScale: 0.85 },
  "well.glb": {
    shape: "box",
    widthScale: 0.75,
    depthScale: 0.75,
    heightScale: 0.8,
  },

  "chest.glb": { shape: "box", widthScale: 0.85, depthScale: 0.85 },
  "crate.glb": { shape: "box", widthScale: 0.9, depthScale: 0.9 },
  "crate-bottles.glb": { shape: "box", widthScale: 0.9, depthScale: 0.9 },
  "barrel.glb": { shape: "cylinder", radiusScale: 0.45, heightScale: 0.9 },
  "bottle.glb": { shape: "cylinder", radiusScale: 0.4, heightScale: 0.9 },
  "bottle-large.glb": { shape: "cylinder", radiusScale: 0.4, heightScale: 0.9 },
  "tool-shovel.glb": { shape: "none" },
};

export function populateMapWithDesertItems(
  scene: THREE.Scene,
  physics: PhysicsWorld,
) {
  const rng = createRng(POPULATION.seed);
  const loader = new GLTFLoader();
  const modelCache = new Map<string, Promise<THREE.Object3D>>();

  function addModel(placement: ModelPlacement) {
    loadModel(loader, modelCache, placement.file)
      .then((source) => {
        const item = source.clone(true);
        item.scale.setScalar(placement.scale);
        item.rotation.y = placement.rotationY;
        placeObjectOnTerrain(
          item,
          placement.x,
          placement.z,
          placement.yOffset ?? 0,
        );

        scene.add(item);
        addColliderForModel(item, placement, physics);
      })
      .catch((error: unknown) => {
        console.error(`Failed to load ${placement.file}`, error);
      });
  }

  if (rng() < POPULATION.shipChance) {
    const shipPoint = randomPointNearEdge(rng);
    const shipRotation = randomBetween(rng, 0, Math.PI * 2);

    addModel({
      file: pick(rng, SHIP_MODELS),
      x: shipPoint.x,
      z: shipPoint.z,
      scale: randomBetween(rng, 2.2, 3.6),
      rotationY: shipRotation,
    });

    addWellNearShip(addModel, shipPoint.x, shipPoint.z, shipRotation, rng);

    if (rng() < POPULATION.treasureNearShipChance) {
      addTreasureCluster(addModel, rng, shipPoint.x, shipPoint.z);
    }
  }

  addModelGroup(addModel, rng, PALM_MODELS, POPULATION.palmCount, 1.5, 2.5);
  addModelGroup(addModel, rng, GRASS_MODELS, POPULATION.grassCount, 0.8, 1.6);
  addModelGroup(addModel, rng, ROCK_MODELS, POPULATION.rockCount, 1.1, 2.2);
  addModelGroup(
    addModel,
    rng,
    STRUCTURE_MODELS,
    POPULATION.structureCount,
    1.1,
    2,
  );

  for (let i = 0; i < POPULATION.cactusCount; i++) {
    const point = randomPoint(rng);
    const cactus = createCactus(rng);
    placeObjectOnTerrain(cactus, point.x, point.z, 0);
    scene.add(cactus);
    physics.addStaticCylinder({
      x: point.x,
      y: getTerrainHeight(point.x, point.z) + 3.8 / 2,
      z: point.z,
      radius: 0.45,
      height: 3.8,
    });
  }
}

function addModelGroup(
  addModel: (placement: ModelPlacement) => void,
  rng: () => number,
  models: string[],
  count: number,
  minScale: number,
  maxScale: number,
) {
  for (let i = 0; i < count; i++) {
    const point = randomPoint(rng);

    addModel({
      file: pick(rng, models),
      x: point.x,
      z: point.z,
      scale: randomBetween(rng, minScale, maxScale),
      rotationY: randomBetween(rng, 0, Math.PI * 2),
    });
  }
}

function addTreasureCluster(
  addModel: (placement: ModelPlacement) => void,
  rng: () => number,
  shipX: number,
  shipZ: number,
) {
  const itemCount = Math.floor(randomBetween(rng, 3, 7));

  for (let i = 0; i < itemCount; i++) {
    const angle = randomBetween(rng, 0, Math.PI * 2);
    const distance = randomBetween(rng, 8, 18);

    addModel({
      file: pick(rng, TREASURE_MODELS),
      x: clampToMap(shipX + Math.cos(angle) * distance),
      z: clampToMap(shipZ + Math.sin(angle) * distance),
      scale: randomBetween(rng, 0.9, 1.4),
      rotationY: randomBetween(rng, 0, Math.PI * 2),
    });
  }
}

function addWellNearShip(
  addModel: (placement: ModelPlacement) => void,
  shipX: number,
  shipZ: number,
  rotationY: number,
  rng: () => number,
) {
  const offsetDistance = randomBetween(rng, 9, 15);

  addModel({
    file: "well.glb",
    x: clampToMap(shipX + Math.cos(rotationY) * offsetDistance),
    z: clampToMap(shipZ + Math.sin(rotationY) * offsetDistance),
    scale: randomBetween(rng, 0.0009, 0.0012),
    rotationY: randomBetween(rng, 0, Math.PI * 2),
    yOffset: -0.4,
  });
}

function createCactus(rng: () => number) {
  const cactus = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x3f8f4e,
    roughness: 1,
    metalness: 0,
  });
  const height = randomBetween(rng, 2.2, 3.6);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.32, height, 6),
    material,
  );

  trunk.position.y = height / 2;
  cactus.add(trunk);

  if (rng() > 0.35) {
    cactus.add(createCactusArm(material, -0.35, height * 0.58, -0.45));
  }

  if (rng() > 0.5) {
    cactus.add(createCactusArm(material, 0.35, height * 0.72, 0.45));
  }

  cactus.rotation.y = randomBetween(rng, 0, Math.PI * 2);

  return cactus;
}

function createCactusArm(
  material: THREE.Material,
  x: number,
  y: number,
  rotationZ: number,
) {
  const arm = new THREE.Group();
  const horizontal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.17, 0.8, 6),
    material,
  );
  const vertical = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.16, 0.75, 6),
    material,
  );

  horizontal.rotation.z = Math.PI / 2;
  horizontal.position.set(x, y, 0);
  vertical.position.set(x * 1.9, y + 0.35, 0);
  vertical.rotation.z = rotationZ * 0.12;
  arm.add(horizontal);
  arm.add(vertical);

  return arm;
}

function loadModel(
  loader: GLTFLoader,
  modelCache: Map<string, Promise<THREE.Object3D>>,
  file: string,
) {
  const cachedModel = modelCache.get(file);

  if (cachedModel) {
    return cachedModel;
  }

  const modelPromise = new Promise<THREE.Object3D>((resolve, reject) => {
    loader.load(
      `${DESERT_MODEL_BASE}${file}`,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject,
    );
  });

  modelCache.set(file, modelPromise);

  return modelPromise;
}

function placeObjectOnTerrain(
  object: THREE.Object3D,
  x: number,
  z: number,
  yOffset: number,
) {
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const bottomOffset = Number.isFinite(box.min.y) ? -box.min.y : 0;
  const groundY = getTerrainHeight(x, z);

  object.position.set(x, groundY + bottomOffset + yOffset, z);
}

function addColliderForModel(
  item: THREE.Object3D,
  placement: ModelPlacement,
  physics: PhysicsWorld,
): Collider[] {
  const out: Collider[] = [];
  const collider = MODEL_COLLIDERS[placement.file];

  if (!collider || collider.shape === "none") {
    return out;
  }

  item.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(item);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  box.getCenter(center);
  box.getSize(size);

  if (collider.shape === "cylinder") {
    const footprintRadius = Math.max(size.x, size.z) / 2;
    const bottomPad = collider.bottomPad ?? 0;
    const height = size.y * (collider.heightScale ?? 1) + bottomPad;

    const cx = collider.anchorAtOrigin ? placement.x : center.x;
    const cz = collider.anchorAtOrigin ? placement.z : center.z;

    out.push(
      physics.addStaticCylinder({
        x: cx,
        // bottom now sits at (box.min.y - bottomPad), so the collider
        // extends into the ground by `bottomPad` units.
        y: box.min.y - bottomPad + height / 2,
        z: cz,
        radius: footprintRadius * (collider.radiusScale ?? 0.5),
        height,
      }),
    );
    return out;
  }

  if (collider.shape === "compound") {
    // anchor each part at the model's world-space bottom-center, then rotate
    // its local offset around Y by the placement's rotation.
    const baseX = placement.x;
    const baseZ = placement.z;
    const baseY = box.min.y;
    const scale = placement.scale;
    const cosY = Math.cos(placement.rotationY);
    const sinY = Math.sin(placement.rotationY);

    for (const part of collider.parts) {
      const localX = (part.offsetX ?? 0) * scale;
      const localZ = (part.offsetZ ?? 0) * scale;
      const worldX = cosY * localX + sinY * localZ;
      const worldZ = -sinY * localX + cosY * localZ;

      out.push(
        physics.addStaticBox({
          x: baseX + worldX,
          y: baseY + (part.offsetY ?? 0) * scale,
          z: baseZ + worldZ,
          width: part.width * scale,
          height: part.height * scale,
          depth: part.depth * scale,
          rotationY: placement.rotationY,
        }),
      );
    }
    return out;
  }

  out.push(
    physics.addStaticBox({
      x: center.x,
      y: box.min.y + (size.y * (collider.heightScale ?? 1)) / 2,
      z: center.z,
      width: size.x * (collider.widthScale ?? 1),
      depth: size.z * (collider.depthScale ?? 1),
      height: size.y * (collider.heightScale ?? 1),
      rotationY: 0,
    }),
  );
  return out;
}

// ---- chunk-scoped population ----

const CHUNK_DENSITY = {
  // items per chunk area unit (chunkSize * chunkSize). Tune for visual density.
  palm: 0.0018,
  grass: 0.005,
  rock: 0.003,
  cactus: 0.0018,
};

// chance a given chunk hosts a ship. ships are kept fully inside their owning
// chunk so they don't double-spawn or get split across boundaries.
const CHUNK_SHIP_CHANCE = 0.01;
const CHUNK_TREASURE_NEAR_SHIP_CHANCE = 0.6;
// no trees / rocks / cacti within this radius of a ship so the ship reads
// as the focal point of a clearing.
const SHIP_CLEARING_RADIUS = 12;

export function populateChunk(opts: {
  cx: number;
  cz: number;
  chunkSize: number;
  worldSeed: number;
  scene: THREE.Scene;
  physics: PhysicsWorld;
  // chunk owns the lifetime of everything spawned here
  onObjectAdded: (obj: THREE.Object3D) => void;
  onCollidersAdded: (colliders: Collider[]) => void;
}) {
  const rng = chunkRng(opts.cx, opts.cz, opts.worldSeed);
  const area = opts.chunkSize * opts.chunkSize;

  const addModel = (placement: ModelPlacement) => {
    loadModel(sharedLoader, sharedModelCache, placement.file)
      .then((source) => {
        const item = source.clone(true);
        item.scale.setScalar(placement.scale);
        item.rotation.y = placement.rotationY;
        placeObjectOnTerrain(item, placement.x, placement.z, placement.yOffset ?? 0);

        opts.scene.add(item);
        opts.onObjectAdded(item);
        opts.onCollidersAdded(addColliderForModel(item, placement, opts.physics));
      })
      .catch((error: unknown) => {
        console.error(`Failed to load ${placement.file}`, error);
      });
  };

  // ships first so we can drop nearby clutter to keep the scene composed
  const exclusionZones: { x: number; z: number; radius: number }[] = [];
  if (rng() < CHUNK_SHIP_CHANCE) {
    spawnShipInChunk(addModel, rng, opts, exclusionZones);
  }

  spawnGroup(addModel, rng, opts, PALM_MODELS, CHUNK_DENSITY.palm * area, 1.5, 2.5, exclusionZones);
  // grass is small / decorative, fine right up against the hull
  spawnGroup(addModel, rng, opts, GRASS_MODELS, CHUNK_DENSITY.grass * area, 0.8, 1.6, null);
  spawnGroup(addModel, rng, opts, ROCK_MODELS, CHUNK_DENSITY.rock * area, 1.1, 2.2, exclusionZones);

  // cactus uses bespoke geometry + cylinder collider instead of GLB
  const cactusCount = Math.round(CHUNK_DENSITY.cactus * area);
  for (let i = 0; i < cactusCount; i++) {
    const p = pickPointAvoiding(rng, opts, exclusionZones);
    if (!p) continue;
    const cactus = createCactus(rng);
    placeObjectOnTerrain(cactus, p.x, p.z, 0);
    opts.scene.add(cactus);
    opts.onObjectAdded(cactus);
    opts.onCollidersAdded([
      opts.physics.addStaticCylinder({
        x: p.x,
        y: getTerrainHeight(p.x, p.z) + 3.8 / 2,
        z: p.z,
        radius: 0.45,
        height: 3.8,
      }),
    ]);
  }

  // TODO: structures (towers, platforms, etc.) — same chunk-bounding
  // approach as ships once you decide spawn rules.
}

function spawnShipInChunk(
  addModel: (placement: ModelPlacement) => void,
  rng: () => number,
  opts: { cx: number; cz: number; chunkSize: number },
  exclusionZones: { x: number; z: number; radius: number }[],
) {
  // pick a spawn point with margin so the ship + treasure cluster stay
  // inside this chunk (no cross-chunk spillover, no double-spawn).
  const margin = Math.min(opts.chunkSize * 0.35, 12);
  const half = opts.chunkSize / 2 - margin;
  if (half <= 0) return;

  const x = opts.cx * opts.chunkSize + randomBetween(rng, -half, half);
  const z = opts.cz * opts.chunkSize + randomBetween(rng, -half, half);
  const rotationY = randomBetween(rng, 0, Math.PI * 2);

  exclusionZones.push({ x, z, radius: SHIP_CLEARING_RADIUS });

  addModel({
    file: pick(rng, SHIP_MODELS),
    x,
    z,
    scale: randomBetween(rng, 2.2, 3.2),
    rotationY,
  });

  if (rng() < CHUNK_TREASURE_NEAR_SHIP_CHANCE) {
    const itemCount = Math.floor(randomBetween(rng, 2, 5));
    for (let i = 0; i < itemCount; i++) {
      const angle = randomBetween(rng, 0, Math.PI * 2);
      const distance = randomBetween(rng, 4, Math.min(margin - 1, 10));
      addModel({
        file: pick(rng, TREASURE_MODELS),
        x: x + Math.cos(angle) * distance,
        z: z + Math.sin(angle) * distance,
        scale: randomBetween(rng, 0.9, 1.4),
        rotationY: randomBetween(rng, 0, Math.PI * 2),
      });
    }
  }
}

function spawnGroup(
  addModel: (placement: ModelPlacement) => void,
  rng: () => number,
  opts: { cx: number; cz: number; chunkSize: number },
  models: string[],
  count: number,
  minScale: number,
  maxScale: number,
  exclusions: { x: number; z: number; radius: number }[] | null,
) {
  const n = Math.round(count);
  for (let i = 0; i < n; i++) {
    const point = pickPointAvoiding(rng, opts, exclusions);
    if (!point) continue;
    addModel({
      file: pick(rng, models),
      x: point.x,
      z: point.z,
      scale: randomBetween(rng, minScale, maxScale),
      rotationY: randomBetween(rng, 0, Math.PI * 2),
    });
  }
}

function randomPointInChunk(
  rng: () => number,
  opts: { cx: number; cz: number; chunkSize: number },
) {
  const half = opts.chunkSize / 2;
  return {
    x: opts.cx * opts.chunkSize + randomBetween(rng, -half, half),
    z: opts.cz * opts.chunkSize + randomBetween(rng, -half, half),
  };
}

// try a few times to find a point in-chunk that isn't inside any exclusion
// zone. returns null if it can't — caller should treat that as "skip this item".
function pickPointAvoiding(
  rng: () => number,
  opts: { cx: number; cz: number; chunkSize: number },
  exclusions: { x: number; z: number; radius: number }[] | null,
) {
  const attempts = exclusions && exclusions.length > 0 ? 6 : 1;
  for (let i = 0; i < attempts; i++) {
    const p = randomPointInChunk(rng, opts);
    if (!exclusions || !isInsideAnyZone(p.x, p.z, exclusions)) return p;
  }
  return null;
}

function isInsideAnyZone(
  x: number,
  z: number,
  zones: { x: number; z: number; radius: number }[],
) {
  for (const zone of zones) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    if (dx * dx + dz * dz < zone.radius * zone.radius) return true;
  }
  return false;
}

function chunkRng(cx: number, cz: number, worldSeed: number) {
  // hash chunk coords + world seed into a single 32-bit value, then
  // run the same mulberry-style PRNG used by `createRng`.
  let value =
    (Math.imul(cx | 0, 374761393) +
      Math.imul(cz | 0, 668265263) +
      (worldSeed | 0)) |
    0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let r = Math.imul(value ^ (value >>> 15), 1 | value);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPoint(rng: () => number) {
  const halfSize = WORLD.floorSize / 2 - POPULATION.mapPadding;

  return {
    x: randomBetween(rng, -halfSize, halfSize),
    z: randomBetween(rng, -halfSize, halfSize),
  };
}

function randomPointNearEdge(rng: () => number) {
  const halfSize = WORLD.floorSize / 2 - POPULATION.mapPadding;
  const edgeDistance = randomBetween(rng, halfSize * 0.55, halfSize);
  const angle = randomBetween(rng, 0, Math.PI * 2);

  return {
    x: Math.cos(angle) * edgeDistance,
    z: Math.sin(angle) * edgeDistance,
  };
}

function randomBetween(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

function pick<T>(rng: () => number, items: T[]) {
  return items[Math.floor(rng() * items.length)];
}

function clampToMap(value: number) {
  const halfSize = WORLD.floorSize / 2 - POPULATION.mapPadding;

  return THREE.MathUtils.clamp(value, -halfSize, halfSize);
}

function createRng(seed: number) {
  let value = seed;

  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;

    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result =
      (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
