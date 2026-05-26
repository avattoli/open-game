import RAPIER, {
  type Collider,
  type RigidBody,
} from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { PLAYER } from "./constants";

export type PhysicsWorld = Awaited<ReturnType<typeof createPhysicsWorld>>;

export async function createPhysicsWorld() {
  // rapier loads a wasm physics engine before we can create bodies
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const controller = world.createCharacterController(0.02);

  controller.setSlideEnabled(true);
  controller.enableAutostep(0.35, 0.2, false);
  controller.enableSnapToGround(0.25);

  return {
    addStaticBox,
    addStaticCylinder,
    removeCollider,
    createCharacter,
    moveCharacter,
    setCharacterFeetPosition,
    step,
    debugRender,
  };

  function debugRender() {
    // returns line segments covering every collider in the world. positions
    // are flat xyz pairs, colors are flat rgba quads — feed straight into
    // a THREE.BufferGeometry.
    return world.debugRender();
  }

  function addStaticBox(options: {
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    rotationY?: number;
  }) {
    // rapier boxes use half sizes
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, options.rotationY ?? 0, 0),
    );

    const desc = RAPIER.ColliderDesc.cuboid(
      options.width / 2,
      options.height / 2,
      options.depth / 2,
    )
      .setTranslation(options.x, options.y, options.z)
      .setRotation(rotation);

    return world.createCollider(desc);
  }

  function addStaticCylinder(options: {
    x: number;
    y: number;
    z: number;
    radius: number;
    height: number;
  }) {
    // rapier cylinders use half height
    const desc = RAPIER.ColliderDesc.cylinder(
      options.height / 2,
      options.radius,
    ).setTranslation(options.x, options.y, options.z);

    return world.createCollider(desc);
  }

  function removeCollider(collider: Collider) {
    world.removeCollider(collider, true);
  }

  function createCharacter(feetPosition: THREE.Vector3) {
    // player root is feet, rapier body is centered
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        feetPosition.x,
        feetPosition.y + PLAYER.height / 2,
        feetPosition.z,
      ),
    );

    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(
        PLAYER.height / 2 - PLAYER.radius,
        PLAYER.radius,
      ),
      body,
    );

    return { body, collider };
  }

  function moveCharacter(
    character: {
      body: RigidBody;
      collider: Collider;
    },
    desiredMove: THREE.Vector3,
  ) {
    // character controller slides the capsule along solid objects
    controller.computeColliderMovement(character.collider, desiredMove);

    const movement = controller.computedMovement();
    const grounded = controller.computedGrounded();
    const translation = character.body.translation();

    character.body.setNextKinematicTranslation({
      x: translation.x + movement.x,
      y: translation.y + movement.y,
      z: translation.z + movement.z,
    });

    world.step();

    const next = character.body.translation();

    return {
      position: new THREE.Vector3(
        next.x,
        next.y - PLAYER.height / 2,
        next.z,
      ),
      grounded,
    };
  }

  function setCharacterFeetPosition(
    character: {
      body: RigidBody;
    },
    feetPosition: THREE.Vector3,
  ) {
    // keep rapier body synced when terrain height snaps the visual player
    character.body.setTranslation(
      {
        x: feetPosition.x,
        y: feetPosition.y + PLAYER.height / 2,
        z: feetPosition.z,
      },
      true,
    );
  }

  function step() {
    world.step();
  }
}
