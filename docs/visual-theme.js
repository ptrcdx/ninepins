const THREE_URL = "./vendor/three/three.module.js";
const SCENE_HOOK = Symbol.for("pumperella.sceneHook.v2");
const CAMERA_HOOK = Symbol.for("pumperella.cameraHook.v2");
const RENDERER_KEY = Symbol.for("pumperella.rendererTheme.v2");
const THEMED = "pumperellaPremiumSceneV2";
const SCHEDULED = "pumperellaPremiumSceneV2Scheduled";

/** Installs the scene and camera lifecycle hooks before BowlingApp is created. */
export async function installPumperellaVisualTheme() {
  if (typeof window === "undefined") return;
  const three = await import(THREE_URL);
  installPumperellaVisualThemeHooks(three);
}

/**
 * Installs reliable hooks on prototype methods that Three.js actually uses.
 * @param {typeof import("three")} three Three.js module namespace.
 * @param {{schedule?:(task:()=>void)=>void,decorate?:(scene:any)=>void,viewport?:()=>{width:number,height:number}}} [options]
 */
export function installPumperellaVisualThemeHooks(three, options = {}) {
  if (!three?.Scene?.prototype || !three?.PerspectiveCamera?.prototype) {
    throw new TypeError("Three.js Scene and PerspectiveCamera are required.");
  }

  const schedule = options.schedule ?? scheduleMicrotask;
  const decorate = options.decorate ?? ((scene) => decorateScene(scene, three));
  const viewport = options.viewport ?? browserViewport;
  hookScene(three.Scene.prototype, schedule, decorate);
  hookCamera(three.PerspectiveCamera.prototype, viewport);
}

/** Returns the approved responsive camera profile. */
export function resolvePremiumCameraProfile(width, height) {
  if (height > width * 1.25) {
    return { fov: 52, position: [0, 5.35, 10.9], target: [0, 0.36, -6.25] };
  }
  if (height < 600) {
    return { fov: 43, position: [0, 5.05, 11.55], target: [0, 0.42, -6.55] };
  }
  return { fov: 42, position: [0, 5.15, 11.35], target: [0, 0.44, -6.45] };
}

function hookScene(prototype, schedule, decorate) {
  if (prototype[SCENE_HOOK]) return;
  const originalAdd = prototype.add;
  if (typeof originalAdd !== "function") throw new TypeError("Scene.add must be a function.");

  prototype.add = function addWithTheme(...objects) {
    const result = originalAdd.apply(this, objects);
    if (this.isScene && !this.userData[THEMED] && !this.userData[SCHEDULED]) {
      this.userData[SCHEDULED] = true;
      schedule(() => {
        this.userData[SCHEDULED] = false;
        if (this.userData[THEMED]) return;
        try {
          decorate(this);
        } catch (error) {
          console.error("Pumperella visual theme failed:", error);
        }
      });
    }
    return result;
  };
  Object.defineProperty(prototype, SCENE_HOOK, { value: true });
}

function hookCamera(prototype, viewport) {
  if (prototype[CAMERA_HOOK]) return;
  const originalUpdate = prototype.updateProjectionMatrix;
  if (typeof originalUpdate !== "function") {
    throw new TypeError("PerspectiveCamera.updateProjectionMatrix must be a function.");
  }

  prototype.updateProjectionMatrix = function updatePremiumProjection(...args) {
    const profile = resolvePremiumCameraProfile(viewport().width, viewport().height);
    this.fov = profile.fov;
    this.position.set(...profile.position);
    this.lookAt(...profile.target);
    this.updateMatrixWorld();
    return originalUpdate.apply(this, args);
  };
  Object.defineProperty(prototype, CAMERA_HOOK, { value: true });
}

function scheduleMicrotask(task) {
  if (typeof queueMicrotask === "function") queueMicrotask(task);
  else Promise.resolve().then(task);
}

function browserViewport() {
  return {
    width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
    height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
  };
}

function decorateScene(scene, three) {
  if (!scene?.isScene || scene.userData[THEMED]) return;
  scene.userData[THEMED] = true;
  scene.background = new three.Color(0x15090d);
  scene.fog = new three.Fog(0x11070b, 20, 48);

  scene.traverse((object) => {
    if (object.isLight) tuneLight(object);
    if (object.isMesh) {
      hideLegacyScenery(object);
      tuneMesh(object);
      tuneBall(object, three);
    }
  });

  addRendererProbe(scene, three);
  addLights(scene, three);
  addArchitecture(scene, three);
  addReflections(scene, three);
  addCrown(scene, three);
}

