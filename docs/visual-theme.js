const THREE_MODULE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
const RENDER_PATCH = Symbol.for("pumperella.visualTheme.renderPatch");
const SCENE_THEME_KEY = "pumperellaPremiumScene";
const CAMERA_PROFILE_KEY = "pumperellaCameraProfile";
const RENDERER_THEME_KEY = Symbol.for("pumperella.visualTheme.renderer");

/**
 * Installs the production visual theme before the main game imports Three.js.
 * The same pinned module URL is used by the player page, so both imports share
 * one module instance and therefore the patched renderer prototype.
 *
 * @returns {Promise<void>} Resolves after the theme hook is active.
 */
export async function installPumperellaVisualTheme() {
  if (typeof window === "undefined") {
    return;
  }

  const three = await import(THREE_MODULE_URL);
  installRendererPatch(three);
}

/**
 * Resolves the camera framing used by the premium scene.
 *
 * @param {number} width Viewport width in CSS pixels.
 * @param {number} height Viewport height in CSS pixels.
 * @returns {{fov:number,position:[number,number,number],target:[number,number,number]}}
 */
export function resolvePremiumCameraProfile(width, height) {
  const portrait = height > width * 1.25;
  if (portrait) {
    return {
      fov: 52,
      position: [0, 5.35, 10.9],
      target: [0, 0.36, -6.25],
    };
  }

  if (height < 600) {
    return {
      fov: 43,
      position: [0, 5.05, 11.55],
      target: [0, 0.42, -6.55],
    };
  }

  return {
    fov: 42,
    position: [0, 5.15, 11.35],
    target: [0, 0.44, -6.45],
  };
}

/**
 * Patches WebGLRenderer exactly once and preserves the original render path.
 *
 * @param {typeof import("three")} three Three.js module namespace.
 */
