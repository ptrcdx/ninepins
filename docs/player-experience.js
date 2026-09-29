const THREE_MODULE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
const SCENE_HOOK_KEY = Symbol.for("pumperella.playerExperience.sceneHook.v2");
const SCENE_PENDING_KEY = "pumperellaPlayerExperiencePendingV2";
const SETTER_BRAND_KEY = "pumperellaPinsetterBrandV2";
const BALL_BRAND_KEY = "pumperellaBallBrandV2";
const STYLE_ID = "pumperella-player-experience-style-v2";
const INLINE_PLAYER_ID = "pumperella-current-player-inline";
const LEGACY_CARD_ID = "pumperella-current-player";
const ARCHIVE_STORAGE_KEY = "ninepins.drawArchive.v1";
const MAX_PLAYER_NAME_LENGTH = 80;

/**
 * Installs the approved player HUD and 3D branding before the game creates its
 * Three.js scene.
 *
 * @param {object} playerSession Verified player session.
 * @returns {Promise<void>} Resolves after UI and scene hooks are installed.
 */
export async function installPlayerExperience(playerSession) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const storage = resolveBrowserStorage();
  const playerName = resolvePlayerDisplayName(
    playerSession,
    window.location.href,
    storage,
  );
  installPlayerHud(playerName);

  const three = await import(THREE_MODULE_URL);
  installSceneHook(three);
}

/**
 * Resolves the visible player name. A query parameter is preferred for links
 * created by the current admin tool. Older links can still recover the player
 * from the local admin archive by drawId when both pages share an origin.
 *
 * @param {object|null|undefined} playerSession Player session.
 * @param {string} locationHref Current page URL.
 * @param {{getItem:(key:string)=>string|null}|null} [storage=null] Optional storage.
 * @returns {string} Display name.
 */
