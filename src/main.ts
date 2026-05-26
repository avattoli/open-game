import "./style.css";
import * as THREE from "three";
import { createPlayerControls } from "./player";
import {
  createCamera,
  createLights,
  createRenderer,
  createScene,
  createSky,
  handleResize,
} from "./scene";
import { createPhysicsWorld } from "./physics";
import { createSun } from "./world";
import { createChunkManager } from "./chunks";

const canvas = document.querySelector<HTMLCanvasElement>("#app");

if (!canvas) {
  throw new Error("Canvas with id #app was not found.");
}

const scene = createScene();
const camera = createCamera();
const renderer = createRenderer(canvas);
const physics = await createPhysicsWorld();
const player = createPlayerControls(camera, canvas, scene, physics);
const { ambientLight, sunLight } = createLights();

scene.add(ambientLight);
scene.add(sunLight);
scene.add(createSky());
scene.add(createSun());

const chunks = createChunkManager({
  scene,
  physics,
  worldSeed: 813817,
  chunkSize: 48,
  chunkSegments: 40,
  viewRadius: 2,
  unloadRadius: 3,
});

// load the initial neighborhood before the first frame
chunks.update(0, 0);

handleResize(camera, renderer);

// physics collider wireframe overlay — toggle with B
const colliderDebugGeometry = new THREE.BufferGeometry();
colliderDebugGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(new Float32Array(0), 3),
);
colliderDebugGeometry.setAttribute(
  "color",
  new THREE.BufferAttribute(new Float32Array(0), 4),
);
const colliderDebugMesh = new THREE.LineSegments(
  colliderDebugGeometry,
  new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }),
);
colliderDebugMesh.renderOrder = 999;
colliderDebugMesh.visible = false;
scene.add(colliderDebugMesh);

document.addEventListener("keydown", (event) => {
  if (event.code === "KeyB") {
    colliderDebugMesh.visible = !colliderDebugMesh.visible;
  }
});

function updateColliderDebug() {
  if (!colliderDebugMesh.visible) return;
  const { vertices, colors } = physics.debugRender();
  colliderDebugGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(vertices, 3),
  );
  colliderDebugGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colors, 4),
  );
}

function animate() {
  requestAnimationFrame(animate);

  player.update();
  chunks.update(player.position.x, player.position.z);
  updateColliderDebug();
  renderer.render(scene, camera);
}

animate();