function tuneLight(light) {
  if (light.isHemisphereLight) {
    light.intensity = 1.78;
    light.color.setHex(0xffedd9);
    light.groundColor.setHex(0x221017);
  } else if (light.isDirectionalLight) {
    light.intensity = 4.35;
    light.color.setHex(0xffe8c6);
  } else if (light.isPointLight) {
    const color = light.color.getHex();
    if ([0xff2f9c, 0xff208c, 0xff238f].includes(color)) light.intensity = Math.min(light.intensity, 4);
    if ([0xffbd78, 0xffc58a, 0xffca90].includes(color)) light.intensity = Math.min(light.intensity, 12);
  }
}

function hideLegacyScenery(mesh) {
  const p = mesh.geometry?.parameters;
  if (!p) return;

  const box = mesh.geometry.type === "BoxGeometry";
  const plane = mesh.geometry.type === "PlaneGeometry";
  const legacyPod = box && near(p.width, 0.18, 0.03) && near(p.height, 0.06, 0.02) && near(p.depth, 0.55, 0.08);
  const legacyGlow = plane && near(p.width, 2.4, 0.15) && near(p.height, 1.0, 0.15) && mesh.material?.isMeshBasicMaterial;
  const legacyCrown = plane && near(p.width, 1.45, 0.15) && near(p.height, 0.72, 0.12);
  const legacyFloor = box && p.width >= 4 && p.height <= 0.12 && p.depth >= 25 && Math.abs(mesh.position.x) >= 3;
  const legacyWall = box && p.width >= 17 && p.height >= 7.5 && p.depth <= 0.3 && mesh.position.z <= -18;
  const legacyDeck = box && mesh.position.z <= -15 && (
    (p.width >= 6 && p.height <= 0.55 && p.depth >= 0.9) ||
    (p.width <= 0.6 && p.height >= 3 && p.depth >= 1.4) ||
    (p.width >= 2 && p.height <= 0.25 && p.depth <= 0.4) ||
    (p.width >= 2.8 && p.height >= 1 && p.depth <= 0.3)
  );
  if (legacyPod || legacyGlow || legacyCrown || legacyFloor || legacyWall || legacyDeck) mesh.visible = false;
}

function tuneMesh(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material?.color) continue;
    const color = material.color.getHex();
    if ([0xce8a4e, 0xc78449, 0xb97c45].includes(color)) setStandard(material, 0xd69456, 0.26, 0.06);
    else if ([0x2f1c24, 0x382027, 0x5a3524].includes(color)) setStandard(material, 0x2e1921, 0.56, 0.08);
    else if ([0x6d6570, 0x5b5561, 0x76777a].includes(color)) setStandard(material, 0x817784, 0.17, 0.58);
    else if ([0x101012, 0x121314].includes(color)) setStandard(material, 0x0f0f12, 0.88, 0);
    else if ([0x6c7077, 0x686d72].includes(color)) setStandard(material, 0x767b84, 0.2, 0.86);
    else if (color === 0xf5f0e7 && mesh.geometry?.type === "LatheGeometry") setStandard(material, 0xfffaf1, 0.2, 0);
    else if (color === 0xb52d25 && mesh.geometry?.type === "CylinderGeometry") setStandard(material, 0xca2949, 0.24, 0.02);
    if (material.isMeshStandardMaterial) {
      material.envMapIntensity = Math.max(material.envMapIntensity ?? 1, 1.18);
      material.needsUpdate = true;
    }
  }

  if (mesh.geometry?.type === "SphereGeometry" && mesh.material?.isMeshStandardMaterial) {
    mesh.material.color.setHex(0xb40e56);
    mesh.material.emissive.setHex(0x5e0328);
    mesh.material.emissiveIntensity = 0.24;
    mesh.material.roughness = 0.1;
    mesh.material.metalness = 0.26;
    mesh.material.needsUpdate = true;
  }
}

function tuneBall(mesh, three) {
  if (mesh.geometry?.type !== "SphereGeometry") return;
  const existing = mesh.children.find((child) => child.isSprite);
  if (existing) {
    existing.scale.set(0.5, 0.25, 1);
    existing.position.set(0, 0.02, 0.335);
    return;
  }
  const emblem = new three.Sprite(new three.SpriteMaterial({
    map: crownTexture(three, 256, 128, 5),
    transparent: true,
    depthWrite: false,
  }));
  emblem.scale.set(0.5, 0.25, 1);
  emblem.position.set(0, 0.02, 0.335);
  mesh.add(emblem);
}