export function resolvePlayerDisplayName(
  playerSession,
  locationHref,
  storage = null,
) {
  const url = new URL(locationHref, "https://example.invalid/");
  for (const key of ["player", "name", "spieler", "displayName"]) {
    const value = normalizePlayerName(url.searchParams.get(key));
    if (value) {
      return value;
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
    const value = normalizePlayerName(candidate);
    if (value) {
      return value;
    }
  }

  const archivedName = findArchivedPlayerName(playerSession?.drawId, storage);
  return archivedName ?? "Name nicht verfügbar";
}

/**
 * Finds a player in the locally persisted admin archive by drawId.
 *
 * @param {unknown} drawId Draw identifier.
 * @param {{getItem:(key:string)=>string|null}|null} storage Storage adapter.
 * @returns {string|null} Matching player name or null.
 */
export function findArchivedPlayerName(drawId, storage) {
  if (typeof drawId !== "string" || !drawId || !storage) {
    return null;
  }

  try {
    const serialized = storage.getItem(ARCHIVE_STORAGE_KEY);
    if (!serialized) {
      return null;
    }

    const archive = JSON.parse(serialized);
    if (!Array.isArray(archive?.draws)) {
      return null;
    }

    for (const batch of archive.draws) {
      if (!Array.isArray(batch?.assignments)) {
        continue;
      }
      const assignment = batch.assignments.find(
        (candidate) => candidate?.drawId === drawId,
      );
      const name = normalizePlayerName(assignment?.player);
      if (name) {
        return name;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Adds the player name to the existing dates card and compacts the lower
 * dialog so the launch ball remains visible and directly touchable.
 *
 * @param {string} playerName Current player name.
 */
function installPlayerHud(playerName) {
  document.getElementById(LEGACY_CARD_ID)?.remove();

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .dates .pumperella-player-inline {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 10px;
        padding: 8px 10px;
        border: 1px solid rgba(255,80,165,.28);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(255,45,148,.10), rgba(255,45,148,.035));
      }
      .dates .pumperella-player-inline small {
        flex: 0 0 auto;
        color: rgba(255,246,251,.62);
        font-size: 10px;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .dates .pumperella-player-inline strong {
        min-width: 0;
        overflow: hidden;
        color: #fff7fb;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.15;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hud .bottom {
        padding-bottom: 0 !important;
      }
      .hud .hint {
        width: min(760px, calc(100vw - 36px)) !important;
        padding: 9px 18px 7px !important;
        transform: translateY(14px);
      }
      .hud .hint strong {
        font-size: clamp(16px, 1.85vw, 25px) !important;
      }
      .hud .hint span {
        margin-top: 4px !important;
        font-size: clamp(11px, 1vw, 15px) !important;
        line-height: 1.28 !important;
      }
      .hud .hint .meter {
        height: 3px !important;
        margin-top: 6px !important;
      }
      .hud .hint #next {
        min-height: 38px !important;
        margin-top: 7px !important;
        padding: 7px 19px !important;
      }
      @media (max-width: 600px) {
        .dates .pumperella-player-inline {
          display: block;
          padding: 7px 8px;
        }
        .dates .pumperella-player-inline small,
        .dates .pumperella-player-inline strong {
          display: block;
          text-align: left;
        }
        .dates .pumperella-player-inline strong {
          margin-top: 3px;
          font-size: 12px;
        }
        .hud .hint {
          width: min(620px, calc(100vw - 24px)) !important;
          padding: 8px 11px 6px !important;
          transform: translateY(6px);
        }
        .hud .hint strong { font-size: 15px !important; }
        .hud .hint span { font-size: 10.5px !important; }
      }
      @media (max-height: 560px) and (orientation: landscape) {
        .dates .pumperella-player-inline {
          margin-bottom: 6px;
          padding: 5px 7px;
        }
        .hud .hint {
          padding: 6px 11px 4px !important;
          transform: translateY(4px);
        }
      }
    `;
    document.head.append(style);
  }

  const datesCard = document.querySelector(".dates");
  if (!datesCard) {
    return;
  }

  let row = document.getElementById(INLINE_PLAYER_ID);
  if (!row) {
    row = document.createElement("div");
    row.id = INLINE_PLAYER_ID;
    row.className = "pumperella-player-inline";
    row.innerHTML = "<small>Aktuell spielt</small><strong></strong>";
    const list = datesCard.querySelector("ol");
    datesCard.insertBefore(row, list);
  }

  row.querySelector("strong").textContent = playerName;
}

/**
 * Hooks concrete game scenes and adds the corrected pinsetter and ball marks as
 * soon as their meshes have been assembled.
 *
 * @param {typeof import("three")} three Three.js namespace.
 */
function installSceneHook(three) {
  const prototype = three.Scene.prototype;
  if (prototype[SCENE_HOOK_KEY]) {
    return;
  }

  const originalAdd = prototype.add;
  prototype.add = function addWithPumperellaBrand(...objects) {
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

    const ball = findPlayableBall(scene);
    if (ball && !ball.userData[BALL_BRAND_KEY]) {
      addOfficialCrownToBall(ball, three);
      ball.userData[BALL_BRAND_KEY] = true;
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
 * Finds the playable sphere used as the bowling ball.
 *
 * @param {import("three").Scene} scene Active scene.
 * @returns {import("three").Mesh|null} Ball mesh.
 */
function findPlayableBall(scene) {
  let match = null;
  scene.traverse((object) => {
    if (!match && object.isMesh && object.geometry?.type === "SphereGeometry") {
      match = object;
    }
  });
  return match;
}

/**
 * Adds a fitted illuminated sign inside the existing front-face geometry.
 *
 * @param {import("three").Group} setter Pinsetter group.
 * @param {typeof import("three")} three Three.js namespace.
 */
function addPinsetterBrand(setter, three) {
  const material = new three.MeshBasicMaterial({
    map: createPinsetterTexture(three),
    transparent: true,
    depthWrite: false,
  });
  const sign = new three.Mesh(new three.PlaneGeometry(3.36, 0.54), material);
  sign.name = "PumperellaPinsetterLogo";
  sign.position.set(0, -0.16, 2.176);
  sign.renderOrder = 8;
  setter.add(sign);

  loadOfficialLogo(three, (image) => {
    const previous = material.map;
    material.map = createPinsetterTexture(three, image);
    material.needsUpdate = true;
    previous?.dispose();
  });
}

/**
 * Replaces the generic crown sprite with the actual crown cropped from the
 * official club logo.
 *
 * @param {import("three").Mesh} ball Ball mesh.
 * @param {typeof import("three")} three Three.js namespace.
 */
function addOfficialCrownToBall(ball, three) {
  for (const child of ball.children) {
    if (child.isSprite) {
      child.visible = false;
    }
  }

  const material = new three.SpriteMaterial({
    map: createBallCrownTexture(three),
    transparent: true,
    depthWrite: false,
  });
  const emblem = new three.Sprite(material);
  const radius = ball.geometry?.parameters?.radius ?? 0.33;
  emblem.name = "PumperellaOfficialBallCrown";
  emblem.scale.set(0.46, 0.31, 1);
  emblem.position.set(0, 0.018, radius + 0.006);
  emblem.renderOrder = 9;
  ball.add(emblem);

  loadOfficialLogo(three, (image) => {
    const previous = material.map;
    material.map = createBallCrownTexture(three, image);
    material.needsUpdate = true;
    previous?.dispose();
  });
}

/**
 * Loads the official club logo from the shipped asset.
 *
 * @param {typeof import("three")} three Three.js namespace.
 * @param {(image:HTMLImageElement)=>void} onLoad Success callback.
 */
function loadOfficialLogo(three, onLoad) {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => onLoad(image);
  image.src = new URL("./assets/pumperella-logo.png", import.meta.url).href;
}

/**
 * Creates the horizontal sign texture. The sign contains only the emblem and a
 * large readable wordmark; the tiny tagline is intentionally omitted.
 *
 * @param {typeof import("three")} three Three.js namespace.
 * @param {CanvasImageSource|null} [logoImage=null] Official logo image.
 * @returns {import("three").CanvasTexture} Sign texture.
 */
function createPinsetterTexture(three, logoImage = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  const background = context.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, "rgba(255,60,164,.16)");
  background.addColorStop(0.55, "rgba(255,24,139,.05)");
  background.addColorStop(1, "rgba(255,24,139,0)");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (logoImage) {
    drawOfficialEmblem(context, logoImage, 22, 7, 230, 178);
  } else {
    drawFallbackCrown(context, 134, 96, 0.70);
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 102px Inter, system-ui, sans-serif";
  context.lineJoin = "round";
  context.shadowColor = "#ff2f9c";
  context.shadowBlur = 18;
  context.strokeStyle = "#ffedf6";
  context.lineWidth = 12;
  context.strokeText("PUMPERELLA", 640, 99);
  context.shadowBlur = 0;
  context.fillStyle = "#ffffff";
  context.fillText("PUMPERELLA", 640, 99);

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

/**
 * Creates a crown texture by cropping the actual crown from the club logo.
 *
 * @param {typeof import("three")} three Three.js namespace.
 * @param {CanvasImageSource|null} [logoImage=null] Official logo image.
 * @returns {import("three").CanvasTexture} Crown texture.
 */
function createBallCrownTexture(three, logoImage = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 220;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (logoImage) {
    const sourceX = logoImage.width * 0.36;
    const sourceY = logoImage.height * 0.035;
    const sourceWidth = logoImage.width * 0.30;
    const sourceHeight = logoImage.height * 0.25;
    context.shadowColor = "rgba(255,255,255,.75)";
    context.shadowBlur = 12;
    context.drawImage(
      logoImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      35,
      18,
      250,
      184,
    );
  } else {
    drawFallbackCrown(context, 160, 115, 1.0);
  }

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

/**
 * Draws only the graphic part of the official logo and excludes its small
 * embedded wordmark.
 *
 * @param {CanvasRenderingContext2D} context Canvas context.
 * @param {CanvasImageSource} image Official logo image.
 * @param {number} x Destination X.
 * @param {number} y Destination Y.
 * @param {number} width Destination width.
 * @param {number} height Destination height.
 */
function drawOfficialEmblem(context, image, x, y, width, height) {
  const sourceX = image.width * 0.12;
  const sourceY = image.height * 0.02;
  const sourceWidth = image.width * 0.76;
  const sourceHeight = image.height * 0.72;
  context.shadowColor = "rgba(255,47,156,.65)";
  context.shadowBlur = 14;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
  context.shadowBlur = 0;
}

/**
 * Draws a crown matching the official mark until its asset is available.
 *
 * @param {CanvasRenderingContext2D} context Canvas context.
 * @param {number} centerX Crown center X.
 * @param {number} centerY Crown center Y.
 * @param {number} scale Crown scale.
 */
function drawFallbackCrown(context, centerX, centerY, scale) {
  const points = [
    [-92, 48],
    [-70, -20],
    [-34, 23],
    [0, -56],
    [34, 23],
    [70, -20],
    [92, 48],
  ];

  context.strokeStyle = "#fff2f8";
  context.lineWidth = 10 * scale;
  context.lineJoin = "round";
  context.shadowColor = "#ff2f9c";
  context.shadowBlur = 18 * scale;
  context.beginPath();
  points.forEach(([x, y], index) => {
    const px = centerX + x * scale;
    const py = centerY + y * scale;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.lineTo(centerX - 92 * scale, centerY + 48 * scale);
  context.stroke();

  for (const [x, y] of points) {
    context.beginPath();
    context.arc(
      centerX + x * scale,
      centerY + y * scale,
      7 * scale,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
  context.shadowBlur = 0;
}

/**
 * Returns the first accessible browser storage implementation.
 *
 * @returns {Storage|null} Browser storage or null.
 */
function resolveBrowserStorage() {
  for (const key of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[key];
      if (storage?.getItem) {
        return storage;
      }
    } catch {
      // Continue with the next storage option.
    }
  }
  return null;
}

/**
 * Normalizes a player name for display.
 *
 * @param {unknown} value Candidate value.
 * @returns {string|null} Normalized name or null.
 */
function normalizePlayerName(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, MAX_PLAYER_NAME_LENGTH) : null;
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
