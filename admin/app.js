import {
  APPLICATION_TIME_ZONE,
  DEFAULT_DATES_PER_PLAYER,
  createInclusiveDatePool,
  drawDatesWithoutReplacement,
  formatApplicationDate,
  parseIsoDate,
} from "../src/domain/date-draw.js";
import {
  createSignedDrawToken,
  exportPrivateKeyJwk,
  exportPublicKeyJwk,
  generateDrawId,
  generateSigningKeyPair,
  importPrivateKeyJwk,
  importPublicKeyJwk,
} from "../src/security/draw-token.js";

const ARCHIVE_STORAGE_KEY = "ninepins.drawArchive.v2";
const LEGACY_ARCHIVE_STORAGE_KEY = "ninepins.drawArchive.v1";
const ARCHIVE_SCHEMA_VERSION = 2;
const LEGACY_ARCHIVE_SCHEMA_VERSION = 1;
const DATES_PER_PLAYER = DEFAULT_DATES_PER_PLAYER;
const KEY_SCHEMA_VERSION = 1;
const SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256";

const elements = {
  generateKey: document.querySelector("#generate-key"),
  privateKeyFile: document.querySelector("#private-key-file"),
  exportPrivateKey: document.querySelector("#export-private-key"),
  exportPublicKey: document.querySelector("#export-public-key"),
  keyStatus: document.querySelector("#key-status"),
  drawForm: document.querySelector("#draw-form"),
  players: document.querySelector("#players"),
  startDate: document.querySelector("#start-date"),
  endDate: document.querySelector("#end-date"),
  playerAppUrl: document.querySelector("#player-app-url"),
  drawButton: document.querySelector("#draw-button"),
  drawStatus: document.querySelector("#draw-status"),
  archiveFile: document.querySelector("#archive-file"),
  exportArchive: document.querySelector("#export-archive"),
  exportCsv: document.querySelector("#export-csv"),
  migrateLegacyArchive: document.querySelector("#migrate-legacy-archive"),
  resetArchive: document.querySelector("#reset-archive"),
  archiveStatus: document.querySelector("#archive-status"),
  resultsCard: document.querySelector("#results-card"),
  resultsBody: document.querySelector("#results-body"),
};

let privateKey = null;
let publicKey = null;
let archive = loadArchiveFromLocalStorage();
let legacyArchive = loadLegacyArchiveFromLocalStorage();

refreshArchiveStatus();
refreshArchiveButtons();

/** Generates a fresh local signing key pair. */
elements.generateKey.addEventListener("click", async () => {
  await runUiAction(elements.generateKey, elements.keyStatus, async () => {
    const keyPair = await generateSigningKeyPair();
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;
    refreshKeyButtons();
    setStatus(elements.keyStatus, "Neues ECDSA-P-256-Schlüsselpaar erzeugt. Privaten Schlüssel jetzt sicher exportieren.", "success");
  });
});

/** Imports a previously exported private signing-key bundle. */
elements.privateKeyFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) {
    return;
  }

  await runUiAction(null, elements.keyStatus, async () => {
    const bundle = JSON.parse(await file.text());
    const normalized = normalizePrivateKeyBundle(bundle);
    privateKey = await importPrivateKeyJwk(normalized.privateKey);
    publicKey = await importPublicKeyJwk(normalized.publicKey);
    refreshKeyButtons();
    setStatus(elements.keyStatus, `Signaturschlüssel aus ${file.name} geladen.`, "success");
  });
});

elements.exportPrivateKey.addEventListener("click", async () => {
  await runUiAction(elements.exportPrivateKey, elements.keyStatus, async () => {
    ensureSigningKeysLoaded();
    const [privateJwk, publicJwk] = await Promise.all([
      exportPrivateKeyJwk(privateKey),
      exportPublicKeyJwk(publicKey),
    ]);

    downloadJson("ninepins-private-signing-key.json", {
      schemaVersion: KEY_SCHEMA_VERSION,
      algorithm: SIGNATURE_ALGORITHM,
      privateKey: privateJwk,
      publicKey: publicJwk,
    });
    setStatus(elements.keyStatus, "Privater Schlüssel exportiert. Datei vertraulich aufbewahren.", "success");
  });
});

