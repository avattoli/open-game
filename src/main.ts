import "./style.css";
import { createPlayerControls } from "./player";
import {
  createCamera,
  createLights,
  createRenderer,
  createScene,
  handleResize,
} from "./scene";
import { populateMapWithDesertItems } from "./mapPopulation";
import { createFloor, createSun } from "./world";

const canvas = document.querySelector<HTMLCanvasElement>("#app");

if (!canvas) {
  throw new Error("Canvas with id #app was not found.");
}

const scene = createScene();
const camera = createCamera();
const renderer = createRenderer(canvas);
const player = createPlayerControls(camera, canvas, scene);
const { ambientLight, sunLight } = createLights();

scene.add(ambientLight);
scene.add(sunLight);
scene.add(createFloor());
scene.add(createSun());
populateMapWithDesertItems(scene);
handleResize(camera, renderer);

function animate() {
  requestAnimationFrame(animate);

  player.update();
  renderer.render(scene, camera);
}

animate();
