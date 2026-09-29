const THREE_MODULE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
const SCENE_HOOK_KEY = Symbol.for("pumperella.playerExperience.sceneHook.v3");
const SCENE_PENDING_KEY = "pumperellaPlayerExperiencePendingV3";
const SETTER_BRAND_KEY = "pumperellaPinsetterBrandV3";
const BALL_BRAND_KEY = "pumperellaBallBrandV3";
const STYLE_ID = "pumperella-player-experience-style-v3";
const INLINE_PLAYER_ID = "pumperella-current-player-inline";
const LEGACY_CARD_ID = "pumperella-current-player";
const ARCHIVE_STORAGE_KEY = "ninepins.drawArchive.v2";
const LEGACY_ARCHIVE_STORAGE_KEY = "ninepins.drawArchive.v1";
const MAX_PLAYER_NAME_LENGTH = 80;
const INITIAL_CAMERA_ELEVATION_RADIANS = Math.PI / 6;

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
  const dateCount = Array.isArray(playerSession?.dates)
    ? playerSession.dates.length
    : 2;
  installPlayerHud(playerName, dateCount);
  if (dateCount === 2) {
    installTwoDateCopyCompatibility();
  }

  const three = await import(THREE_MODULE_URL);
  installSceneHook(three);
}

/**
 * Resolves the visible player name from the verified session. Legacy version-1
 * links can still recover the player from a local admin archive by drawId.
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
  // Parse the URL defensively, but never trust identity query parameters.
  new URL(locationHref, "https://example.invalid/");

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
 * Finds a player in a locally persisted admin archive by drawId.
 *
 * @param {unknown} drawId Draw identifier.
 * @param {{getItem:(key:string)=>string|null}|null} storage Storage adapter.
 * @returns {string|null} Matching player name or null.
 */
