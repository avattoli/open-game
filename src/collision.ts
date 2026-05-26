import * as THREE from "three";
import { PLAYER } from "./constants";

type BoxCollider = {
  type: "box";
  x: number;
  z: number;
  baseY: number;
  width: number;
  depth: number;
  height: number;
  rotationY: number;
};

type CylinderCollider = {
  type: "cylinder";
  x: number;
  z: number;
  baseY: number;
  radius: number;
  height: number;
};

type Collider = BoxCollider | CylinderCollider;

const colliders: Collider[] = [];
const PUSH_EPSILON = 0.001;

export function addBoxCollider(collider: Omit<BoxCollider, "type">) {
  colliders.push({ ...collider, type: "box" });
}

export function addCylinderCollider(collider: Omit<CylinderCollider, "type">) {
  colliders.push({ ...collider, type: "cylinder" });
}

export function isPlayerColliding(position: THREE.Vector3) {
  return colliders.some((collider) => {
    if (!hasVerticalOverlap(position, collider)) {
      return false;
    }

    if (collider.type === "cylinder") {
      return collidesWithCylinder(position, collider);
    }

    return collidesWithBox(position, collider);
  });
}

export function pushPlayerOutOfColliders(position: THREE.Vector3) {
  for (let i = 0; i < 3; i++) {
    let wasPushed = false;

    colliders.forEach((collider) => {
      if (!hasVerticalOverlap(position, collider)) {
        return;
      }

      const push =
        collider.type === "cylinder"
          ? getCylinderPush(position, collider)
          : getBoxPush(position, collider);

      if (!push) {
        return;
      }

      position.x += push.x;
      position.z += push.y;
      wasPushed = true;
    });

    if (!wasPushed) {
      return;
    }
  }
}

function hasVerticalOverlap(position: THREE.Vector3, collider: Collider) {
  const playerBottom = position.y - PLAYER.height;
  const playerTop = position.y;
  const colliderBottom = collider.baseY;
  const colliderTop = collider.baseY + collider.height;

  return playerTop >= colliderBottom && playerBottom <= colliderTop;
}

function collidesWithCylinder(
  position: THREE.Vector3,
  collider: CylinderCollider,
) {
  const dx = position.x - collider.x;
  const dz = position.z - collider.z;
  const radius = PLAYER.radius + collider.radius;

  return dx * dx + dz * dz <= radius * radius;
}

function collidesWithBox(position: THREE.Vector3, collider: BoxCollider) {
  const dx = position.x - collider.x;
  const dz = position.z - collider.z;
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  const halfWidth = collider.width / 2;
  const halfDepth = collider.depth / 2;
  const closestX = THREE.MathUtils.clamp(localX, -halfWidth, halfWidth);
  const closestZ = THREE.MathUtils.clamp(localZ, -halfDepth, halfDepth);
  const distanceX = localX - closestX;
  const distanceZ = localZ - closestZ;

  return (
    distanceX * distanceX + distanceZ * distanceZ <=
    PLAYER.radius * PLAYER.radius
  );
}

function getCylinderPush(
  position: THREE.Vector3,
  collider: CylinderCollider,
) {
  const dx = position.x - collider.x;
  const dz = position.z - collider.z;
  const radius = PLAYER.radius + collider.radius;
  const distanceSquared = dx * dx + dz * dz;

  if (distanceSquared >= radius * radius) {
    return null;
  }

  if (distanceSquared < 0.000001) {
    return new THREE.Vector2(radius + PUSH_EPSILON, 0);
  }

  const distance = Math.sqrt(distanceSquared);
  const pushDistance = radius - distance + PUSH_EPSILON;

  return new THREE.Vector2(
    (dx / distance) * pushDistance,
    (dz / distance) * pushDistance,
  );
}

function getBoxPush(position: THREE.Vector3, collider: BoxCollider) {
  const dx = position.x - collider.x;
  const dz = position.z - collider.z;
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  const halfWidth = collider.width / 2;
  const halfDepth = collider.depth / 2;
  const closestX = THREE.MathUtils.clamp(localX, -halfWidth, halfWidth);
  const closestZ = THREE.MathUtils.clamp(localZ, -halfDepth, halfDepth);
  const distanceX = localX - closestX;
  const distanceZ = localZ - closestZ;
  const distanceSquared = distanceX * distanceX + distanceZ * distanceZ;

  if (distanceSquared >= PLAYER.radius * PLAYER.radius) {
    return null;
  }

  if (distanceSquared > 0.000001) {
    const distance = Math.sqrt(distanceSquared);
    const pushDistance = PLAYER.radius - distance + PUSH_EPSILON;

    return localPushToWorld(
      (distanceX / distance) * pushDistance,
      (distanceZ / distance) * pushDistance,
      cos,
      sin,
    );
  }

  const [pushX, pushZ] = getInsideBoxPush(localX, localZ, halfWidth, halfDepth);

  return localPushToWorld(pushX, pushZ, cos, sin);
}

function getInsideBoxPush(
  localX: number,
  localZ: number,
  halfWidth: number,
  halfDepth: number,
) {
  const right = halfWidth - localX;
  const left = localX + halfWidth;
  const front = halfDepth - localZ;
  const back = localZ + halfDepth;
  const nearestSide = Math.min(right, left, front, back);

  if (nearestSide === right) {
    return [halfWidth + PLAYER.radius - localX + PUSH_EPSILON, 0] as const;
  }

  if (nearestSide === left) {
    return [-halfWidth - PLAYER.radius - localX - PUSH_EPSILON, 0] as const;
  }

  if (nearestSide === front) {
    return [0, halfDepth + PLAYER.radius - localZ + PUSH_EPSILON] as const;
  }

  return [0, -halfDepth - PLAYER.radius - localZ - PUSH_EPSILON] as const;
}

function localPushToWorld(
  localX: number,
  localZ: number,
  cos: number,
  sin: number,
) {
  return new THREE.Vector2(
    cos * localX + sin * localZ,
    -sin * localX + cos * localZ,
  );
}
