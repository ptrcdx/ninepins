const THREE_MODULE_URL = "./vendor/three/three.module.js";
const SCENE_HOOK_KEY = Symbol.for("pumperella.playerExperience.sceneHook.v9");
const SCENE_PENDING_KEY = "pumperellaPlayerExperiencePendingV9";
const SETTER_BRAND_KEY = "pumperellaPinsetterBrandV9";
const BALL_BRAND_KEY = "pumperellaBallBrandV9";
const STYLE_ID = "pumperella-player-experience-style-v9";
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

        /* One shallow HUD surface on mobile. The lower row is arranged
           horizontally as dates, current player and status to preserve the
           complete information set while keeping the alley visible. */
        body.pumperella-two-date-draw .top {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(58px, .38fr) minmax(78px, .50fr);
          grid-template-rows: auto auto;
          align-items: stretch;
          gap: 0 8px;
          width: 100%;
          padding: 8px 10px 9px;
          overflow: hidden;
          border: 1px solid rgba(255,80,165,.72);
          border-radius: 18px;
          background: var(--panel-strong);
          box-shadow: var(--shadow-strong);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        body.pumperella-two-date-draw .left-stack,
        body.pumperella-two-date-draw .right-stack {
          display: contents;
        }

        body.pumperella-two-date-draw .brand,
        body.pumperella-two-date-draw .dates,
        body.pumperella-two-date-draw .status {
          min-width: 0;
          max-width: none;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        body.pumperella-two-date-draw .brand {
          display: flex;
          grid-column: 1 / -1;
          grid-row: 1;
          align-items: center;
          width: 100%;
          min-height: 42px;
          padding: 0 0 7px;
          gap: 8px;
          border-bottom: 1px solid rgba(255,255,255,.10);
        }

        body.pumperella-two-date-draw .brand-logo {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
        }

        body.pumperella-two-date-draw .brand-copy {
          gap: 1px;
          min-width: 0;
        }

        body.pumperella-two-date-draw .brand-title {
          font-size: 17px;
          line-height: 1;
        }

        body.pumperella-two-date-draw .version {
          font-size: 8px;
          letter-spacing: .15em;
        }

        body.pumperella-two-date-draw .dates {
          display: grid;
          grid-column: 1 / 3;
          grid-row: 2;
          grid-template-columns: minmax(0, 1fr) minmax(58px, .38fr);
          grid-template-rows: auto auto;
          column-gap: 8px;
          row-gap: 7px;
          width: 100%;
          padding: 8px 0 0;
        }

        body.pumperella-two-date-draw .dates .card-heading {
          grid-column: 1;
          grid-row: 1;
          gap: 6px;
          margin: 0;
        }

        body.pumperella-two-date-draw .dates .icon-badge {
          width: 23px;
          height: 23px;
          border-radius: 7px;
        }

        body.pumperella-two-date-draw .dates .icon-badge svg {
          width: 14px;
          height: 14px;
        }

        body.pumperella-two-date-draw .dates .card-heading small {
          font-size: 9px;
          letter-spacing: .10em;
        }

        body.pumperella-two-date-draw .dates .pumperella-player-inline {
          display: flex;
          grid-column: 2;
          grid-row: 1 / 3;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 4px;
          margin: 0;
          padding: 6px 0 0 8px;
          border: 0;
          border-left: 1px solid rgba(255,255,255,.10);
          border-radius: 0;
          background: none;
        }

        body.pumperella-two-date-draw .dates .pumperella-player-inline small {
          font-size: 7.5px;
          line-height: 1.1;
          letter-spacing: .07em;
        }

        body.pumperella-two-date-draw .dates .pumperella-player-inline strong {
          max-width: 100%;
          margin: 0;
          font-size: 13px;
          line-height: 1.1;
          text-align: left;
        }

        body.pumperella-two-date-draw .dates ol {
          grid-column: 1;
          grid-row: 2;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 5px;
        }

        body.pumperella-two-date-draw .dates li {
          display: block;
          min-width: 0;
          padding: 6px 4px;
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
          font-size: clamp(10px, 3.05vw, 12px);
          font-variant-numeric: tabular-nums;
          letter-spacing: -.015em;
          line-height: 1.2;
          text-overflow: clip;
          white-space: nowrap;
        }

        /* The full desktop placeholder is too wide for the compact mobile
           chips. Keep the semantic DOM text unchanged and shorten only its
           visual mobile representation. */
        body.pumperella-two-date-draw .dates li.pending strong {
          font-size: 0;
        }

        body.pumperella-two-date-draw .dates li.pending strong::after {
          content: "Verdeckt";
          font-size: clamp(10px, 3.05vw, 12px);
          letter-spacing: -.015em;
          line-height: 1.2;
        }

        body.pumperella-two-date-draw .status {
          grid-column: 3;
          grid-row: 2;
          align-self: stretch;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          width: auto;
          min-width: 0;
          max-width: none;
          margin-top: 8px;
          padding: 6px 0 0 8px;
          border-left: 1px solid rgba(255,255,255,.10);
          text-align: right;
        }

        body.pumperella-two-date-draw .status small {
          font-size: 7.5px;
          letter-spacing: .07em;
        }

        body.pumperella-two-date-draw .status strong {
          margin-top: 4px;
          font-size: 13.5px;
          line-height: 1.08;
        }

        /* Result feedback must never sit on top of the static HUD panel.
           On mobile it becomes lightweight floating text below that panel. */
        body.pumperella-two-date-draw .result {
          top: max(176px, calc(env(safe-area-inset-top) + 166px));
          min-width: 0;
          max-width: calc(100vw - 32px);
          padding: 7px 12px;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          text-shadow: 0 2px 8px rgba(0,0,0,.9);
        }

        body.pumperella-two-date-draw .result small {
          font-size: 9px;
          opacity: .72;
        }

        body.pumperella-two-date-draw .result strong {
          margin-top: 2px;
          font-size: 21px;
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
          grid-template-columns: minmax(0, 1fr) minmax(52px, .34fr) minmax(72px, .47fr);
          gap: 0 6px;
          padding: 7px 8px 8px;
        }
        body.pumperella-two-date-draw .brand {
          min-height: 39px;
          padding-bottom: 6px;
        }
        body.pumperella-two-date-draw .brand-logo {
          width: 33px;
          height: 33px;
          flex-basis: 33px;
        }
        body.pumperella-two-date-draw .brand-title {
          font-size: 16px;
        }
        body.pumperella-two-date-draw .dates {
          grid-template-columns: minmax(0, 1fr) minmax(52px, .34fr);
          column-gap: 6px;
          row-gap: 6px;
          padding-top: 7px;
        }
        body.pumperella-two-date-draw .dates .pumperella-player-inline {
          padding-left: 6px;
        }
        body.pumperella-two-date-draw .dates .pumperella-player-inline strong {
          font-size: 11.5px;
        }
        body.pumperella-two-date-draw .dates ol {
          gap: 4px;
        }
        body.pumperella-two-date-draw .dates li {
          padding: 5px 2px;
        }
        body.pumperella-two-date-draw .dates li strong,
        body.pumperella-two-date-draw .dates li.pending strong::after {
          font-size: clamp(9.5px, 3vw, 10.5px);
          letter-spacing: -.025em;
        }
        body.pumperella-two-date-draw .status {
          margin-top: 7px;
          padding-left: 6px;
        }
        body.pumperella-two-date-draw .status strong {
          font-size: 12.5px;
        }
        body.pumperella-two-date-draw .result {
          top: max(164px, calc(env(safe-area-inset-top) + 154px));
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
    alphaTest: 0.02,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });
  // Put the branding on the lower front housing instead of the upper lip.
  // This keeps the top edge mechanically clean and makes the logo read as a
  // printed mark on the pinsetter body rather than a floating sign.
  const sign = new three.Mesh(new three.PlaneGeometry(3.72, 0.52), material);
  sign.name = "PumperellaPinsetterLogo";
  sign.position.set(0, -0.82, 2.145);
  sign.renderOrder = 100;
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
    if (child.isSprite || child.name === "PumperellaOfficialBallCrown") {
      child.visible = false;
    }
  }

  const radius = ball.geometry?.parameters?.radius ?? 0.33;
  const crownOffset = resolveBallCrownOffset(radius);
  const normal = new three.Vector3(...crownOffset).normalize();

  // Use a real plane tangent to the sphere instead of a Sprite. A Sprite always
  // faces the camera and therefore looked like a loose sticker. This mesh keeps
  // its orientation relative to the ball and rotates naturally with it.
  const geometry = new three.PlaneGeometry(0.32, 0.17);
  const material = new three.MeshBasicMaterial({
    map: createBallPrintTexture(three),
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
    side: three.DoubleSide,
  });
  const emblem = new three.Mesh(geometry, material);

  emblem.name = "PumperellaOfficialBallCrown";
  emblem.position.copy(normal).multiplyScalar(radius + 0.0035);
  emblem.quaternion.setFromUnitVectors(
    new three.Vector3(0, 0, 1),
    normal,
  );
  emblem.renderOrder = 10;
  ball.add(emblem);
}