export function findArchivedPlayerName(drawId, storage) {
  if (typeof drawId !== "string" || !drawId || !storage) {
    return null;
  }

  for (const storageKey of [ARCHIVE_STORAGE_KEY, LEGACY_ARCHIVE_STORAGE_KEY]) {
    try {
      const serialized = storage.getItem(storageKey);
      if (!serialized) {
        continue;
      }

      const archive = JSON.parse(serialized);
      if (!Array.isArray(archive?.draws)) {
        continue;
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
      // Continue with the next compatible archive generation.
    }
  }

  return null;
}

/**
 * Adds the player name to the existing dates card and compacts the lower
 * dialog so the launch ball remains visible and directly touchable.
 *
 * @param {string} playerName Current player name.
 * @param {number} dateCount Number of signed dates in the verified token.
 */
function installPlayerHud(playerName, dateCount) {
  document.getElementById(LEGACY_CARD_ID)?.remove();
  document.body.classList.toggle("pumperella-two-date-draw", dateCount === 2);

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
      .pumperella-two-date-draw #date-row-3 {
        display: none !important;
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
        body.pumperella-two-date-draw .hud {
          padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom)) !important;
        }
        body.pumperella-two-date-draw .top {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 116px;
          align-items: start;
          gap: 9px;
        }
        body.pumperella-two-date-draw .left-stack {
          display: contents;
        }
        body.pumperella-two-date-draw .brand {
          display: flex;
          grid-column: 1 / -1;
          width: 100%;
          min-width: 0;
          max-width: none;
          min-height: 62px;
          padding: 8px 12px;
          gap: 10px;
          border-radius: 15px;
        }
        body.pumperella-two-date-draw .brand-logo {
          width: 46px;
          height: 46px;
          flex: 0 0 46px;
        }
        body.pumperella-two-date-draw .brand-copy {
          gap: 2px;
          min-width: 0;
        }
        body.pumperella-two-date-draw .brand-title {
          font-size: 19px;
          line-height: 1;
        }
        body.pumperella-two-date-draw .version {
          font-size: 9px;
          letter-spacing: .16em;
        }
        body.pumperella-two-date-draw .dates {
          grid-column: 1;
          width: 100%;
          min-width: 0;
          max-width: none;
          padding: 10px 11px 11px;
          border-radius: 15px;
        }
        body.pumperella-two-date-draw .dates .card-heading {
          gap: 7px;
          margin-bottom: 7px;
        }
        body.pumperella-two-date-draw .dates .icon-badge {
          width: 26px;
          height: 26px;
          border-radius: 8px;
        }
        body.pumperella-two-date-draw .dates .icon-badge svg {
          width: 16px;
          height: 16px;
        }
        body.pumperella-two-date-draw .dates .card-heading small {
          font-size: 10px;
          letter-spacing: .11em;
        }
        body.pumperella-two-date-draw .dates .pumperella-player-inline {
          display: flex;
          align-items: baseline;
          margin: 0 0 8px;
          padding: 0 0 8px;
          border: 0;
          border-bottom: 1px solid rgba(255,255,255,.09);
          border-radius: 0;
          background: none;
        }
        body.pumperella-two-date-draw .dates .pumperella-player-inline small {
          font-size: 9px;
          letter-spacing: .10em;
        }
        body.pumperella-two-date-draw .dates .pumperella-player-inline strong {
          max-width: 70%;
          margin: 0;
          font-size: 14px;
          line-height: 1.15;
          text-align: right;
        }
        body.pumperella-two-date-draw .dates ol {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
        }
        body.pumperella-two-date-draw .dates li {
          display: block;
          min-width: 0;
          padding: 8px 9px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 10px;
          background: rgba(255,255,255,.035);
        }
        body.pumperella-two-date-draw .dates li span {
          display: none;
        }
        body.pumperella-two-date-draw .dates li strong {
          display: block;
          overflow: hidden;
          font-size: 13px;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        body.pumperella-two-date-draw .status {
          grid-column: 2;
          width: 116px;
          min-width: 116px;
          max-width: 116px;
          padding: 10px;
          border-radius: 15px;
        }
        body.pumperella-two-date-draw .status small {
          font-size: 9px;
          letter-spacing: .10em;
        }
        body.pumperella-two-date-draw .status strong {
          margin-top: 4px;
          font-size: 16px;
          line-height: 1.1;
        }
        body.pumperella-two-date-draw .result {
          top: max(174px, calc(env(safe-area-inset-top) + 164px));
          min-width: 224px;
          max-width: calc(100vw - 24px);
          padding: 10px 13px;
        }
        body.pumperella-two-date-draw .result.date {
          display: none;
        }
        .hud .hint {
          width: min(620px, calc(100vw - 20px)) !important;
          padding: 9px 12px 7px !important;
          transform: translateY(4px);
          border-radius: 16px !important;
        }
        .hud .hint strong {
          font-size: 16px !important;
        }
        .hud .hint span {
          margin-top: 4px !important;
          font-size: 12.5px !important;
          line-height: 1.28 !important;
        }
        .hud .hint .meter {
          height: 4px !important;
          margin-top: 6px !important;
        }
        .hud .hint #next {
          min-height: 38px !important;
          margin-top: 7px !important;
          padding: 6px 18px !important;
          font-size: 14px !important;
        }
      }
      @media (max-width: 380px) {
        body.pumperella-two-date-draw .top {
          grid-template-columns: minmax(0, 1fr) 106px;
        }
        body.pumperella-two-date-draw .brand {
          min-height: 58px;
          padding: 7px 10px;
        }
        body.pumperella-two-date-draw .brand-logo {
          width: 42px;
          height: 42px;
          flex-basis: 42px;
        }
        body.pumperella-two-date-draw .brand-title {
          font-size: 17px;
        }
        body.pumperella-two-date-draw .status {
          width: 106px;
          min-width: 106px;
          max-width: 106px;
        }
        body.pumperella-two-date-draw .dates .pumperella-player-inline strong {
          max-width: 65%;
          font-size: 13px;
        }
        body.pumperella-two-date-draw .dates li strong {
          font-size: 12px;
        }
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
  datesCard.dataset.dateCount = String(dateCount);

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
 * Keeps the legacy inline game controller's hard-coded three-date wording in
 * sync with current two-date sessions without changing its validated physics.
 */
function installTwoDateCopyCompatibility() {
  const replacements = [
    ["Alle drei Termine sind bereits gezogen. Du kannst beliebig weiterspielen.", "Beide Termine sind bereits gezogen. Du kannst beliebig weiterspielen."],
    ["Alle drei Termine sind gezogen · weiterspielen", "Beide Termine sind gezogen · weiterspielen"],
    ["Die drei gezogenen Termine bleiben unverändert.", "Die beiden gezogenen Termine bleiben unverändert."],
    ["Alle drei Termine sind gezogen", "Beide Termine sind gezogen"],
  ];
  const elements = [
    "status",
    "hintTitle",
    "hintText",
    "resultLabel",
    "resultValue",
  ]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const normalize = (element) => {
    let next = element.textContent ?? "";
    next = next.replace(/Termin (\d+) von 3/gu, "Termin $1 von 2");
    next = next.replace(/(\d+) von 3 gezogen/gu, "$1 von 2 gezogen");
    for (const [from, to] of replacements) {
      next = next.replaceAll(from, to);
    }
    if (next !== element.textContent) {
      element.textContent = next;
    }
  };

  const observer = new MutationObserver((mutations) => {
    const changed = new Set();
    for (const mutation of mutations) {
      const element = mutation.target.nodeType === Node.TEXT_NODE
        ? mutation.target.parentElement
        : mutation.target;
      if (element instanceof Element) {
        const tracked = elements.find((candidate) =>
          candidate === element || candidate.contains(element),
        );
        if (tracked) {
          changed.add(tracked);
        }
      }
    }
    changed.forEach(normalize);
  });

  for (const element of elements) {
    normalize(element);
    observer.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }
}

/** @param {typeof import("three")} three Three.js namespace. */
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

/** @param {import("three").Scene} scene @param {typeof import("three")} three */
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

/** @param {import("three").Scene} scene @returns {import("three").Group|null} */
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

/** @param {import("three").Scene} scene @returns {import("three").Mesh|null} */
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
 * Calculates the crown's camera-facing position on the launch ball.
 *
 * @param {number} radius Ball radius in world units.
 * @returns {[number, number, number]} Local sprite position.
 */
export function resolveBallCrownOffset(radius) {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("Ball radius must be a positive finite number.");
  }

  const surfaceRadius = radius + 0.006;
  return [
    0,
    surfaceRadius * Math.sin(INITIAL_CAMERA_ELEVATION_RADIANS),
    surfaceRadius * Math.cos(INITIAL_CAMERA_ELEVATION_RADIANS),
  ];
}