elements.exportPublicKey.addEventListener("click", async () => {
  await runUiAction(elements.exportPublicKey, elements.keyStatus, async () => {
    ensureSigningKeysLoaded();
    const publicJwk = await exportPublicKeyJwk(publicKey);
    downloadJson("ninepins-public-verification-key.json", {
      schemaVersion: KEY_SCHEMA_VERSION,
      algorithm: SIGNATURE_ALGORITHM,
      publicKey: publicJwk,
    });
    setStatus(elements.keyStatus, "Öffentlicher Verifikationsschlüssel exportiert.", "success");
  });
});

elements.drawForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  await runUiAction(elements.drawButton, elements.drawStatus, async () => {
    ensureSigningKeysLoaded();

    const players = parsePlayers(elements.players.value);
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;
    const playerAppBaseUrl = validatePlayerAppUrl(elements.playerAppUrl.value);
    const usedDates = getUsedDates(archive);
    validateDrawCapacity({ players, startDate, endDate, usedDates });

    const assignments = drawDatesWithoutReplacement({
      players,
      startDate,
      endDate,
      excludedDates: usedDates,
      datesPerPlayer: DATES_PER_PLAYER,
    });

    const batchId = generateDrawId();
    const createdAt = new Date().toISOString();
    const signedAssignments = [];

    for (const assignment of assignments) {
      const drawId = generateDrawId();
      const token = await createSignedDrawToken(
        {
          drawId,
          dates: assignment.dates,
          playerName: assignment.player,
        },
        privateKey,
      );
      const link = buildPlayerLink(playerAppBaseUrl, token);

      signedAssignments.push({
        drawId,
        player: assignment.player,
        dates: assignment.dates,
        token,
        link,
      });
    }

    const batch = {
      batchId,
      createdAt,
      timeZone: APPLICATION_TIME_ZONE,
      startDate,
      endDate,
      datesPerPlayer: DATES_PER_PLAYER,
      assignments: signedAssignments,
    };

    archive.draws.push(batch);
    persistArchive(archive);
    renderResults(signedAssignments);
    refreshArchiveStatus();
    refreshArchiveButtons();
    setStatus(
      elements.drawStatus,
      `${signedAssignments.length} persönliche Links mit je ${DATES_PER_PLAYER} Terminen erzeugt. Die verwendeten Termine sind im aktuellen Archiv gesperrt.`,
      "success",
    );
  });
});

elements.archiveFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) {
    return;
  }

  await runUiAction(null, elements.archiveStatus, async () => {
    const imported = normalizeArchiveForCurrentSchema(
      JSON.parse(await file.text()),
    );
    validateArchive(imported);
    archive = imported;
    persistArchive(archive);
    refreshArchiveStatus();
    refreshArchiveButtons();
    setStatus(elements.archiveStatus, `Archiv aus ${file.name} importiert.`, "success");
  });
});

elements.migrateLegacyArchive.addEventListener("click", async () => {
  await runUiAction(
    elements.migrateLegacyArchive,
    elements.archiveStatus,
    async () => {
      if (!legacyArchive) {
        throw new RangeError("Es wurde kein altes 3-Termine-Archiv gefunden.");
      }

      const normalizedLegacy = normalizeArchiveForCurrentSchema(legacyArchive);
      const existingBatchIds = new Set(archive.draws.map((draw) => draw.batchId));
      const migratedDraws = normalizedLegacy.draws.filter(
        (draw) => !existingBatchIds.has(draw.batchId),
      );
      const mergedArchive = {
        ...archive,
        draws: [...archive.draws, ...migratedDraws],
      };
      validateArchive(mergedArchive);
      archive = mergedArchive;
      persistArchive(archive);
      localStorage.removeItem(LEGACY_ARCHIVE_STORAGE_KEY);
      legacyArchive = null;
      refreshArchiveStatus();
      refreshArchiveButtons();
      setStatus(
        elements.archiveStatus,
        `${migratedDraws.length} alte Ziehung(en) übernommen. Deren Termine bleiben für neue Ziehungen gesperrt.`,
        "success",
      );
    },
  );
});