/** @param {typeof import("three")} three */
function createBallPrintTexture(three) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  // Deliberately draw only the crown mark. The official source logo contains
  // a pink ball in the middle, which read as a hole when placed on a pink ball.
  context.strokeStyle = "rgba(255,247,251,.98)";
  context.fillStyle = "rgba(255,247,251,.98)";
  context.lineWidth = 15;
  context.lineJoin = "round";
  context.lineCap = "round";

  const crown = [
    [80, 166],
    [128, 96],
    [196, 146],
    [256, 68],
    [316, 146],
    [384, 96],
    [432, 166],
  ];

  context.beginPath();
  crown.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  context.beginPath();
  context.moveTo(104, 166);
  context.quadraticCurveTo(256, 214, 408, 166);
  context.stroke();

  for (const [x, y, r] of [
    [128, 96, 11],
    [256, 68, 13],
    [384, 96, 11],
  ]) {
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
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
  canvas.width = 1536;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Center emblem and wordmark as one visual unit. Previously the emblem was
  // pinned to the left while the text was centered independently, so the
  // combined branding looked shifted to the right.
  const text = "PUMPERELLA";
  const emblemWidth = 220;
  const emblemHeight = 180;
  const gap = 38;
  const horizontalPadding = 48;
  let fontSize = 126;

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.lineJoin = "round";

  const availableWidth = canvas.width - horizontalPadding * 2;
  while (fontSize > 72) {
    context.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;
    const width = emblemWidth + gap + context.measureText(text).width;
    if (width <= availableWidth) {
      break;
    }
    fontSize -= 2;
  }

  context.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;
  const textWidth = context.measureText(text).width;
  const groupWidth = emblemWidth + gap + textWidth;
  const groupStartX = (canvas.width - groupWidth) / 2;
  const emblemX = groupStartX;
  const emblemY = (canvas.height - emblemHeight) / 2;
  const textX = groupStartX + emblemWidth + gap;
  const textY = canvas.height / 2 + 2;

  if (logoImage) {
    drawOfficialEmblem(
      context,
      logoImage,
      emblemX,
      emblemY,
      emblemWidth,
      emblemHeight,
    );
  } else {
    drawFallbackCrown(
      context,
      emblemX + emblemWidth / 2,
      canvas.height / 2,
      0.72,
    );
  }

  context.strokeStyle = "rgba(255,237,246,.96)";
  context.lineWidth = 3;
  context.strokeText(text, textX, textY);
  context.fillStyle = "#ffffff";
  context.fillText(text, textX, textY);

  const texture = new three.CanvasTexture(canvas);
  texture.colorSpace = three.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
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