/** @param {import("three").Group} setter @param {typeof import("three")} three */
function addPinsetterBrand(setter, three) {
  const material = new three.MeshBasicMaterial({
    map: createPinsetterTexture(three),
    transparent: true,
    depthWrite: false,
  });
  const sign = new three.Mesh(new three.PlaneGeometry(4.02, 0.62), material);
  sign.name = "PumperellaPinsetterLogo";
  sign.position.set(0, -0.15, 2.176);
  sign.renderOrder = 8;
  setter.add(sign);

  loadOfficialLogo((image) => {
    const previous = material.map;
    material.map = createPinsetterTexture(three, image);
    material.needsUpdate = true;
    previous?.dispose();
  });
}

/** @param {import("three").Mesh} ball @param {typeof import("three")} three */
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
  const crownOffset = resolveBallCrownOffset(radius);
  emblem.name = "PumperellaOfficialBallCrown";
  emblem.scale.set(0.46, 0.31, 1);
  // The launch camera sits about 30 degrees above the ball. Put the crown on
  // that camera-facing normal so the initial view is frontal, not downward.
  emblem.position.set(...crownOffset);
  emblem.renderOrder = 9;
  ball.add(emblem);

  loadOfficialLogo((image) => {
    const previous = material.map;
    material.map = createBallCrownTexture(three, image);
    material.needsUpdate = true;
    previous?.dispose();
  });
}

/** @param {(image:HTMLImageElement)=>void} onLoad */
function loadOfficialLogo(onLoad) {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => onLoad(image);
  image.src = new URL("./assets/pumperella-logo.png", import.meta.url).href;
}

/** @param {typeof import("three")} three @param {CanvasImageSource|null} [logoImage=null] */
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
    drawOfficialEmblem(context, logoImage, 28, 14, 230, 196);
  } else {
    drawFallbackCrown(context, 143, 112, 0.72);
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "850 110px Inter, system-ui, sans-serif";
  context.lineJoin = "round";
  context.shadowColor = "#ff2f9c";
  context.shadowBlur = 18;
  context.strokeStyle = "#ffedf6";
  context.lineWidth = 12;
  context.strokeText("PUMPERELLA", 640, 99);
  context.shadowBlur = 0;
  context.fillStyle = "#ffffff";
  context.fillText("PUMPERELLA", 940, 113);

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

/** @param {typeof import("three")} three @param {CanvasImageSource|null} [logoImage=null] */
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
 * @param {CanvasRenderingContext2D} context
 * @param {CanvasImageSource} image
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
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
 * @param {CanvasRenderingContext2D} context
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} scale
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

/** @returns {Storage|null} Browser storage or null. */
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

/** @param {unknown} value @returns {string|null} */
function normalizePlayerName(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, MAX_PLAYER_NAME_LENGTH) : null;
}

/** @param {number} value @param {number} target @param {number} tolerance */
function approximately(value, target, tolerance) {
  return Number.isFinite(value) && Math.abs(value - target) <= tolerance;
}