function addRendererProbe(scene, three) {
  const material = new three.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  material.colorWrite = false;
  const probe = new three.Mesh(new three.PlaneGeometry(0.001, 0.001), material);
  probe.name = "PumperellaRendererProbe";
  probe.frustumCulled = false;
  probe.renderOrder = -10000;
  probe.onBeforeRender = (renderer) => {
    if (renderer[RENDERER_KEY]) return;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = three.PCFSoftShadowMap;
    renderer.toneMapping = three.ACESFilmicToneMapping;
    renderer.toneMappingExposure = window.innerWidth < 760 ? 1.16 : 1.22;
    renderer.outputColorSpace = three.SRGBColorSpace;
    Object.defineProperty(renderer, RENDERER_KEY, { value: true });
  };
  scene.add(probe);
}

function addLights(scene, three) {
  for (const side of [-1, 1]) {
    const light = new three.PointLight(0xff238f, 7.5, 18, 2);
    light.position.set(side * 5.3, 0.95, -6);
    scene.add(light);
  }
  const back = new three.PointLight(0xff208c, 5, 10, 2);
  back.position.set(0, 1.7, -17.2);
  scene.add(back);
  const fill = new three.PointLight(0xffca90, 9, 20, 2);
  fill.position.set(0, 2, -4.2);
  scene.add(fill);
  const crown = new three.PointLight(0xff2f9c, 12, 12, 2);
  crown.position.set(0, 4.05, -15.1);
  scene.add(crown);
}

function addArchitecture(scene, three) {
  const group = new three.Group();
  group.name = "PumperellaPremiumArchitecture";
  const floorMaterial = new three.MeshStandardMaterial({ color: 0x150c11, roughness: 0.1, metalness: 0.48 });
  const floorGeometry = new three.BoxGeometry(5.8, 0.06, 30);
  for (const side of [-1, 1]) {
    const floor = new three.Mesh(floorGeometry, floorMaterial);
    floor.position.set(side * 5.95, -0.15, -4.8);
    floor.receiveShadow = true;
    group.add(floor);
  }

  const wall = new three.Mesh(
    new three.BoxGeometry(20, 8.8, 0.14),
    new three.MeshStandardMaterial({ color: 0x0c070a, roughness: 0.56, metalness: 0.12 }),
  );
  wall.position.set(0, 2.7, -18.75);
  wall.receiveShadow = true;
  group.add(wall);

  const frameMaterial = new three.MeshStandardMaterial({ color: 0x211318, roughness: 0.42, metalness: 0.12 });
  const top = new three.Mesh(new three.BoxGeometry(7.1, 0.55, 1.3), frameMaterial);
  top.position.set(0, 3.55, -16.55);
  top.castShadow = true;
  group.add(top);
  for (const side of [-1, 1]) {
    const column = new three.Mesh(new three.BoxGeometry(0.55, 3.8, 1.1), frameMaterial);
    column.position.set(side * 3.2, 1.55, -16.25);
    column.castShadow = true;
    group.add(column);
  }

  const fascia = new three.Mesh(
    new three.BoxGeometry(3.2, 1.18, 0.18),
    new three.MeshStandardMaterial({ color: 0x201217, roughness: 0.48, metalness: 0.08 }),
  );
  fascia.position.set(0, 2.66, -15.92);
  fascia.castShadow = true;
  group.add(fascia);

  const pink = new three.MeshBasicMaterial({ color: 0xff43a8 });
  for (const side of [-1, 1]) {
    const bar = new three.Mesh(new three.BoxGeometry(0.1, 2.35, 0.055), pink);
    bar.position.set(side * 2.55, 1.3, -15.82);
    group.add(bar);
  }
  const warm = new three.MeshBasicMaterial({ color: 0xffd29a });
  for (const x of [-1.55, -0.78, 0, 0.78, 1.55]) {
    const lamp = new three.Mesh(new three.BoxGeometry(0.24, 0.06, 0.1), warm);
    lamp.position.set(x, 2.95, -15.74);
    group.add(lamp);
  }
  scene.add(group);
}

