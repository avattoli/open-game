import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;

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

export function createSky() {
  const sky = new Sky();
  sky.scale.setScalar(450000);

  const sunPosition = LIGHTING.sunPosition.clone().normalize();
  const uniforms = sky.material.uniforms;

  uniforms.turbidity.value = 1.5;
  uniforms.rayleigh.value = 0.35;
  uniforms.mieCoefficient.value = 0.0005;
  uniforms.mieDirectionalG.value = 0.55;
  uniforms.sunPosition.value.copy(sunPosition);

  return sky;
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
