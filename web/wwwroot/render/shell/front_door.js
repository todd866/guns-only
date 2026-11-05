import {
  classifyDirectorBlob,
  readDirectorBlob,
} from "../progression/difficulty_ramp_persist.js";
import {
  F22_PERSONAL_BEST_KEY_PREFIX,
  f22PersonalBestKey,
} from "../debrief/f22_result_instrument.js";

export const FRONT_DOOR_VARIANTS = Object.freeze(["a", "b", "c"]);
export const FRONT_DOOR_CLASSES = Object.freeze(
  FRONT_DOOR_VARIANTS.map((name) => `front-door-${name}`),
);

/** Guns Only Fly mission — personal-best key suffix. */
export const F22_FIRST_MERGE_MISSION =
  "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1";

/**
 * Parse `?frontDoor=<name>` from a Location, URL, or query/href string.
 * Returns `"a" | "b" | "c"`, or `null` when absent/invalid.
 */
export function resolveFrontDoor(locationLike = globalThis.location) {
  try {
    const raw = typeof locationLike === "string"
      ? locationLike
      : locationLike?.href || locationLike?.search || "";
    if (!raw) return null;
    const url = new URL(raw, "https://guns-only.local/");
    const candidate = (url.searchParams.get("frontDoor") || "").trim().toLowerCase();
    return FRONT_DOOR_VARIANTS.includes(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Synchronise the `front-door-<name>` class on `root` (typically `document.documentElement`).
 * Without a valid query and with no prior variant class on `root`, no DOM mutation is performed.
 */
export function applyFrontDoor(
  root = globalThis.document?.documentElement,
  locationLike = globalThis.location,
) {
  const variant = resolveFrontDoor(locationLike);
  const chosenClass = variant ? `front-door-${variant}` : null;
  const classList = root?.classList;
  if (!classList) return variant;
  const hasContains = typeof classList.contains === "function";
  for (const className of FRONT_DOOR_CLASSES) {
    if (className !== chosenClass && (!hasContains || classList.contains(className))) {
      classList.remove?.(className);
    }
  }
  if (chosenClass && (!hasContains || !classList.contains(chosenClass))) {
    classList.add?.(chosenClass);
  }
  return variant;
}

export function readDirectorWinStreak(blob) {
  const text = String(blob ?? "").trim();
  if (!text) return 0;
  const classified = classifyDirectorBlob(text);
  if (classified.kind !== "v2" && classified.kind !== "v3") return 0;
  const streak = Number(text.split("|")[7]);
  return Number.isInteger(streak) && streak >= 0 ? streak : 0;
}

function readStoredPersonalBest(storage, missionId = F22_FIRST_MERGE_MISSION) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    const state = { mission_definition_id: missionId };
    const raw = storage.getItem(f22PersonalBestKey(state))
      ?? storage.getItem(F22_PERSONAL_BEST_KEY_PREFIX);
    if (raw === null || raw === undefined || raw === "") return null;
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct >= 0) return Math.trunc(direct);
    const parsed = JSON.parse(raw);
    const candidate = Number(parsed?.[missionId] ?? parsed?.best ?? parsed?.score);
    return Number.isFinite(candidate) && candidate >= 0 ? Math.trunc(candidate) : null;
  } catch {
    return null;
  }
}

/** Returning-player readings for the front-door strip (rung 0..3, win streak, PB score). */
export function readFrontDoorReturningPlayer(storage) {
  const blob = readDirectorBlob(storage);
  const { rung } = classifyDirectorBlob(blob);
  return Object.freeze({
    rung: Number.isInteger(rung) && rung >= 0 && rung <= 3 ? rung : 0,
    streak: readDirectorWinStreak(blob),
    personalBest: readStoredPersonalBest(storage),
  });
}

const RETURNING_ID = "front-door-returning";
const MORE_ID = "front-door-more";

