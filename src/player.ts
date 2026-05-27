import * as THREE from "three";
import { PLAYER } from "./constants";
import type { PhysicsWorld } from "./physics";
import { getTerrainHeight } from "./world";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type MovementKeys = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

export function createPlayerControls(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  physics: PhysicsWorld,
) {
  // input state
  const keys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  // player state
  const playerRoot = new THREE.Group();
  const clock = new THREE.Clock();
  let mixer: THREE.AnimationMixer | null = null;
  let idleAction: THREE.AnimationAction | null = null;
  let walkAction: THREE.AnimationAction | null = null;
  let runAction: THREE.AnimationAction | null = null;
  let jumpAction: THREE.AnimationAction | null = null;
  let deathAction: THREE.AnimationAction | null = null;
  let standUpAction: THREE.AnimationAction | null = null;
  let slashAction: THREE.AnimationAction | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  let isSwinging = false;
  let swingTimeLeft = 0;
  let isSprinting = false;
  let velocityY = 0;
  let isOnGround = false;
  // entrance sequence: fall from height -> Death pose -> StandUp -> done
  type SpawnPhase = "falling" | "death" | "standup" | "done";
  let spawnPhase: SpawnPhase = "falling";

  // camera orbit state
  let camera_radius = 5;
  let cameraYaw = Math.PI;
  let cameraPitch = 0.55;
  const cameraTargetHeight = 2.4;
  const minDistance = 4;
  const maxDistance = 10;

  // ui state
  let selectedSlot = 1;

  // spawn position — start high above terrain so the player falls in
  const spawnX = 0;
  const spawnZ = 0;
  const spawnDropHeight = 12;
  const spawnY = getTerrainHeight(spawnX, spawnZ);
  const playerGroundOffset = 0;

  playerRoot.position.set(spawnX, spawnY + playerGroundOffset + spawnDropHeight, spawnZ);
  scene.add(playerRoot);
  const playerCollider = physics.createCharacter(playerRoot.position);

  // load character model
  const loader = new GLTFLoader();
  loader.load("/models/chara/Cowboy_Male.gltf", (gltf) => {
    const character = gltf.scene;
    character.scale.setScalar(0.6);
    setCharacterSkinColor(character, 0xc68652);
    setCharacterShadows(character);

    // center the model around playerroot
    const box = new THREE.Box3().setFromObject(character);
    const center = new THREE.Vector3();
    box.getCenter(center);

    character.position.x -= center.x;
    character.position.z -= center.z;

    // move the model so its lowest point sits on playerroot
    const fixedBox = new THREE.Box3().setFromObject(character);
    character.position.y -= fixedBox.min.y;

    playerRoot.add(character);

    // setup character animations
    mixer = new THREE.AnimationMixer(character);
    console.log(
      "character animations",
      gltf.animations.map((clip) => clip.name),
    );

    const idleClip =
      gltf.animations.find((clip) => clip.name.toLowerCase().includes("idle")) ??
      gltf.animations[0];
    const walkClip = gltf.animations.find((clip) => {
      const name = clip.name.toLowerCase();

      return name.includes("walk");
    });

    if (idleClip) {
      idleAction = mixer.clipAction(idleClip);
      currentAction = idleAction;
      currentAction.play();
    }

    if (walkClip) {
      walkAction = mixer.clipAction(walkClip);
    }

    // pick the plain "Run" clip, not "Run_Carry"
    const runClip = gltf.animations.find((clip) => {
      const name = clip.name.toLowerCase();
      return name === "run" || (name.includes("run") && !name.includes("carry"));
    });
    if (runClip) {
      runAction = mixer.clipAction(runClip);
    }

    const jumpClip = gltf.animations.find((clip) =>
      clip.name.toLowerCase().includes("jump"),
    );
    if (jumpClip) {
      jumpAction = mixer.clipAction(jumpClip);
      jumpAction.setLoop(THREE.LoopOnce, 1);
      jumpAction.clampWhenFinished = true;
    }

    const deathClip = gltf.animations.find((clip) =>
      clip.name.toLowerCase().includes("death"),
    );
    if (deathClip) {
      deathAction = mixer.clipAction(deathClip);
      deathAction.setLoop(THREE.LoopOnce, 1);
      deathAction.clampWhenFinished = true;
    }

    const standUpClip = gltf.animations.find((clip) => {
      const name = clip.name.toLowerCase();
      return name.includes("standup") || name === "stand_up" || name === "stand up";
    });
    if (standUpClip) {
      standUpAction = mixer.clipAction(standUpClip);
      standUpAction.setLoop(THREE.LoopOnce, 1);
      standUpAction.clampWhenFinished = true;
    }

    const slashClip = gltf.animations.find((clip) =>
      clip.name.toLowerCase().includes("swordslash"),
    );
    if (slashClip) {
      slashAction = mixer.clipAction(slashClip);
      slashAction.setLoop(THREE.LoopOnce, 1);
      slashAction.clampWhenFinished = false;
    }

    // drive the entrance sequence: when one one-shot finishes, advance state.
    mixer.addEventListener("finished", (event) => {
      const action = (event as unknown as { action: THREE.AnimationAction }).action;
      if (action === deathAction && spawnPhase === "death") {
        spawnPhase = "standup";
        if (standUpAction) {
          playAnimation(standUpAction);
        } else {
          spawnPhase = "done";
        }
      } else if (action === standUpAction && spawnPhase === "standup") {
        spawnPhase = "done";
      } else if (action === slashAction) {
        finishSwing();
      }
    });

    setupWeapons(character);
  });

  // hotbar slot -> equipped weapon holder. slot 1 is freehand (no holder).
  const weaponHolders = new Map<number, THREE.Group>();

  function setupWeapons(character: THREE.Object3D) {
    const handBone =
      findBone(character, ["FistR", "Hand.R", "Wrist.R", "Hand_R", "Wrist_R"]) ??
      findBone(character, ["FistL", "Hand.L", "Wrist.L"]);

    if (!handBone) {
      const boneNames: string[] = [];
      character.traverse((obj) => {
        if (obj instanceof THREE.Bone) boneNames.push(obj.name);
      });
      console.warn(
        "weapons: no hand bone found; available bones:\n" + boneNames.join("\n"),
      );
      return;
    }

    // bones in this rig have a very small world scale, so we counter it when
    // placing children — otherwise reasonable sizes vanish to nothing.
    const boneWorldScale = handBone.getWorldScale(new THREE.Vector3()).x || 1;
    const invBoneScale = 1 / boneWorldScale;

    loadWeapon("/models/Simple Pickaxe.glb", handBone, invBoneScale, 2, {
      rotation: new THREE.Euler(0, Math.PI / 2, Math.PI / 2),
      yOffset: 0.1,
    });
    loadWeapon("/models/Hatchet.glb", handBone, invBoneScale, 3, {
      rotation: new THREE.Euler(0, 0, Math.PI / 2),
      yOffset: 0.25,
    });
  }

  function loadWeapon(
    path: string,
    handBone: THREE.Bone,
    invBoneScale: number,
    slot: number,
    options: { rotation: THREE.Euler; yOffset: number },
  ) {
    new GLTFLoader().load(
      path,
      (gltf) => {
        const model = gltf.scene;
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);

        // re-center geometry around origin so the holder controls the pivot
        model.position.sub(center);

        // scale so the longest axis is ~0.8m in world space
        const targetWorldLength = 0.8;
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const localScale = (targetWorldLength / longest) * invBoneScale;

        const holder = new THREE.Group();
        holder.add(model);
        holder.scale.setScalar(localScale);
        // bone local space has tiny scale, so multiply offsets by invBoneScale
        // to get world-space meters.
        holder.position.set(0, options.yOffset * invBoneScale, 0);
        holder.rotation.copy(options.rotation);
        handBone.add(holder);
        weaponHolders.set(slot, holder);
        applyEquippedWeapon();
      },
      undefined,
      (err) => console.error(`weapon load failed (${path}):`, err),
    );
  }

  function applyEquippedWeapon() {
    for (const [slot, holder] of weaponHolders) {
      holder.visible = slot === selectedSlot;
    }
  }

  function findBone(root: THREE.Object3D, names: string[]) {
    for (const name of names) {
      const bone = root.getObjectByName(name);
      if (bone instanceof THREE.Bone) return bone;
    }
    return null;
  }

  // initial camera placement
  camera.position.set(
    playerRoot.position.x,
    playerRoot.position.y + 5,
    playerRoot.position.z + 10,
  );

  camera.lookAt(
    playerRoot.position.x,
    playerRoot.position.y + 1.5,
    playerRoot.position.z,
  );

  // mouse click captures the cursor
  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  // left click while pointer is locked swings the equipped tool. freehand
  // (slot 1) doesn't swing.
  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (document.pointerLockElement !== canvas) return;
    if (spawnPhase !== "done") return;
    if (selectedSlot !== 2 && selectedSlot !== 3) return;
    if (!slashAction || isSwinging) return;

    startSwing();
  });

  // mouse movement rotates the orbit camera
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;

    cameraYaw -= event.movementX * 0.005;
    cameraPitch += event.movementY * 0.005;

    cameraPitch = THREE.MathUtils.clamp(cameraPitch, -0.15, 1.25);
  });

  // number keys control hotbar selection
  document.addEventListener("keydown", (event) => {
    if (event.code === "Digit1") selectedSlot = 1;
    if (event.code === "Digit2") selectedSlot = 2;
    if (event.code === "Digit3") selectedSlot = 3;
    if (event.code === "Digit4") selectedSlot = 4;
    if (event.code.startsWith("Digit")) {
      updateHotbar();
      applyEquippedWeapon();
    }
  });

  // keydown starts movement and jumping
  document.addEventListener("keydown", (event) => {
    if (event.code === "KeyW") keys.forward = true;
    if (event.code === "KeyS") keys.backward = true;
    if (event.code === "KeyA") keys.left = true;
    if (event.code === "KeyD") keys.right = true;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      isSprinting = true;
    }

    if (event.code === "Space" && isOnGround && spawnPhase === "done") {
      velocityY = PLAYER.jumpStrength;
      isOnGround = false;
      finishSwing();
      if (jumpAction) {
        jumpAction.reset();
        playAnimation(jumpAction);
      }
    }
  });

  // keyup stops movement
  document.addEventListener("keyup", (event) => {
    if (event.code === "KeyW") keys.forward = false;
    if (event.code === "KeyS") keys.backward = false;
    if (event.code === "KeyA") keys.left = false;
    if (event.code === "KeyD") keys.right = false;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      isSprinting = false;
    }
  });

  // scroll changes camera distance
  canvas.addEventListener("wheel", (event) => {
    camera_radius += event.deltaY * 0.001;

    camera_radius = THREE.MathUtils.clamp(
      camera_radius,
      minDistance,
      maxDistance,
    );
  });

  updateHotbar();

  function updateHotbar() {
    // highlight the selected hotbar slot
    const slots = document.querySelectorAll<HTMLButtonElement>(".hotbar-slot");

    slots.forEach((slot) => {
      const slotNumber = Number(slot.dataset.slot);

      if (slotNumber === selectedSlot) {
        slot.classList.add("selected");
      } else {
        slot.classList.remove("selected");
      }
    });
  }

  function setCharacterSkinColor(character: THREE.Object3D, color: number) {
    // recolor only skin materials on the model
    character.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!material.name.toLowerCase().includes("skin")) return;
        if (!("color" in material)) return;

        material.color.set(color);
      });
    });
  }

  function setCharacterShadows(character: THREE.Object3D) {
    // player should throw a soft readable shadow on the sand
    character.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      child.castShadow = true;
      child.receiveShadow = true;
    });
  }

  function updateCamera(
    cam: THREE.PerspectiveCamera,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) {
    // target is where the camera looks
    const target = new THREE.Vector3(
      playerRoot.position.x,
      playerRoot.position.y + cameraTargetHeight,
      playerRoot.position.z,
    );

    // camera orbits around the target
    cam.position.set(
      target.x + offsetX,
      target.y + offsetY,
      target.z + offsetZ,
    );

    cam.lookAt(target);
  }

  function playAnimation(nextAction: THREE.AnimationAction | null) {
    // fade between animation states
    if (!nextAction || currentAction === nextAction) return;

    currentAction?.fadeOut(0.15);
    nextAction.reset().fadeIn(0.15).play();
    currentAction = nextAction;
  }

  function playOneShotAnimation(nextAction: THREE.AnimationAction | null) {
    // one-shots need to be restartable even if they are already current
    if (!nextAction) return;

    if (currentAction === nextAction) {
      nextAction.stop();
    } else {
      currentAction?.fadeOut(0.08);
    }

    nextAction.reset().fadeIn(0.08).play();
    currentAction = nextAction;
  }

  function startSwing() {
    if (!slashAction) return;

    isSwinging = true;
    swingTimeLeft = slashAction.getClip().duration + 0.15;
    playOneShotAnimation(slashAction);
  }

  function finishSwing() {
    isSwinging = false;
    swingTimeLeft = 0;

    if (currentAction === slashAction) {
      slashAction?.fadeOut(0.08);
      currentAction = null;
    }
  }

  function update() {
    // update character animation
    const delta = clock.getDelta();
    mixer?.update(delta);

    if (isSwinging) {
      swingTimeLeft -= delta;
      if (swingTimeLeft <= 0) {
        finishSwing();
      }
    }

    // convert yaw and pitch into a camera offset
    const offsetX = Math.sin(cameraYaw) * Math.cos(cameraPitch) * camera_radius;
    const offsetY = Math.sin(cameraPitch) * camera_radius;
    const offsetZ = Math.cos(cameraYaw) * Math.cos(cameraPitch) * camera_radius;

    // movement directions based on camera yaw
    const forward = new THREE.Vector3(
      Math.sin(cameraYaw),
      0,
      Math.cos(cameraYaw),
    );

    const right = new THREE.Vector3(
      Math.cos(cameraYaw),
      0,
      -Math.sin(cameraYaw),
    );

    // combine wasd into one movement vector. input is ignored until the
    // entrance sequence (fall -> death -> standup) finishes.
    const move = new THREE.Vector3();
    const controlsActive = spawnPhase === "done";

    if (controlsActive) {
      if (keys.forward) move.sub(forward);
      if (keys.backward) move.add(forward);
      if (keys.left) move.sub(right);
      if (keys.right) move.add(right);
    }

    const isMoving = move.lengthSq() > 0;
    const sprinting = isMoving && isSprinting;

    if (isMoving) {
      // normalize stops diagonal movement from being faster
      move.normalize();
      playerRoot.rotation.y = Math.atan2(move.x, move.z);
      move.multiplyScalar(
        sprinting ? PLAYER.moveSpeed * PLAYER.sprintMultiplier : PLAYER.moveSpeed,
      );
    }

    // only override the animation channel when grounded and not in the
    // middle of a one-shot clip (jump airborne / death-standup / swing).
    if (isOnGround && controlsActive && !isSwinging) {
      const moveAction = sprinting ? (runAction ?? walkAction) : walkAction;
      playAnimation(isMoving ? moveAction : idleAction);
    }

    // gravity and jump movement
    velocityY -= PLAYER.gravity;
    move.y = velocityY;
    const result = physics.moveCharacter(playerCollider, move);
    playerRoot.position.copy(result.position);

    // terrain height under the player
    const groundY =
      getTerrainHeight(playerRoot.position.x, playerRoot.position.z) +
      playerGroundOffset;

    // tolerance so walking down slopes still registers as grounded — without
    // this, gravity puts the player a hair above terrain each frame and
    // jumping silently fails.
    const groundTolerance = 0.15;

    const wasAirborne = !isOnGround;

    if (velocityY <= 0 && playerRoot.position.y <= groundY + groundTolerance) {
      // snap to terrain
      playerRoot.position.y = groundY;
      velocityY = 0;
      isOnGround = true;
      physics.setCharacterFeetPosition(playerCollider, playerRoot.position);
    } else if (result.grounded && velocityY <= 0) {
      // land on top of a collider (box, etc.)
      velocityY = 0;
      isOnGround = true;
    } else {
      isOnGround = false;
    }

    // first ground contact after the entrance fall -> play Death pose
    if (spawnPhase === "falling" && wasAirborne && isOnGround) {
      if (deathAction) {
        spawnPhase = "death";
        playAnimation(deathAction);
      } else {
        spawnPhase = "done";
      }
    }

    // camera follows after player moves
    updateCamera(camera, offsetX, offsetY, offsetZ);
  }

  return { update, position: playerRoot.position };
}