elements.resetArchive.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Das aktuelle 2-Termine-Archiv wirklich leeren? Bereits erzeugte Links bleiben gültig, ihre Termine werden für neue Ziehungen danach aber nicht mehr gesperrt.",
  );
  if (!confirmed) {
    return;
  }

  archive = createEmptyArchive();
  persistArchive(archive);
  elements.resultsBody.replaceChildren();
  elements.resultsCard.hidden = true;
  refreshArchiveStatus();
  refreshArchiveButtons();
  setStatus(elements.archiveStatus, "Aktuelles 2-Termine-Archiv wurde geleert.", "success");
});

elements.exportArchive.addEventListener("click", () => {
  try {
    validateArchive(archive);
    downloadJson("ninepins-draw-archive-v2.json", archive);
    setStatus(elements.archiveStatus, "JSON-Archiv exportiert.", "success");
  } catch (error) {
    setStatus(elements.archiveStatus, getErrorMessage(error), "error");
  }
});

elements.exportCsv.addEventListener("click", () => {
  try {
    validateArchive(archive);
    downloadText("ninepins-draw-archive-v2.csv", archiveToCsv(archive), "text/csv;charset=utf-8");
    setStatus(elements.archiveStatus, "CSV-Archiv exportiert.", "success");
  } catch (error) {
    setStatus(elements.archiveStatus, getErrorMessage(error), "error");
  }
});

/** @param {string} value @returns {string[]} */
function parsePlayers(value) {
  const players = value
    .split(/\r?\n/u)
    .map((player) => player.replace(/\s+/gu, " ").trim())
    .filter(Boolean);

  if (players.length === 0) {
    throw new RangeError("Mindestens ein Spieler ist erforderlich.");
  }

  if (new Set(players).size !== players.length) {
    throw new RangeError("Jeder Spielername darf nur einmal vorkommen.");
  }

  return players;
}

/** Reports range capacity before any random value is consumed. */
function validateDrawCapacity({ players, startDate, endDate, usedDates }) {
  const fullPool = createInclusiveDatePool(startDate, endDate);
  const fullPoolSet = new Set(fullPool);
  const usedInRange = new Set(
    usedDates.filter((date) => fullPoolSet.has(date)),
  );
  const freeDateCount = fullPool.length - usedInRange.size;
  const requiredDateCount = players.length * DATES_PER_PLAYER;

  if (freeDateCount < requiredDateCount) {
    throw new RangeError(
      `Der Zeitraum enthält ${fullPool.length} Kalendertage. ${usedInRange.size} davon sind im aktuellen Archiv gesperrt, ${freeDateCount} sind frei; benötigt werden ${requiredDateCount} eindeutige Termine (${players.length} × ${DATES_PER_PLAYER}).`,
    );
  }
}

/** @param {string} value @returns {URL} */
function validatePlayerAppUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new RangeError("Die Spieler-App URL ist ungültig.", { cause: error });
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RangeError("Die Spieler-App URL muss HTTP oder HTTPS verwenden.");
  }

  url.hash = "";
  return url;
}

/** @param {URL} baseUrl @param {string} token @returns {string} */
function buildPlayerLink(baseUrl, token) {
  const url = new URL(baseUrl.href);
  url.hash = token;
  return url.href;
}

/** @param {object} candidateArchive @returns {string[]} */
function getUsedDates(candidateArchive) {
  validateArchive(candidateArchive);
  return [...new Set(
    candidateArchive.draws.flatMap((draw) =>
      draw.assignments.flatMap((assignment) => assignment.dates),
    ),
  )];
}

/** Loads the current archive defensively. */
function loadArchiveFromLocalStorage() {
  const emptyArchive = createEmptyArchive();
  const serialized = localStorage.getItem(ARCHIVE_STORAGE_KEY);
  if (!serialized) {
    return emptyArchive;
  }

  try {
    const parsed = JSON.parse(serialized);
    validateArchive(parsed);
    return parsed;
  } catch {
    return emptyArchive;
  }
}

/** Detects the previous three-date archive without silently applying it. */
function loadLegacyArchiveFromLocalStorage() {
  const serialized = localStorage.getItem(LEGACY_ARCHIVE_STORAGE_KEY);
  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    validateLegacyArchive(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function createEmptyArchive() {
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    timeZone: APPLICATION_TIME_ZONE,
    draws: [],
  };
}

function persistArchive(candidateArchive) {
  validateArchive(candidateArchive);
  localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(candidateArchive));
}