function installRendererPatch(three) {
  const prototype = three.WebGLRenderer.prototype;
  if (prototype[RENDER_PATCH]) {
    return;
  }

  const originalRender = prototype.render;

  /**
   * Applies the premium scene before delegating to Three.js.
   *
   * @param {import("three").Scene} scene Scene rendered by the game.
   * @param {import("three").Camera} camera Active game camera.
   * @returns {void}
   */
  function renderWithPumperellaTheme(scene, camera) {
    configureRenderer(this, three);
    ensurePremiumScene(scene, three);
    applyPremiumCamera(camera, this.domElement);
    originalRender.call(this, scene, camera);
  }

  Object.defineProperty(prototype, RENDER_PATCH, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  prototype.render = renderWithPumperellaTheme;
}

/**
 * Applies renderer settings that are supported by current mobile WebGL
 * implementations without requiring post-processing passes.
 *
 * @param {import("three").WebGLRenderer} renderer Active renderer.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function configureRenderer(renderer, three) {
  if (renderer[RENDERER_THEME_KEY]) {
    return;
  }

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = three.PCFSoftShadowMap;
  renderer.toneMapping = three.ACESFilmicToneMapping;
  renderer.toneMappingExposure = window.innerWidth < 760 ? 1.16 : 1.22;
  renderer.outputColorSpace = three.SRGBColorSpace;

  Object.defineProperty(renderer, RENDERER_THEME_KEY, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
}

/**
 * Installs scenery and upgrades existing game materials once per scene.
 *
 * @param {import("three").Scene} scene Game scene.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function ensurePremiumScene(scene, three) {
  if (!scene?.isScene || scene.userData[SCENE_THEME_KEY]) {
    return;
  }

  scene.userData[SCENE_THEME_KEY] = true;
  scene.background = new three.Color(0x15090d);
  scene.fog = new three.Fog(0x11070b, 20, 48);

  upgradeExistingScene(scene, three);
  addPremiumLights(scene, three);
  addPremiumArchitecture(scene, three);
  addPremiumReflections(scene, three);
  addPremiumPinDeck(scene, three);
}

/**
 * Refines materials already created by the game and removes the blocky helper
 * glows from the first scenery pass.
 *
 * @param {import("three").Scene} scene Game scene.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function upgradeExistingScene(scene, three) {
  scene.traverse(function tuneSceneObject(object) {
    if (!object.isMesh) {
      tuneLight(object);
      return;
    }

    hideLegacyGlowObject(object);
    tuneMeshMaterial(object, three);
    tuneBall(object, three);
  });
}

/**
 * Updates existing scene lights while preserving their role.
 *
 * @param {import("three").Object3D} object Scene object.
 */
function tuneLight(object) {
  if (object.isHemisphereLight) {
    object.intensity = 1.78;
    object.color.setHex(0xffedd9);
    object.groundColor.setHex(0x221017);
  } else if (object.isDirectionalLight) {
    object.intensity = 4.35;
    object.color.setHex(0xffe8c6);
  }
}

/**
 * Hides the hard-edged glow planes and dotted rail blocks from the previous
 * implementation so the replacement gradients remain continuous.
 *
 * @param {import("three").Mesh} mesh Existing mesh.
 */
function hideLegacyGlowObject(mesh) {
  const parameters = mesh.geometry?.parameters;
  if (!parameters) {
    return;
  }

  const isLegacyPod =
    mesh.geometry.type === "BoxGeometry" &&
    approximately(parameters.width, 0.18, 0.03) &&
    approximately(parameters.height, 0.06, 0.02) &&
    approximately(parameters.depth, 0.55, 0.08);

  const isLegacyGlowPool =
    mesh.geometry.type === "PlaneGeometry" &&
    approximately(parameters.width, 2.4, 0.15) &&
    approximately(parameters.height, 1.0, 0.15) &&
    mesh.material?.isMeshBasicMaterial;

  const isLegacyCrown =
    mesh.geometry.type === "PlaneGeometry" &&
    approximately(parameters.width, 1.45, 0.15) &&
    approximately(parameters.height, 0.72, 0.12);

  if (isLegacyPod || isLegacyGlowPool || isLegacyCrown) {
    mesh.visible = false;
  }
}

/**
 * Applies premium material values based on stable colors and geometry types.
 *
 * @param {import("three").Mesh} mesh Existing mesh.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function tuneMeshMaterial(mesh, three) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material?.color) {
      continue;
    }

    const color = material.color.getHex();
    if (isOneOf(color, [0xce8a4e, 0xc78449, 0xb97c45])) {
      applyStandardMaterial(material, 0xd69456, 0.26, 0.06);
    } else if (isOneOf(color, [0x2f1c24, 0x382027, 0x5a3524])) {
      applyStandardMaterial(material, 0x2e1921, 0.56, 0.08);
    } else if (isOneOf(color, [0x6d6570, 0x5b5561, 0x76777a])) {
      applyStandardMaterial(material, 0x817784, 0.17, 0.58);
    } else if (isOneOf(color, [0x101012, 0x121314])) {
      applyStandardMaterial(material, 0x0f0f12, 0.88, 0.0);
    } else if (isOneOf(color, [0x6c7077, 0x686d72])) {
      applyStandardMaterial(material, 0x767b84, 0.20, 0.86);
    } else if (color === 0xf5f0e7 && mesh.geometry?.type === "LatheGeometry") {
      applyStandardMaterial(material, 0xfffaf1, 0.20, 0.0);
    } else if (color === 0xb52d25 && mesh.geometry?.type === "CylinderGeometry") {
      applyStandardMaterial(material, 0xca2949, 0.24, 0.02);
    }

    if (material.isMeshStandardMaterial) {
      material.envMapIntensity = Math.max(material.envMapIntensity ?? 1, 1.18);
      material.needsUpdate = true;
    }
  }

  if (mesh.geometry?.type === "SphereGeometry") {
    const material = mesh.material;
    if (material?.isMeshStandardMaterial) {
      material.color.setHex(0xb40e56);
      material.emissive.setHex(0x5e0328);
      material.emissiveIntensity = 0.24;
      material.roughness = 0.10;
      material.metalness = 0.26;
      material.needsUpdate = true;
    }
  }
}

/**
 * Adds or enlarges the crown emblem on the playable ball.
 *
 * @param {import("three").Mesh} mesh Existing mesh.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function tuneBall(mesh, three) {
  if (mesh.geometry?.type !== "SphereGeometry") {
    return;
  }

  const existingEmblem = mesh.children.find(function findEmblem(child) {
    return child.isSprite;
  });

  if (existingEmblem) {
    existingEmblem.scale.set(0.50, 0.25, 1);
    existingEmblem.position.set(0, 0.02, 0.335);
    return;
  }

  const emblem = new three.Sprite(
    new three.SpriteMaterial({
      map: createCrownTexture(three, 256, 128, 5),
      transparent: true,
      depthWrite: false,
    }),
  );
  emblem.scale.set(0.50, 0.25, 1);
  emblem.position.set(0, 0.02, 0.335);
  mesh.add(emblem);
}

/**
 * Adds the balanced light rig used by the target image.
 *
 * @param {import("three").Scene} scene Game scene.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function addPremiumLights(scene, three) {
  const sidePositions = [-1, 1];
  for (const side of sidePositions) {
    const sideWash = new three.PointLight(0xff238f, 7.5, 18, 2);
    sideWash.position.set(side * 5.3, 0.95, -6.0);
    scene.add(sideWash);
  }

  const backWash = new three.PointLight(0xff208c, 5, 10, 2);
  backWash.position.set(0, 1.7, -17.2);
  scene.add(backWash);

  const laneFill = new three.PointLight(0xffca90, 9, 20, 2);
  laneFill.position.set(0, 2.0, -4.2);
  scene.add(laneFill);

  const crownGlow = new three.PointLight(0xff2f9c, 12, 12, 2);
  crownGlow.position.set(0, 4.05, -15.1);
  scene.add(crownGlow);
}

/**
 * Adds the wide reflective floor and architectural shell around the lane.
 *
 * @param {import("three").Scene} scene Game scene.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function addPremiumArchitecture(scene, three) {
  const group = new three.Group();
  group.name = "PumperellaPremiumArchitecture";

  const floorMaterial = new three.MeshStandardMaterial({
    color: 0x150c11,
    roughness: 0.10,
    metalness: 0.48,
  });
  const floorGeometry = new three.BoxGeometry(5.8, 0.06, 30.0);
  for (const side of [-1, 1]) {
    const floor = new three.Mesh(floorGeometry, floorMaterial);
    floor.position.set(side * 5.95, -0.15, -4.8);
    floor.receiveShadow = true;
    group.add(floor);
  }

  const backWall = new three.Mesh(
    new three.BoxGeometry(20.0, 8.8, 0.14),
    new three.MeshStandardMaterial({
      color: 0x0c070a,
      roughness: 0.56,
      metalness: 0.12,
    }),
  );
  backWall.position.set(0, 2.7, -18.75);
  backWall.receiveShadow = true;
  group.add(backWall);

  const frameMaterial = new three.MeshStandardMaterial({
    color: 0x211318,
    roughness: 0.42,
    metalness: 0.12,
  });
  const frameTop = new three.Mesh(new three.BoxGeometry(7.1, 0.55, 1.30), frameMaterial);
  frameTop.position.set(0, 3.55, -16.55);
  frameTop.castShadow = true;
  group.add(frameTop);

  for (const side of [-1, 1]) {
    const column = new three.Mesh(new three.BoxGeometry(0.55, 3.8, 1.10), frameMaterial);
    column.position.set(side * 3.2, 1.55, -16.25);
    column.castShadow = true;
    group.add(column);
  }

  const fascia = new three.Mesh(
    new three.BoxGeometry(3.2, 1.18, 0.18),
    new three.MeshStandardMaterial({
      color: 0x201217,
      roughness: 0.48,
      metalness: 0.08,
    }),
  );
  fascia.position.set(0, 2.66, -15.92);
  fascia.castShadow = true;
  group.add(fascia);

  const neonMaterial = new three.MeshBasicMaterial({ color: 0xff43a8 });
  for (const side of [-1, 1]) {
    const verticalBar = new three.Mesh(new three.BoxGeometry(0.10, 2.35, 0.055), neonMaterial);
    verticalBar.position.set(side * 2.55, 1.30, -15.82);
    group.add(verticalBar);
  }

  const warmLampMaterial = new three.MeshBasicMaterial({ color: 0xffd29a });
  for (const x of [-1.55, -0.78, 0, 0.78, 1.55]) {
    const lamp = new three.Mesh(new three.BoxGeometry(0.24, 0.06, 0.10), warmLampMaterial);
    lamp.position.set(x, 2.95, -15.74);
    group.add(lamp);
  }

  scene.add(group);
}

/**
 * Adds soft gradient reflections that mimic bloom without a post-processing
 * pipeline, keeping the implementation compatible with mobile Safari.
 *
 * @param {import("three").Scene} scene Game scene.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function addPremiumReflections(scene, three) {
  const group = new three.Group();
  group.name = "PumperellaPremiumReflections";

  const radialTexture = createRadialGlowTexture(three);
  const stripTexture = createStripGlowTexture(three);
  const radialGeometry = new three.PlaneGeometry(1, 1);

  const radialDefinitions = [
    [-5.4, -7.0, 4.3, 1.8, 0.34],
    [5.4, -7.0, 4.3, 1.8, 0.34],
    [-5.75, -2.1, 3.1, 1.25, 0.24],
    [5.75, -2.1, 3.1, 1.25, 0.24],
    [0.0, -5.3, 2.2, 1.0, 0.18],
  ];

  for (const [x, z, scaleX, scaleY, opacity] of radialDefinitions) {
    const material = new three.MeshBasicMaterial({
      map: radialTexture,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const glow = new three.Mesh(radialGeometry, material);
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(scaleX, scaleY, 1);
    glow.position.set(x, -0.118, z);
    group.add(glow);
  }

  for (const side of [-1, 1]) {
    const innerStrip = new three.Mesh(
      new three.PlaneGeometry(1.1, 13.9),
      new three.MeshBasicMaterial({
        map: stripTexture,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    innerStrip.rotation.x = -Math.PI / 2;
    innerStrip.rotation.z = side < 0 ? 0.022 : -0.022;
    innerStrip.position.set(side * 3.52, -0.117, -4.45);
    group.add(innerStrip);

    const outerStrip = new three.Mesh(
      new three.PlaneGeometry(1.65, 13.9),
      new three.MeshBasicMaterial({
        map: stripTexture,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    outerStrip.rotation.x = -Math.PI / 2;
    outerStrip.rotation.z = side < 0 ? 0.02 : -0.02;
    outerStrip.position.set(side * 5.45, -0.117, -4.55);
    group.add(outerStrip);

    for (const z of [-8.2, -4.05, 0.15]) {
      const band = new three.Mesh(
        new three.PlaneGeometry(3.8, 0.58),
        new three.MeshBasicMaterial({
          color: 0xff2f9c,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        }),
      );
      band.rotation.x = -Math.PI / 2;
      band.position.set(side * 5.55, -0.116, z);
      group.add(band);
    }
  }

  const rearHalo = new three.Mesh(
    new three.PlaneGeometry(8.8, 4.1),
    new three.MeshBasicMaterial({
      map: radialTexture,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  rearHalo.position.set(0, 2.55, -18.42);
  group.add(rearHalo);

  scene.add(group);
}

/**
 * Adds the large crown sign used as the focal point over the pin deck.
 *
 * @param {import("three").Scene} scene Game scene.
 * @param {typeof import("three")} three Three.js module namespace.
 */
function addPremiumPinDeck(scene, three) {
  const crown = new three.Mesh(
    new three.PlaneGeometry(1.95, 0.98),
    new three.MeshBasicMaterial({
      map: createCrownTexture(three, 640, 320, 10),
      transparent: true,
      depthWrite: false,
    }),
  );
  crown.position.set(0, 3.20, -15.56);
  scene.add(crown);
}

/**
 * Reapplies the premium camera only when the viewport profile changes.
 *
 * @param {import("three").Camera} camera Active camera.
 * @param {HTMLCanvasElement} canvas Renderer canvas.
 */
function applyPremiumCamera(camera, canvas) {
  if (!camera?.isPerspectiveCamera || !canvas) {
    return;
  }

  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  const profile = resolvePremiumCameraProfile(width, height);
  const key = `${width}x${height}:${profile.fov}`;
  if (camera.userData[CAMERA_PROFILE_KEY] === key) {
    return;
  }

  camera.userData[CAMERA_PROFILE_KEY] = key;
  camera.fov = profile.fov;
  camera.position.set(...profile.position);
  camera.lookAt(...profile.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/**
 * Creates a reusable radial glow texture.
 *
 * @param {typeof import("three")} three Three.js module namespace.
 * @returns {import("three").CanvasTexture} Glow texture.
 */
function createRadialGlowTexture(three) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 120);
  gradient.addColorStop(0, "rgba(255,108,189,1)");
  gradient.addColorStop(0.30, "rgba(255,60,164,.72)");
  gradient.addColorStop(0.65, "rgba(255,40,150,.26)");
  gradient.addColorStop(1, "rgba(255,40,150,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/**
 * Creates a soft longitudinal reflection texture.
 *
 * @param {typeof import("three")} three Three.js module namespace.
 * @returns {import("three").CanvasTexture} Strip texture.
 */
function createStripGlowTexture(three) {
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

/**
 * Draws the Pumperella crown for the back wall and ball emblem.
 *
 * @param {typeof import("three")} three Three.js module namespace.
 * @param {number} width Canvas width.
 * @param {number} height Canvas height.
 * @param {number} lineWidth Crown line width.
 * @returns {import("three").CanvasTexture} Crown texture.
 */
function createCrownTexture(three, width, height, lineWidth) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const centerX = width / 2;
  const scaleX = width / 640;
  const scaleY = height / 320;

  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#ff64b6";
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.shadowColor = "#ff2f9c";
  context.shadowBlur = Math.max(8, lineWidth * 3);
  context.beginPath();
  context.moveTo(centerX - 170 * scaleX, 212 * scaleY);
  context.lineTo(centerX - 126 * scaleX, 134 * scaleY);
  context.lineTo(centerX - 58 * scaleX, 184 * scaleY);
  context.lineTo(centerX, 100 * scaleY);
  context.lineTo(centerX + 58 * scaleX, 184 * scaleY);
  context.lineTo(centerX + 126 * scaleX, 134 * scaleY);
  context.lineTo(centerX + 170 * scaleX, 212 * scaleY);
  context.lineTo(centerX - 170 * scaleX, 212 * scaleY);
  context.stroke();

  const crownPoints = [
    [centerX - 170 * scaleX, 212 * scaleY, 11],
    [centerX - 126 * scaleX, 134 * scaleY, 10],
    [centerX - 58 * scaleX, 184 * scaleY, 8],
    [centerX, 100 * scaleY, 11],
    [centerX + 58 * scaleX, 184 * scaleY, 8],
    [centerX + 126 * scaleX, 134 * scaleY, 10],
    [centerX + 170 * scaleX, 212 * scaleY, 11],
  ];

  for (const [x, y, radius] of crownPoints) {
    context.beginPath();
    context.arc(x, y, radius * Math.min(scaleX, scaleY), 0, Math.PI * 2);
    context.stroke();
  }

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/**
 * Applies common standard-material tuning.
 *
 * @param {import("three").Material} material Candidate material.
 * @param {number} color Hex color.
 * @param {number} roughness Surface roughness.
 * @param {number} metalness Surface metalness.
 */
function applyStandardMaterial(material, color, roughness, metalness) {
  if (!material.isMeshStandardMaterial) {
    return;
  }

  material.color.setHex(color);
  material.roughness = roughness;
  material.metalness = metalness;
}

/**
 * Checks whether a numeric value is approximately equal to a target.
 *
 * @param {number} value Candidate value.
 * @param {number} target Target value.
 * @param {number} tolerance Allowed difference.
 * @returns {boolean} Whether the values are close enough.
 */
function approximately(value, target, tolerance) {
  return Number.isFinite(value) && Math.abs(value - target) <= tolerance;
}

/**
 * Checks whether a value occurs in a small fixed set.
 *
 * @param {number} value Candidate value.
 * @param {number[]} candidates Candidate set.
 * @returns {boolean} Whether the value is included.
 */
function isOneOf(value, candidates) {
  return candidates.includes(value);
}
