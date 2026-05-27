import * as THREE from "three";
import { CAMERA, LIGHTING, WORLD } from "./constants";

type SkyUniforms = {
  topColor: { value: THREE.Color };
  horizonColor: { value: THREE.Color };
  groundColor: { value: THREE.Color };
  bandCount: { value: number };
};

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.skyColor);
  scene.fog = new THREE.Fog(WORLD.skyColor, 70, 260);

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

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  return renderer;
}

export function createLights() {
  const ambientLight = new THREE.AmbientLight(
    LIGHTING.ambientColor,
    LIGHTING.ambientIntensity,
  );
  const hemisphereLight = new THREE.HemisphereLight(0x9ad8ff, 0xd49a5f, 1.1);

  const sunLight = new THREE.DirectionalLight(
    LIGHTING.sunColor,
    LIGHTING.sunIntensity,
  );
  sunLight.position.copy(LIGHTING.sunPosition);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 300;
  sunLight.shadow.camera.left = -120;
  sunLight.shadow.camera.right = 120;
  sunLight.shadow.camera.top = 120;
  sunLight.shadow.camera.bottom = -120;

  return { ambientLight, hemisphereLight, sunLight };
}

export function createSky() {
  const skyGeometry = new THREE.SphereGeometry(900, 32, 16);
  const uniforms: SkyUniforms = {
    topColor: { value: new THREE.Color(0x4fa8ff) },
    horizonColor: { value: new THREE.Color(0xbfefff) },
    groundColor: { value: new THREE.Color(0xffdc7a) },
    bandCount: { value: 8 },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform float bandCount;
      varying vec3 vWorldPosition;

      void main() {
        float height = normalize(vWorldPosition).y;
        float skyMix = smoothstep(-0.05, 0.75, height);
        float groundMix = smoothstep(-0.35, -0.05, height);
        float bandedSkyMix = floor(skyMix * bandCount) / bandCount;
        vec3 sky = mix(horizonColor, topColor, bandedSkyMix);
        vec3 color = mix(groundColor, sky, groundMix);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  return new THREE.Mesh(skyGeometry, skyMaterial);
}

export function createCelestialBodies() {
  const group = new THREE.Group();
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(16, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff0a8 }),
  );
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xd6e4ff }),
  );

  sun.renderOrder = -1;
  moon.renderOrder = -1;
  group.add(sun);
  group.add(moon);

  return { group, sun, moon };
}

export function createStars() {
  const starCount = 180;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const angle = i * 12.9898;
    const radius = 260 + ((i * 37) % 280);
    const height = 90 + ((i * 53) % 320);

    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = Math.sin(angle * 1.37) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
}

export function createClouds() {
  const clouds = new THREE.Group();
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });

  for (let i = 0; i < 18; i++) {
    const cloud = createCloud(cloudMaterial);
    const angle = (i / 18) * Math.PI * 2;
    const distance = 80 + (i % 5) * 22;
    const height = 34 + (i % 4) * 7;

    cloud.position.set(
      Math.cos(angle) * distance,
      height,
      Math.sin(angle) * distance,
    );
    cloud.rotation.y = angle;
    cloud.userData.speed = 0.003 + (i % 4) * 0.0007;
    clouds.add(cloud);
  }

  return clouds;
}

