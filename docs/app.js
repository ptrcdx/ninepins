import { importVerificationKey, verifyDrawToken } from "./token.js";

const APPLICATION_TIME_ZONE = "Europe/Berlin";
const DATE_COUNT = 3;
const THROW_ANIMATION_MILLISECONDS = 900;

const elements = {
  status: document.querySelector("#status"),
  lane: document.querySelector(".lane"),
  ball: document.querySelector("#ball"),
  throwButton: document.querySelector("#throw-button"),
  throwCounter: document.querySelector("#throw-counter"),
  dateFields: [
    document.querySelector("#date-1"),
    document.querySelector("#date-2"),
    document.querySelector("#date-3"),
  ],
};

let verifiedDraw = null;
let revealedCount = 0;
let throwing = false;

initialize();

async function initialize() {
  try {
    const token = window.location.hash.slice(1);
    if (!token) {
      throw new RangeError("Dieser Link enthält keinen persönlichen Spielcode.");
    }

    const keyBundle = await loadVerificationKey();
    const publicKey = await importVerificationKey(keyBundle.publicKey);
    verifiedDraw = await verifyDrawToken(token, publicKey);

    elements.throwButton.disabled = false;
    setStatus("Link geprüft. Du kannst die erste Kugel werfen.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

elements.throwButton.addEventListener("click", async () => {
  if (!verifiedDraw || throwing || revealedCount >= DATE_COUNT) {
    return;
  }

  throwing = true;
  elements.throwButton.disabled = true;
  elements.ball.classList.remove("throwing");
  elements.lane.classList.remove("hit");
  void elements.ball.offsetWidth;
  elements.ball.classList.add("throwing");

  await delay(THROW_ANIMATION_MILLISECONDS * 0.72);
  elements.lane.classList.add("hit");

  await delay(THROW_ANIMATION_MILLISECONDS * 0.28);
  revealNextDate();
  elements.ball.classList.remove("throwing");

  await delay(250);
  elements.lane.classList.remove("hit");
  throwing = false;

  if (revealedCount < DATE_COUNT) {
    elements.throwButton.disabled = false;
    setStatus(`Termin ${revealedCount} von ${DATE_COUNT} enthüllt. Nächste Kugel bereit.`, "success");
  } else {
    elements.throwButton.textContent = "Alle Termine enthüllt";
    setStatus("Alle drei Termine sind enthüllt.", "success");
  }
});

function revealNextDate() {
  const index = revealedCount;
  const dateField = elements.dateFields[index];
  const card = dateField.closest(".date-card");

  dateField.textContent = formatBerlinDate(verifiedDraw.dates[index]);
  card.classList.add("revealed");
  revealedCount += 1;
  elements.throwCounter.textContent = `Wurf ${revealedCount} von ${DATE_COUNT}`;
}

async function loadVerificationKey() {
  const response = await fetch("./verification-key.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Der öffentliche Verifikationsschlüssel konnte nicht geladen werden.");
  }

  const bundle = await response.json();
  if (
    bundle?.schemaVersion !== 1 ||
    bundle?.algorithm !== "ECDSA-P256-SHA256" ||
    !bundle.publicKey
  ) {
    throw new Error("Der öffentliche Verifikationsschlüssel ist noch nicht eingerichtet.");
  }

  return bundle;
}

function formatBerlinDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const canonicalUtc = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: APPLICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(canonicalUtc);
}

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = `status${kind ? ` ${kind}` : ""}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