function addReflections(scene, three) {
  const group = new three.Group();
  group.name = "PumperellaPremiumReflections";
  const radial = radialTexture(three);
  const strip = stripTexture(three);
  const plane = new three.PlaneGeometry(1, 1);

  for (const [x, z, sx, sy, opacity] of [
    [-5.4, -7, 4.3, 1.8, 0.34], [5.4, -7, 4.3, 1.8, 0.34],
    [-5.75, -2.1, 3.1, 1.25, 0.24], [5.75, -2.1, 3.1, 1.25, 0.24],
    [0, -5.3, 2.2, 1, 0.18],
  ]) {
    const glow = new three.Mesh(plane, new three.MeshBasicMaterial({
      map: radial, transparent: true, opacity, depthWrite: false, blending: three.AdditiveBlending,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(sx, sy, 1);
    glow.position.set(x, -0.118, z);
    group.add(glow);
  }

  for (const side of [-1, 1]) {
    const inner = new three.Mesh(new three.PlaneGeometry(1.1, 13.9), new three.MeshBasicMaterial({
      map: strip, transparent: true, opacity: 0.78, depthWrite: false, blending: three.AdditiveBlending,
    }));
    inner.rotation.x = -Math.PI / 2;
    inner.rotation.z = side < 0 ? 0.022 : -0.022;
    inner.position.set(side * 3.52, -0.117, -4.45);
    group.add(inner);

    const outer = new three.Mesh(new three.PlaneGeometry(1.65, 13.9), new three.MeshBasicMaterial({
      map: strip, transparent: true, opacity: 0.28, depthWrite: false, blending: three.AdditiveBlending,
    }));
    outer.rotation.x = -Math.PI / 2;
    outer.rotation.z = side < 0 ? 0.02 : -0.02;
    outer.position.set(side * 5.45, -0.117, -4.55);
    group.add(outer);

    for (const z of [-8.2, -4.05, 0.15]) {
      const band = new three.Mesh(new three.PlaneGeometry(3.8, 0.58), new three.MeshBasicMaterial({
        color: 0xff2f9c, transparent: true, opacity: 0.15, depthWrite: false, blending: three.AdditiveBlending,
      }));
      band.rotation.x = -Math.PI / 2;
      band.position.set(side * 5.55, -0.116, z);
      group.add(band);
    }
  }

  const halo = new three.Mesh(new three.PlaneGeometry(8.8, 4.1), new three.MeshBasicMaterial({
    map: radial, transparent: true, opacity: 0.18, depthWrite: false, blending: three.AdditiveBlending,
  }));
  halo.position.set(0, 2.55, -18.42);
  group.add(halo);
  scene.add(group);
}

function addCrown(scene, three) {
  const crown = new three.Mesh(new three.PlaneGeometry(1.95, 0.98), new three.MeshBasicMaterial({
    map: crownTexture(three, 640, 320, 10),
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
  }));
  crown.position.set(0, 3.2, -15.56);
  scene.add(crown);
}

function radialTexture(three) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 120);
  gradient.addColorStop(0, "rgba(255,108,189,1)");
  gradient.addColorStop(0.3, "rgba(255,60,164,.72)");
  gradient.addColorStop(0.65, "rgba(255,40,150,.26)");
  gradient.addColorStop(1, "rgba(255,40,150,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

function stripTexture(three) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 96);
  gradient.addColorStop(0, "rgba(255,52,160,0)");
  gradient.addColorStop(0.35, "rgba(255,95,186,.88)");
  gradient.addColorStop(0.55, "rgba(255,32,140,.95)");
  gradient.addColorStop(1, "rgba(255,52,160,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1024, 96);
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

function crownTexture(three, width, height, lineWidth) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const centerX = width / 2;
  const sx = width / 640;
  const sy = height / 320;
  context.strokeStyle = "#ff64b6";
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.shadowColor = "#ff2f9c";
  context.shadowBlur = Math.max(8, lineWidth * 3);
  context.beginPath();
  context.moveTo(centerX - 170 * sx, 212 * sy);
  context.lineTo(centerX - 126 * sx, 134 * sy);
  context.lineTo(centerX - 58 * sx, 184 * sy);
  context.lineTo(centerX, 100 * sy);
  context.lineTo(centerX + 58 * sx, 184 * sy);
  context.lineTo(centerX + 126 * sx, 134 * sy);
  context.lineTo(centerX + 170 * sx, 212 * sy);
  context.lineTo(centerX - 170 * sx, 212 * sy);
  context.stroke();
  for (const [x, y, radius] of [
    [centerX - 170 * sx, 212 * sy, 11], [centerX - 126 * sx, 134 * sy, 10],
    [centerX - 58 * sx, 184 * sy, 8], [centerX, 100 * sy, 11],
    [centerX + 58 * sx, 184 * sy, 8], [centerX + 126 * sx, 134 * sy, 10],
    [centerX + 170 * sx, 212 * sy, 11],
  ]) {
    context.beginPath();
    context.arc(x, y, radius * Math.min(sx, sy), 0, Math.PI * 2);
    context.stroke();
  }
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

function setStandard(material, color, roughness, metalness) {
  if (!material.isMeshStandardMaterial) return;
  material.color.setHex(color);
  material.roughness = roughness;
  material.metalness = metalness;
}

function near(value, target, tolerance) {
  return Number.isFinite(value) && Math.abs(value - target) <= tolerance;
}
