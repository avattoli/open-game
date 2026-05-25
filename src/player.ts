import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { PLAYER } from "./constants";
import { getTerrainHeight } from "./world";
type MovementKeys = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

export function createPlayerControls(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
) {
  const controls = new PointerLockControls(camera, canvas);
  const keys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  let velocityY = 0;
  let isOnGround = true;

  document.addEventListener("click", () => {
    controls.lock();
  });

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

  document.addEventListener("keyup", (event) => {
    if (event.code === "KeyW") keys.forward = false;
    if (event.code === "KeyS") keys.backward = false;
    if (event.code === "KeyA") keys.left = false;
    if (event.code === "KeyD") keys.right = false;
  });

  function update() {
    if (keys.forward) controls.moveForward(PLAYER.moveSpeed);
    if (keys.backward) controls.moveForward(-PLAYER.moveSpeed);
    if (keys.left) controls.moveRight(-PLAYER.moveSpeed);
    if (keys.right) controls.moveRight(PLAYER.moveSpeed);

    velocityY -= PLAYER.gravity;
    camera.position.y += velocityY;

    const groundY = getTerrainHeight(camera.position.x, camera.position.z);
    const eyeY = groundY + PLAYER.height;

    if (camera.position.y <= eyeY) {
      camera.position.y = eyeY;
      velocityY = 0;
      isOnGround = true;
    }
  }

  return { controls, update };
}