/** Converts a compatible version-1 archive into the current version-2 shape. */
function normalizeArchiveForCurrentSchema(candidateArchive) {
  if (candidateArchive?.schemaVersion === ARCHIVE_SCHEMA_VERSION) {
    validateArchive(candidateArchive);
    return candidateArchive;
  }

  validateLegacyArchive(candidateArchive);
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    timeZone: APPLICATION_TIME_ZONE,
    draws: candidateArchive.draws.map((draw) => ({
      ...draw,
      datesPerPlayer: 3,
      assignments: draw.assignments.map((assignment) => ({
        ...assignment,
        dates: [...assignment.dates],
      })),
    })),
  };
}

/** Validates all current archive data that can influence exclusions. */
function validateArchive(candidateArchive) {
  if (
    !candidateArchive ||
    candidateArchive.schemaVersion !== ARCHIVE_SCHEMA_VERSION ||
    candidateArchive.timeZone !== APPLICATION_TIME_ZONE ||
    !Array.isArray(candidateArchive.draws)
  ) {
    throw new RangeError("Das Ziehungsarchiv hat ein unbekanntes oder ungültiges Format.");
  }

  validateArchiveDraws(candidateArchive.draws, true);
}

function validateLegacyArchive(candidateArchive) {
  if (
    !candidateArchive ||
    candidateArchive.schemaVersion !== LEGACY_ARCHIVE_SCHEMA_VERSION ||
    candidateArchive.timeZone !== APPLICATION_TIME_ZONE ||
    !Array.isArray(candidateArchive.draws)
  ) {
    throw new RangeError("Das alte Ziehungsarchiv hat ein unbekanntes oder ungültiges Format.");
  }

  validateArchiveDraws(candidateArchive.draws, false);
}

function validateArchiveDraws(draws, requireDateCount) {
  const globallyUsedDates = new Set();

  for (const draw of draws) {
    const datesPerPlayer = requireDateCount ? draw?.datesPerPlayer : 3;
    if (
      typeof draw?.batchId !== "string" ||
      typeof draw?.createdAt !== "string" ||
      draw.timeZone !== APPLICATION_TIME_ZONE ||
      typeof draw.startDate !== "string" ||
      typeof draw.endDate !== "string" ||
      ![2, 3].includes(datesPerPlayer) ||
      !Array.isArray(draw.assignments)
    ) {
      throw new RangeError("Das Ziehungsarchiv enthält einen ungültigen Ziehungssatz.");
    }

    parseIsoDate(draw.startDate);
    parseIsoDate(draw.endDate);

    for (const assignment of draw.assignments) {
      if (
        typeof assignment?.drawId !== "string" ||
        typeof assignment?.player !== "string" ||
        !Array.isArray(assignment.dates) ||
        assignment.dates.length !== datesPerPlayer ||
        typeof assignment.token !== "string" ||
        typeof assignment.link !== "string"
      ) {
        throw new RangeError("Das Ziehungsarchiv enthält eine ungültige Spielerzuordnung.");
      }

      for (const date of assignment.dates) {
        parseIsoDate(date);
        if (globallyUsedDates.has(date)) {
          throw new RangeError(`Das Ziehungsarchiv vergibt den Termin ${date} mehrfach.`);
        }
        globallyUsedDates.add(date);
      }
    }
  }
}

/** @param {unknown} bundle */
function normalizePrivateKeyBundle(bundle) {
  const privateJwk = bundle?.privateKey ?? bundle;
  if (
    privateJwk?.kty !== "EC" ||
    privateJwk?.crv !== "P-256" ||
    typeof privateJwk.d !== "string" ||
    typeof privateJwk.x !== "string" ||
    typeof privateJwk.y !== "string"
  ) {
    throw new RangeError("Die Datei enthält keinen gültigen privaten P-256-Schlüssel.");
  }

  const publicJwk = bundle?.publicKey ?? {
    kty: "EC",
    crv: "P-256",
    x: privateJwk.x,
    y: privateJwk.y,
    ext: true,
    key_ops: ["verify"],
  };

  return { privateKey: privateJwk, publicKey: publicJwk };
}