export function updateDayNightCycle(options: {
  elapsed: number;
  camera: THREE.Camera;
  scene: THREE.Scene;
  sky: THREE.Mesh;
  sun: THREE.Mesh;
  moon: THREE.Mesh;
  stars: THREE.Points;
  clouds: THREE.Group;
  ambientLight: THREE.AmbientLight;
  hemisphereLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
}) {
  const cycleSeconds = 180;
  const phase = (options.elapsed / cycleSeconds) % 1;
  const angle = phase * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const dayAmount = THREE.MathUtils.smoothstep(sunHeight, -0.18, 0.35);
  const duskAmount =
    1 - Math.abs(THREE.MathUtils.clamp(sunHeight / 0.35, -1, 1));
  const orbitRadius = 420;

  options.sky.position.copy(options.camera.position);
  options.sun.parent?.position.copy(options.camera.position);
  options.stars.position.copy(options.camera.position);

  options.sun.position.set(
    Math.cos(angle) * orbitRadius,
    sunHeight * 260,
    -180,
  );
  options.moon.position.set(
    Math.cos(angle + Math.PI) * orbitRadius,
    Math.sin(angle + Math.PI) * 260,
    180,
  );

  options.sun.visible = sunHeight > -0.25;
  options.moon.visible = sunHeight < 0.35;
  options.sunLight.position.copy(options.sun.position);
  options.sunLight.intensity = THREE.MathUtils.lerp(0.18, 2.7, dayAmount);
  options.ambientLight.intensity = THREE.MathUtils.lerp(0.36, 0.22, dayAmount);
  options.hemisphereLight.intensity = THREE.MathUtils.lerp(0.65, 1.25, dayAmount);
  const sunColor = new THREE.Color(0x8faaff)
    .lerp(new THREE.Color(0xfff0a8), dayAmount)
    .lerp(new THREE.Color(0xffa85f), duskAmount * 0.45);
  options.sunLight.color.copy(sunColor);
  if (options.sun.material instanceof THREE.MeshBasicMaterial) {
    options.sun.material.color.copy(sunColor);
  }

  const nightTop = new THREE.Color(0x06122e);
  const dayTop = new THREE.Color(0x3297ff);
  const duskTop = new THREE.Color(0x40266f);
  const nightHorizon = new THREE.Color(0x172a55);
  const dayHorizon = new THREE.Color(0xaee9ff);
  const duskHorizon = new THREE.Color(0xffad63);
  const nightGround = new THREE.Color(0x12172f);
  const dayGround = new THREE.Color(0xffd16b);
  const duskGround = new THREE.Color(0xb96853);

  const topColor = nightTop.clone().lerp(dayTop, dayAmount).lerp(duskTop, duskAmount * 0.45);
  const horizonColor = nightHorizon
    .clone()
    .lerp(dayHorizon, dayAmount)
    .lerp(duskHorizon, duskAmount * 0.7);
  const groundColor = nightGround
    .clone()
    .lerp(dayGround, dayAmount)
    .lerp(duskGround, duskAmount * 0.45);
  const skyMaterial = options.sky.material as THREE.ShaderMaterial;
  const uniforms = skyMaterial.uniforms as SkyUniforms;

  uniforms.topColor.value.copy(topColor);
  uniforms.horizonColor.value.copy(horizonColor);
  uniforms.groundColor.value.copy(groundColor);
  options.scene.background = horizonColor;
  if (options.stars.material instanceof THREE.PointsMaterial) {
    options.stars.material.opacity = THREE.MathUtils.lerp(0.85, 0, dayAmount);
  }
  if (options.scene.fog instanceof THREE.Fog) {
    options.scene.fog.color.copy(horizonColor);
    options.scene.fog.near = THREE.MathUtils.lerp(55, 95, dayAmount);
    options.scene.fog.far = THREE.MathUtils.lerp(190, 310, dayAmount);
  }
  options.hemisphereLight.color.copy(
    new THREE.Color(0x789bff).lerp(new THREE.Color(0xaadfff), dayAmount),
  );
  options.hemisphereLight.groundColor.copy(
    new THREE.Color(0x1c2046).lerp(new THREE.Color(0xd59a61), dayAmount),
  );

  const cloudColor = new THREE.Color(0x7f91bf).lerp(
    new THREE.Color(0xffffff),
    dayAmount,
  );
  setCloudColor(options.clouds, cloudColor);
}

export function updateClouds(clouds: THREE.Group, camera: THREE.Camera) {
  clouds.position.copy(camera.position);

  clouds.children.forEach((cloud) => {
    cloud.rotation.y += cloud.userData.speed as number;

    const radius = Math.hypot(cloud.position.x, cloud.position.z);
    const angle = Math.atan2(cloud.position.z, cloud.position.x) + 0.0005;

    cloud.position.x = Math.cos(angle) * radius;
    cloud.position.z = Math.sin(angle) * radius;
  });
}

function createCloud(material: THREE.Material) {
  const cloud = new THREE.Group();
  const cloudParts = [
    { x: -2.4, y: 0, z: 0, scale: 2.1 },
    { x: -0.8, y: 0.35, z: 0.1, scale: 2.6 },
    { x: 1.1, y: 0.15, z: -0.1, scale: 2.2 },
    { x: 2.6, y: -0.05, z: 0, scale: 1.7 },
  ];

  cloudParts.forEach((part) => {
    const puff = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1, 0),
      material,
    );

    puff.position.set(part.x, part.y, part.z);
    puff.scale.set(part.scale * 1.4, part.scale * 0.55, part.scale);
    cloud.add(puff);
  });

  cloud.scale.setScalar(1.2);

  return cloud;
}

function setCloudColor(clouds: THREE.Group, color: THREE.Color) {
  clouds.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!("color" in child.material)) return;

    child.material.color.copy(color);
  });
}

export function handleResize(
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
) {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  });
}
