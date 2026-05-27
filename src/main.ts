import "./style.css";
import * as THREE from "three";
import { createPlayerControls } from "./player";
import {
  createCamera,
  createCelestialBodies,
  createClouds,
  createLights,
  createRenderer,
  createScene,
  createSky,
  createStars,
  handleResize,
  updateDayNightCycle,
  updateClouds,
} from "./scene";
import { createPhysicsWorld } from "./physics";
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
const { ambientLight, hemisphereLight, sunLight } = createLights();

scene.add(ambientLight);
scene.add(hemisphereLight);
scene.add(sunLight);
const sky = createSky();
const celestialBodies = createCelestialBodies();
const stars = createStars();
scene.add(sky);
scene.add(celestialBodies.group);
scene.add(stars);
const clouds = createClouds();
scene.add(clouds);

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
const clock = new THREE.Clock();

// physics collider wireframe overlay — toggle with B
const colliderDebugGeometry = new THREE.BufferGeometry();
colliderDebugGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(new Float32Array(0), 3),
);
const colliderDebugMesh = new THREE.LineSegments(
  colliderDebugGeometry,
  new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false }),
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
  const { vertices } = physics.debugRender();
  colliderDebugGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(vertices, 3),
  );
}

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  player.update();
  chunks.update(player.position.x, player.position.z);
  updateClouds(clouds, camera);
  updateDayNightCycle({
    elapsed,
    camera,
    scene,
    sky,
    sun: celestialBodies.sun,
    moon: celestialBodies.moon,
    stars,
    clouds,
    ambientLight,
    hemisphereLight,
    sunLight,
  });
  updateColliderDebug();
  renderer.render(scene, camera);
}

animate();