function ensureSigningKeysLoaded() {
  if (!privateKey || !publicKey) {
    throw new Error("Vor der Ziehung muss ein Signaturschlüssel erzeugt oder importiert werden.");
  }
}

function refreshKeyButtons() {
  const available = Boolean(privateKey && publicKey);
  elements.exportPrivateKey.disabled = !available;
  elements.exportPublicKey.disabled = !available;
}

function refreshArchiveButtons() {
  elements.migrateLegacyArchive.disabled = !legacyArchive;
  elements.resetArchive.disabled = archive.draws.length === 0;
}

function refreshArchiveStatus() {
  const assignmentCount = archive.draws.reduce(
    (total, draw) => total + draw.assignments.length,
    0,
  );
  const dateCount = getUsedDates(archive).length;

  if (assignmentCount === 0 && legacyArchive) {
    setStatus(
      elements.archiveStatus,
      "Das neue 2-Termine-Archiv ist leer. Ein altes 3-Termine-Archiv wurde erkannt, blockiert die neue Ziehung aber nicht automatisch. Übernimm es nur, wenn dessen Termine weiterhin gesperrt bleiben sollen.",
      "warning",
    );
    return;
  }

  setStatus(
    elements.archiveStatus,
    assignmentCount === 0
      ? "Noch keine Ziehungen im aktuellen 2-Termine-Archiv."
      : `${archive.draws.length} Ziehung(en), ${assignmentCount} Spielerzuordnung(en), ${dateCount} dauerhaft gesperrte Termine.`,
  );
}

function renderResults(assignments) {
  elements.resultsBody.replaceChildren();

  for (const assignment of assignments) {
    const row = document.createElement("tr");
    const playerCell = document.createElement("td");
    const datesCell = document.createElement("td");
    const linkCell = document.createElement("td");
    const linkActions = document.createElement("div");
    const linkInput = document.createElement("input");
    const copyButton = document.createElement("button");

    playerCell.textContent = assignment.player;
    datesCell.className = "dates";
    datesCell.textContent = assignment.dates.map(formatApplicationDate).join(" · ");

    linkActions.className = "link-actions";
    linkInput.type = "text";
    linkInput.readOnly = true;
    linkInput.value = assignment.link;
    linkInput.setAttribute("aria-label", `Persönlicher Link für ${assignment.player}`);

    copyButton.type = "button";
    copyButton.className = "secondary";
    copyButton.textContent = "Kopieren";
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(assignment.link);
      copyButton.textContent = "Kopiert";
      window.setTimeout(() => {
        copyButton.textContent = "Kopieren";
      }, 1500);
    });

    linkActions.append(linkInput, copyButton);
    linkCell.append(linkActions);
    row.append(playerCell, datesCell, linkCell);
    elements.resultsBody.append(row);
  }

  elements.resultsCard.hidden = false;
}

function archiveToCsv(candidateArchive) {
  const rows = [[
    "batch_id",
    "draw_id",
    "created_at",
    "player",
    "dates_per_player",
    "date_1",
    "date_2",
    "date_3",
    "token",
    "link",
  ]];

  for (const draw of candidateArchive.draws) {
    for (const assignment of draw.assignments) {
      const [date1 = "", date2 = "", date3 = ""] = assignment.dates;
      rows.push([
        draw.batchId,
        assignment.drawId,
        draw.createdAt,
        assignment.player,
        draw.datesPerPlayer,
        date1,
        date2,
        date3,
        assignment.token,
        assignment.link,
      ]);
    }
  }

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadJson(filename, value) {
  downloadText(filename, `${JSON.stringify(value, null, 2)}\n`, "application/json;charset=utf-8");
}

function downloadText(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function runUiAction(button, statusElement, action) {
  const originalDisabled = button?.disabled ?? false;
  if (button) {
    button.disabled = true;
  }

  try {
    setStatus(statusElement, "Arbeite …");
    await action();
  } catch (error) {
    setStatus(statusElement, getErrorMessage(error), "error");
  } finally {
    if (button) {
      button.disabled = originalDisabled;
    }
    refreshArchiveButtons();
  }
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status${kind ? ` ${kind}` : ""}`;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