function ensureFrontDoorChrome(doc, variant) {
  if (!variant || !doc) return null;
  const readyScreen = doc.getElementById("ready-screen");
  const f22Option = doc.querySelector('.sortie-option .sortie-choice[data-aircraft="f22"]')
    ?.closest(".sortie-option");
  if (!readyScreen || !f22Option) return null;

  let strip = doc.getElementById(RETURNING_ID);
  if (!strip) {
    strip = doc.createElement("div");
    strip.id = RETURNING_ID;
    strip.className = "front-door-returning f22-result";
    strip.setAttribute("aria-label", "Your Guns Only progress");
    const row = (tag, valueClass, datumHtml) => {
      const el = doc.createElement("div");
      el.className = `f22-row front-door-row-${tag.toLowerCase()}`;
      const tagEl = doc.createElement("span");
      tagEl.className = "f22-tag";
      tagEl.setAttribute("aria-hidden", "true");
      tagEl.textContent = tag;
      const valueEl = doc.createElement("span");
      valueEl.className = `f22-value ${valueClass}`;
      const datumEl = doc.createElement("span");
      datumEl.className = "f22-datum";
      datumEl.innerHTML = datumHtml;
      el.append(tagEl, valueEl, datumEl);
      return el;
    };
    strip.append(
      row("RUNG", "front-door-rung-pips", '<span class="f22-tag" aria-hidden="true">of 3</span><span class="front-door-rung-num"></span>'),
      row("STRK", "front-door-streak-num", '<span class="f22-tag" aria-hidden="true">win streak</span>'),
      row("PB", "front-door-pb-num", '<span class="f22-tag" aria-hidden="true">best score</span>'),
    );
    strip.querySelector(".front-door-rung-pips")?.setAttribute("role", "img");
    strip.querySelector(".front-door-rung-pips")?.setAttribute("aria-hidden", "true");
    f22Option.append(strip);
  }

  let more = doc.getElementById(MORE_ID);
  if (!more) {
    more = doc.createElement("details");
    more.id = MORE_ID;
    more.className = "front-door-more";
    const summary = doc.createElement("summary");
    summary.textContent = "More";
    summary.setAttribute("aria-label", "More aircraft and missions");
    more.append(summary);
    const panel = doc.createElement("div");
    panel.className = "front-door-more-panel ready-mission-groups";
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "More missions");
    more.append(panel);
    const groups = readyScreen.querySelector(".ready-mission-groups");
    groups?.insertAdjacentElement("afterend", more);
  }

  readyScreen.dataset.frontDoorVariant = variant;
  return { strip, more, f22Option };
}

function moveMoreCandidates(doc, morePanel) {
  if (!morePanel) return;
  const selectors = [
    '.sortie-option .sortie-choice[data-aircraft="cobra"]',
    '.sortie-option .sortie-choice[data-aircraft="rapier"]',
    '.sortie-option .sortie-choice[data-aircraft="f14"]',
    '.sortie-option .sortie-choice[data-aircraft="fireboss"]',
  ];
  for (const sel of selectors) {
    const option = doc.querySelector(sel)?.closest(".sortie-option");
    if (option && option.parentElement !== morePanel) {
      option.hidden = false;
      morePanel.append(option);
    }
  }
}

function restoreMoreCandidates(doc) {
  const morePanel = doc.getElementById(MORE_ID)?.querySelector(".front-door-more-panel");
  const home = doc.querySelector("#ready-selector > .ready-mission-groups");
  if (!morePanel || !home) return;
  while (morePanel.firstElementChild) {
    home.append(morePanel.firstElementChild);
  }
}

function removeFrontDoorChrome(doc) {
  doc.getElementById(RETURNING_ID)?.remove();
  const groups = doc.querySelector("#ready-selector > .ready-mission-groups");
  const rcOption = doc.querySelector('.sortie-option .sortie-choice[data-aircraft="rc"]')
    ?.closest(".sortie-option");
  if (rcOption && groups && rcOption.parentElement !== groups) groups.append(rcOption);
  const more = doc.getElementById(MORE_ID);
  const underRow = doc.querySelector(".front-door-under-row");
  if (underRow) {
    if (more?.parentElement === underRow && groups?.parentElement) {
      groups.insertAdjacentElement("afterend", more);
    }
    underRow.remove();
  }
  if (more) {
    restoreMoreCandidates(doc);
    if (groups?.parentElement) groups.insertAdjacentElement("afterend", more);
    more.remove();
  }
  doc.getElementById("ready-screen")?.removeAttribute("data-front-door-variant");
}

