import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { addBoxCollider, addCylinderCollider } from "./collision";
import { WORLD } from "./constants";
import { getTerrainHeight } from "./world";

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
  "palm-straight.glb": { shape: "cylinder", radiusScale: 0.12, heightScale: 0.85 },
  "palm-bend.glb": { shape: "cylinder", radiusScale: 0.12, heightScale: 0.8 },
  "palm-detailed-straight.glb": {
    shape: "cylinder",
    radiusScale: 0.12,
    heightScale: 0.85,
  },
  "palm-detailed-bend.glb": {
    shape: "cylinder",
    radiusScale: 0.12,
    heightScale: 0.8,
  },

  "grass.glb": { shape: "none" },
  "grass-plant.glb": { shape: "none" },
  "grass-patch.glb": { shape: "none" },
  "patch-grass.glb": { shape: "none" },
  "patch-grass-foliage.glb": { shape: "none" },
  "patch-sand-foliage.glb": { shape: "none" },

  "rocks-a.glb": { shape: "cylinder", radiusScale: 0.42, heightScale: 0.8 },
  "rocks-b.glb": { shape: "cylinder", radiusScale: 0.42, heightScale: 0.8 },
  "rocks-c.glb": { shape: "cylinder", radiusScale: 0.42, heightScale: 0.8 },
  "rocks-sand-a.glb": { shape: "cylinder", radiusScale: 0.42, heightScale: 0.8 },
  "rocks-sand-b.glb": { shape: "cylinder", radiusScale: 0.42, heightScale: 0.8 },
  "rocks-sand-c.glb": { shape: "cylinder", radiusScale: 0.42, heightScale: 0.8 },

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

  "ship-wreck.glb": { shape: "box", widthScale: 0.75, depthScale: 0.8, heightScale: 0.7 },
  "ship-pirate-small.glb": {
    shape: "box",
    widthScale: 0.75,
    depthScale: 0.8,
    heightScale: 0.7,
  },
  "ship-pirate-medium.glb": {
    shape: "box",
    widthScale: 0.75,
    depthScale: 0.8,
    heightScale: 0.7,
  },
  "boat-row-small.glb": { shape: "box", widthScale: 0.8, depthScale: 0.85 },
  "well.glb": { shape: "box", widthScale: 0.75, depthScale: 0.75, heightScale: 0.8 },

  "chest.glb": { shape: "box", widthScale: 0.85, depthScale: 0.85 },
  "crate.glb": { shape: "box", widthScale: 0.9, depthScale: 0.9 },
  "crate-bottles.glb": { shape: "box", widthScale: 0.9, depthScale: 0.9 },
  "barrel.glb": { shape: "cylinder", radiusScale: 0.45, heightScale: 0.9 },
  "bottle.glb": { shape: "cylinder", radiusScale: 0.4, heightScale: 0.9 },
  "bottle-large.glb": { shape: "cylinder", radiusScale: 0.4, heightScale: 0.9 },
  "tool-shovel.glb": { shape: "none" },
};

export function populateMapWithDesertItems(scene: THREE.Scene) {
  const rng = createRng(POPULATION.seed);
  const loader = new GLTFLoader();
  const modelCache = new Map<string, Promise<THREE.Object3D>>();

  function addModel(placement: ModelPlacement) {
    loadModel(loader, modelCache, placement.file)
      .then((source) => {
        const item = source.clone(true);
        item.scale.setScalar(placement.scale);
        const modelSize = measureObjectSize(item);
        item.rotation.y = placement.rotationY;
        placeObjectOnTerrain(
          item,
          placement.x,
          placement.z,
          placement.yOffset ?? 0,
        );

        scene.add(item);
        addColliderForModel(placement, modelSize);
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
    addCylinderCollider({
      x: point.x,
      z: point.z,
      baseY: getTerrainHeight(point.x, point.z),
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
  placement: ModelPlacement,
  modelSize: THREE.Vector3,
) {
  const collider = MODEL_COLLIDERS[placement.file];

  if (!collider || collider.shape === "none") {
    return;
  }

  const baseY =
    getTerrainHeight(placement.x, placement.z) + (placement.yOffset ?? 0);

  if (collider.shape === "cylinder") {
    const footprintRadius = Math.max(modelSize.x, modelSize.z) / 2;

    addCylinderCollider({
      x: placement.x,
      z: placement.z,
      baseY,
      radius: footprintRadius * (collider.radiusScale ?? 0.5),
      height: modelSize.y * (collider.heightScale ?? 1),
    });
    return;
  }

  addBoxCollider({
    x: placement.x,
    z: placement.z,
    baseY,
    width: modelSize.x * (collider.widthScale ?? 1),
    depth: modelSize.z * (collider.depthScale ?? 1),
    height: modelSize.y * (collider.heightScale ?? 1),
    rotationY: placement.rotationY,
  });
}

function measureObjectSize(object: THREE.Object3D) {
  object.position.set(0, 0, 0);
  object.rotation.set(0, 0, 0);
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  return size;
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
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
