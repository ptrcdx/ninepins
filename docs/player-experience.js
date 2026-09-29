const THREE_MODULE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
const SCENE_HOOK_KEY = Symbol.for("pumperella.playerExperience.sceneHook");
const SCENE_PENDING_KEY = "pumperellaPlayerExperiencePending";
const SETTER_BRAND_KEY = "pumperellaPinsetterBrand";
const STYLE_ID = "pumperella-player-experience-style";
const CARD_ID = "pumperella-current-player";

/**
 * Installs the approved player HUD and 3D pinsetter branding before the game
 * creates its Three.js scene.
 *
 * @param {object} playerSession Verified player session.
 * @returns {Promise<void>} Resolves after UI and scene hooks are installed.
 */
export async function installPlayerExperience(playerSession) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  installPlayerHud(resolvePlayerDisplayName(playerSession, window.location.href));
  const three = await import(THREE_MODULE_URL);
  installSceneHook(three);
}

/**
 * Resolves the visible player name from the personal link first and then from
 * common session shapes. Query parameters are display metadata only; signed
 * draw dates continue to come exclusively from the verified fragment token.
 *
 * @param {object|null|undefined} playerSession Player session.
 * @param {string} locationHref Current page URL.
 * @returns {string} Display name.
 */
export function resolvePlayerDisplayName(playerSession, locationHref) {
  const url = new URL(locationHref, "https://example.invalid/");
  for (const key of ["player", "name", "spieler", "displayName"]) {
    const value = url.searchParams.get(key);
    if (value?.trim()) {
      return value.trim();
    }
  }

  const candidates = [
    playerSession?.playerName,
    playerSession?.playerDisplayName,
    playerSession?.displayName,
    playerSession?.name,
    playerSession?.player?.name,
    playerSession?.player?.displayName,
    playerSession?.linkData?.name,
    playerSession?.linkData?.displayName,
    playerSession?.meta?.name,
    playerSession?.meta?.displayName,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Gastspielerin";
}

/**
 * Adds the centered player card and compacts the lower dialog so the launch
 * ball remains visible and directly touchable.
 *
 * @param {string} playerName Current player name.
 */
function installPlayerHud(playerName) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .pumperella-current-player {
        position: fixed;
        z-index: 4;
        top: max(18px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        min-width: min(320px, calc(100vw - 760px));
        max-width: min(420px, calc(100vw - 40px));
        padding: 11px 20px 12px;
        text-align: center;
        pointer-events: none;
        background: linear-gradient(180deg, rgba(29,13,20,.92), rgba(13,8,12,.90));
        border: 1px solid rgba(255,80,165,.72);
        border-radius: 18px;
        box-shadow: 0 0 0 1px rgba(255,120,190,.15), 0 12px 30px rgba(0,0,0,.42), 0 0 26px rgba(255,37,140,.22);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .pumperella-current-player small {
        display: block;
        color: rgba(255,246,251,.72);
        font-size: 11px;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      .pumperella-current-player strong {
        display: block;
        margin-top: 3px;
        color: #fff7fb;
        font-size: clamp(18px, 2vw, 27px);
        line-height: 1.08;
      }
      .hud .bottom {
        padding-bottom: 0 !important;
      }
      .hud .hint {
        width: min(760px, calc(100vw - 36px)) !important;
        padding: 11px 20px 9px !important;
        transform: translateY(12px);
      }
      .hud .hint strong {
        font-size: clamp(17px, 2vw, 27px) !important;
      }
      .hud .hint span {
        margin-top: 5px !important;
        font-size: clamp(12px, 1.05vw, 16px) !important;
        line-height: 1.32 !important;
      }
      .hud .hint .meter {
        height: 4px !important;
        margin-top: 7px !important;
      }
      .hud .hint #next {
        min-height: 40px !important;
        margin-top: 8px !important;
        padding: 8px 20px !important;
      }
      @media (max-width: 1050px) {
        .pumperella-current-player {
          top: max(104px, calc(env(safe-area-inset-top) + 86px));
          min-width: min(340px, calc(100vw - 28px));
        }
      }
      @media (max-width: 600px) {
        .pumperella-current-player {
          top: max(82px, calc(env(safe-area-inset-top) + 70px));
          padding: 8px 13px 9px;
          border-radius: 15px;
        }
        .pumperella-current-player small { font-size: 9px; }
        .pumperella-current-player strong { font-size: 16px; }
        .hud .hint {
          width: min(620px, calc(100vw - 24px)) !important;
          padding: 9px 12px 7px !important;
          transform: translateY(5px);
        }
        .hud .hint strong { font-size: 16px !important; }
        .hud .hint span { font-size: 11px !important; }
      }
      @media (max-height: 560px) and (orientation: landscape) {
        .pumperella-current-player {
          top: max(8px, env(safe-area-inset-top));
          padding: 6px 12px 7px;
        }
        .pumperella-current-player small { font-size: 8px; }
        .pumperella-current-player strong { font-size: 14px; }
        .hud .hint {
          padding: 7px 12px 5px !important;
          transform: translateY(4px);
        }
      }
    `;
    document.head.append(style);
  }

  let card = document.getElementById(CARD_ID);
  if (!card) {
    card = document.createElement("div");
    card.id = CARD_ID;
    card.className = "pumperella-current-player";
    card.innerHTML = "<small>Aktuell spielt</small><strong></strong>";
    document.body.append(card);
  }

  card.querySelector("strong").textContent = playerName;
}

/**
 * Hooks concrete game scenes and adds the sign as soon as the moving pinsetter
 * group has been assembled.
 *
 * @param {typeof import("three")} three Three.js namespace.
 */
function installSceneHook(three) {
  const prototype = three.Scene.prototype;
  if (prototype[SCENE_HOOK_KEY]) {
    return;
  }

  const originalAdd = prototype.add;
  prototype.add = function addWithPinsetterBrand(...objects) {
    const result = originalAdd.apply(this, objects);
    scheduleSceneBranding(this, three);
    return result;
  };

  Object.defineProperty(prototype, SCENE_HOOK_KEY, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
}

/**
 * Defers inspection until the current scene-building operation completes.
 *
 * @param {import("three").Scene} scene Active scene.
 * @param {typeof import("three")} three Three.js namespace.
 */
function scheduleSceneBranding(scene, three) {
  if (scene.userData[SCENE_PENDING_KEY]) {
    return;
  }

  scene.userData[SCENE_PENDING_KEY] = true;
  queueMicrotask(() => {
    scene.userData[SCENE_PENDING_KEY] = false;
    const setter = findPinsetter(scene);
    if (setter && !setter.userData[SETTER_BRAND_KEY]) {
      addPinsetterBrand(setter, three);
      setter.userData[SETTER_BRAND_KEY] = true;
    }
  });
}

/**
 * Finds the moving pinsetter group from its stable compound geometry.
 *
 * @param {import("three").Scene} scene Active scene.
 * @returns {import("three").Group|null} Pinsetter group.
 */
function findPinsetter(scene) {
  let match = null;
  scene.traverse((object) => {
    if (match || !object.isGroup || object.children.length < 2) {
      return;
    }

    const boxes = object.children
      .filter((child) => child.isMesh && child.geometry?.type === "BoxGeometry")
      .map((child) => child.geometry.parameters);

    const hasTop = boxes.some((box) =>
      approximately(box.width, 4.65, 0.12) &&
      approximately(box.height, 0.20, 0.08) &&
      approximately(box.depth, 4.35, 0.18),
    );
    const hasFront = boxes.some((box) =>
      approximately(box.width, 4.65, 0.12) &&
      approximately(box.height, 1.60, 0.12) &&
      approximately(box.depth, 0.16, 0.08),
    );

    if (hasTop && hasFront) {
      match = object;
    }
  });
  return match;
}

/**
 * Adds a premium illuminated plaque to the moving front face.
 *
 * @param {import("three").Group} setter Pinsetter group.
 * @param {typeof import("three")} three Three.js namespace.
 */
function addPinsetterBrand(setter, three) {
  const group = new three.Group();
  group.name = "PumperellaPinsetterLogo";

  const plaque = new three.Mesh(
    new three.BoxGeometry(3.18, 0.92, 0.08),
    new three.MeshStandardMaterial({
      color: 0x1c0d14,
      emissive: 0x260711,
      emissiveIntensity: 0.22,
      roughness: 0.38,
      metalness: 0.18,
    }),
  );
  plaque.position.set(0, -0.19, 2.18);
  group.add(plaque);

  const material = new three.MeshBasicMaterial({
    map: createPinsetterTexture(three),
    transparent: true,
    depthWrite: false,
  });
  const sign = new three.Mesh(new three.PlaneGeometry(2.94, 0.78), material);
  sign.position.set(0, -0.19, 2.226);
  sign.renderOrder = 8;
  group.add(sign);

  setter.add(group);
  loadOfficialLogo(three, material);
}

/**
 * Replaces the fallback emblem with the official shipped logo once loaded.
 *
 * @param {typeof import("three")} three Three.js namespace.
 * @param {import("three").MeshBasicMaterial} material Sign material.
 */
function loadOfficialLogo(three, material) {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const previous = material.map;
    material.map = createPinsetterTexture(three, image);
    material.needsUpdate = true;
    previous?.dispose();
  };
  image.src = new URL("./assets/pumperella-logo.png", import.meta.url).href;
}

/**
 * Creates the horizontal pinsetter sign texture.
 *
 * @param {typeof import("three")} three Three.js namespace.
 * @param {CanvasImageSource|null} [logoImage=null] Official logo image.
 * @returns {import("three").CanvasTexture} Sign texture.
 */
function createPinsetterTexture(three, logoImage = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 320;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  const background = context.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, "rgba(255,62,165,.18)");
  background.addColorStop(0.5, "rgba(255,22,132,.06)");
  background.addColorStop(1, "rgba(255,22,132,0)");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (logoImage) {
    const maxWidth = 250;
    const maxHeight = 250;
    const scale = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height);
    const width = logoImage.width * scale;
    const height = logoImage.height * scale;
    context.drawImage(logoImage, 42 + (maxWidth - width) / 2, 35 + (maxHeight - height) / 2, width, height);
  } else {
    drawFallbackCrown(context);
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 96px Inter, system-ui, sans-serif";
  context.lineJoin = "round";
  context.shadowColor = "#ff2f9c";
  context.shadowBlur = 24;
  context.strokeStyle = "#fff2f8";
  context.lineWidth = 16;
  context.strokeText("PUMPERELLA", 650, 150);
  context.shadowBlur = 0;
  context.fillStyle = "#ffffff";
  context.fillText("PUMPERELLA", 650, 150);
  context.font = "500 31px Inter, system-ui, sans-serif";
  context.letterSpacing = "8px";
  context.fillStyle = "rgba(255,240,248,.82)";
  context.fillText("KEGELSPIEL", 650, 235);

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

/**
 * Draws a compact fallback crown until the official image has loaded.
 *
 * @param {CanvasRenderingContext2D} context Canvas context.
 */
function drawFallbackCrown(context) {
  context.strokeStyle = "#ffeaf5";
  context.lineWidth = 11;
  context.lineJoin = "round";
  context.shadowColor = "#ff2f9c";
  context.shadowBlur = 22;
  context.beginPath();
  context.moveTo(70, 205);
  context.lineTo(105, 135);
  context.lineTo(145, 180);
  context.lineTo(185, 100);
  context.lineTo(225, 180);
  context.lineTo(265, 135);
  context.lineTo(300, 205);
  context.lineTo(70, 205);
  context.stroke();
}

/**
 * Checks numeric geometry values with tolerance.
 *
 * @param {number} value Candidate value.
 * @param {number} target Target value.
 * @param {number} tolerance Allowed difference.
 * @returns {boolean} Whether values are close.
 */
function approximately(value, target, tolerance) {
  return Number.isFinite(value) && Math.abs(value - target) <= tolerance;
}