function paintRungPips(container, rung) {
  const doc = container?.ownerDocument ?? globalThis.document;
  container.replaceChildren();
  for (let i = 0; i < 4; i += 1) {
    const pip = doc.createElement("span");
    pip.className = "front-door-pip";
    pip.setAttribute("aria-hidden", "true");
    if (i <= rung) pip.dataset.filled = "true";
    container.append(pip);
  }
}

function syncVariantLayout(doc, variant, chrome) {
  const groups = doc.querySelector("#ready-selector > .ready-mission-groups");
  const rcOption = doc.querySelector('.sortie-option .sortie-choice[data-aircraft="rc"]')
    ?.closest(".sortie-option");
  let underRow = doc.querySelector(".front-door-under-row");
  if (variant === "b") {
    if (!underRow && groups?.parentElement) {
      underRow = doc.createElement("div");
      underRow.className = "front-door-under-row";
      groups.insertAdjacentElement("afterend", underRow);
    }
    if (underRow && rcOption?.parentElement !== underRow) underRow.prepend(rcOption);
    if (underRow && chrome.more.parentElement !== underRow) underRow.append(chrome.more);
  } else {
    if (rcOption && groups && rcOption.parentElement !== groups) groups.append(rcOption);
    if (underRow) {
      if (chrome.more.parentElement === underRow) groups?.insertAdjacentElement("afterend", chrome.more);
      underRow.remove();
    } else if (chrome.more.parentElement !== groups?.parentElement) {
      groups?.insertAdjacentElement("afterend", chrome.more);
    }
  }
}

/**
 * Mount variant chrome and paint returning-player instruments. No-op without `?frontDoor=`.
 */
// syncFrontDoor runs from renderCampaignProgress on every frame. With no variant chosen the
// teardown path re-homed the RC card into the mission groups each call, a DOM move per frame
// that the menu backdrop's observer answered with a repaint per frame (Build 439 CI: one
// animation frame per four seconds). Tear down only when chrome was actually mounted.
let frontDoorMounted = false;

export function syncFrontDoor(doc = globalThis.document, locationLike = globalThis.location, storage) {
  const variant = resolveFrontDoor(locationLike);
  if (!variant) {
    if (frontDoorMounted) {
      removeFrontDoorChrome(doc);
      frontDoorMounted = false;
    }
    return null;
  }
  const chrome = ensureFrontDoorChrome(doc, variant);
  if (!chrome) return variant;
  frontDoorMounted = true;
  moveMoreCandidates(doc, chrome.more.querySelector(".front-door-more-panel"));
  syncVariantLayout(doc, variant, chrome);

  let store = storage;
  if (store === undefined) {
    try { store = globalThis.localStorage; } catch { store = null; }
  }
  const stats = readFrontDoorReturningPlayer(store);
  const strip = chrome.strip;
  paintRungPips(strip.querySelector(".front-door-rung-pips"), stats.rung);
  const rungNum = strip.querySelector(".front-door-rung-num");
  if (rungNum) rungNum.textContent = String(stats.rung);
  const streakNum = strip.querySelector(".front-door-streak-num");
  if (streakNum) streakNum.textContent = String(stats.streak);
  const pbNum = strip.querySelector(".front-door-pb-num");
  if (pbNum) pbNum.textContent = stats.personalBest === null ? "—" : String(stats.personalBest);

  strip.querySelector(".front-door-row-rung")?.setAttribute(
    "title",
    `Difficulty rung ${stats.rung} of 3`,
  );
  strip.querySelector(".front-door-row-streak")?.setAttribute(
    "title",
    `${stats.streak} consecutive Gun Only wins`,
  );
  strip.querySelector(".front-door-row-pb")?.setAttribute(
    "title",
    stats.personalBest === null ? "No personal best yet" : `Personal best ${stats.personalBest}`,
  );

  return variant;
}
