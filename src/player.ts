import * as THREE from "three";
import { pushCharacterOutOfColliders } from "./collision";
import { PLAYER } from "./constants";
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
  let velocityY = 0;
  let isOnGround = true;

  // camera orbit state
  let camera_radius = 2;
  let cameraYaw = 0;
  let cameraPitch = 1.2;
  const minDistance = 1;
  const maxDistance = 3;

  // ui state
  let selectedSlot = 1;

  // spawn position
  const spawnX = 0;
  const spawnZ = 0;
  const spawnY = getTerrainHeight(spawnX, spawnZ);
  const playerGroundOffset = 3;

  playerRoot.position.set(spawnX, spawnY + playerGroundOffset, spawnZ);
  scene.add(playerRoot);

  // load character model
  const loader = new GLTFLoader();
  loader.load("/models/your-character.glb", (gltf) => {
    const character = gltf.scene;

    // center the model around playerroot
    const box = new THREE.Box3().setFromObject(character);
    const center = new THREE.Vector3();
    box.getCenter(center);

    character.position.x -= center.x;
    character.position.z -= center.z;

    const fixedBox = new THREE.Box3().setFromObject(character);
    character.position.y -= fixedBox.min.y;

    playerRoot.add(character);
  });

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

  // mouse movement rotates the orbit camera
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;

    cameraYaw -= event.movementX * 0.005;
    cameraPitch += event.movementY * 0.005;

    cameraPitch = THREE.MathUtils.clamp(cameraPitch, 0.25, 0.9);
  });

  // number keys control hotbar selection
  document.addEventListener("keydown", (event) => {
    if (event.code === "Digit1") selectedSlot = 1;
    if (event.code === "Digit2") selectedSlot = 2;
    if (event.code === "Digit3") selectedSlot = 3;
    if (event.code === "Digit4") selectedSlot = 4;
    if (event.code.startsWith("Digit")) updateHotbar();
  });

  // keydown starts movement and jumping
  document.addEventListener("keydown", (event) => {
    if (event.code === "KeyW") keys.forward = true;
    if (event.code === "KeyS") keys.backward = true;
    if (event.code === "KeyA") keys.left = true;
    if (event.code === "KeyD") keys.right = true;

    if (event.code === "Space" && isOnGround) {
      velocityY = PLAYER.jumpStrength;
      isOnGround = false;
    }
  });

  // keyup stops movement
  document.addEventListener("keyup", (event) => {
    if (event.code === "KeyW") keys.forward = false;
    if (event.code === "KeyS") keys.backward = false;
    if (event.code === "KeyA") keys.left = false;
    if (event.code === "KeyD") keys.right = false;
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

  function updateCamera(
    cam: THREE.PerspectiveCamera,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) {
    // target is where the camera looks
    const target = new THREE.Vector3(
      playerRoot.position.x,
      playerRoot.position.y + 1.3,
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

  function update() {
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

    // combine wasd into one movement vector
    const move = new THREE.Vector3();

    if (keys.forward) move.sub(forward);
    if (keys.backward) move.add(forward);
    if (keys.left) move.sub(right);
    if (keys.right) move.add(right);

    if (move.lengthSq() > 0) {
      // normalize stops diagonal movement from being faster
      move.normalize();
      playerRoot.rotation.y = Math.atan2(move.x, move.z);
      playerRoot.position.addScaledVector(move, PLAYER.moveSpeed);
      pushCharacterOutOfColliders(playerRoot.position, playerGroundOffset);
    }

    // gravity and jump movement
    velocityY -= PLAYER.gravity;
    playerRoot.position.y += velocityY;

    // terrain height under the player
    const groundY =
      getTerrainHeight(playerRoot.position.x, playerRoot.position.z) +
      playerGroundOffset;

    if (playerRoot.position.y <= groundY) {
      // land on the ground
      playerRoot.position.y = groundY;
      velocityY = 0;
      isOnGround = true;
    }

    // camera follows after player moves
    updateCamera(camera, offsetX, offsetY, offsetZ);
  }

  return { update };
}
