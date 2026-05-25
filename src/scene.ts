import * as THREE from "three";
import { CAMERA, LIGHTING, WORLD } from "./constants";

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.skyColor);

  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far,
  );

  camera.position.copy(CAMERA.startPosition);
  camera.lookAt(CAMERA.lookAt);

  return camera;
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });

  renderer.setSize(window.innerWidth, window.innerHeight);

  return renderer;
}

export function createLights() {
  const ambientLight = new THREE.AmbientLight(
    LIGHTING.ambientColor,
    LIGHTING.ambientIntensity,
  );

  const sunLight = new THREE.DirectionalLight(
    LIGHTING.sunColor,
    LIGHTING.sunIntensity,
  );
  sunLight.position.copy(LIGHTING.sunPosition);

  return { ambientLight, sunLight };
}

export function handleResize(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
) {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
