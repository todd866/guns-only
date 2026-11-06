// Drive the main game's shell menus with a pad (owner, 6 Nov 2026: 8BitDo
// everywhere). The ready screen (picker / pause / debrief / intro) and the
// settings dialog become navigable with the same d-pad/stick + A/B grammar as
// rc/gamepad-menu.mjs, and Start works like Escape: pause in flight, resume
// from pause, close settings. A second pad's Start on the picker opens the
// split-screen 2P toy fight and seats player two (rc/join.mjs owns who counts
// as the second pad). While the toy-fight overlay is open it reads its own
// pads, so this module stands down entirely.
import {createMenuPad} from "../../rc/gamepad-menu.mjs";
import {joinPadIndex} from "../../rc/join.mjs";
import {applyMenu} from "../split/toy_session.mjs";
import {FLIGHT_PAD} from "../../rc/flight_layout.mjs";

/** Which shell surface the pad should drive. Toy fight open means none. */
export function shellMenuSurface({toyFightOpen, settingsOpen, readyOpen}) {
  if (toyFightOpen) return null;
  if (settingsOpen) return "settings";
  if (readyOpen) return "ready";
  return null;
}

/**
 * What a Start press means on a given surface. On the mission picker a second
 * pad's Start joins 2P; the first pad's Start is left alone there (A is the
 * launch button). Everywhere else Start is the Escape key: pause, resume,
 * close settings.
 */
export function startIntent({surface, readyMode, secondPad}) {
  if (surface === "ready" && readyMode === "program") {
    return secondPad ? "join2p" : null;
  }
  return "escape";
}

function startHeld(pad) {
  return (pad?.buttons?.[FLIGHT_PAD.START]?.value ?? 0) > 0.5
    || pad?.buttons?.[FLIGHT_PAD.START]?.pressed === true;
}

export function installShellMenuPad({
  readyScreen,
  settingsScreen,
  toyFight = null,
  pressEscape = () => {},
  pads = () => navigator.getGamepads?.() ?? [],
  raf = (fn) => requestAnimationFrame(fn),
  doc = globalThis.document,
} = {}) {
  const settingsOpen = () => settingsScreen?.classList.contains("visible") === true;
  const readyOpen = () => readyScreen?.classList.contains("visible") === true
    && readyScreen.inert !== true
    && readyScreen.getAttribute("aria-hidden") !== "true";
  const toyFightOpen = () => toyFight?.root != null && toyFight.root.hidden === false;
  const surface = () => shellMenuSurface({
    toyFightOpen: toyFightOpen(),
    settingsOpen: settingsOpen(),
    readyOpen: readyOpen(),
  });
  const menuPad = createMenuPad({
    doc,
    root: () => {
      const here = surface();
      if (here === "settings") return settingsScreen;
      if (here === "ready") return readyScreen;
      return null;
    },
    back: pressEscape,
  });
  const started = new Map();
  const frame = (now) => {
    const live = Array.from(pads() ?? []).filter((pad) => pad?.connected);
    if (!toyFightOpen()) {
      menuPad(live, now);
      const p1Pad = live[0]?.index ?? null;
      const other = joinPadIndex(live, p1Pad);
      for (const pad of live) {
        const held = startHeld(pad);
        const was = started.get(pad.index) === true;
        started.set(pad.index, held);
        if (!held || was) continue;
        const intent = startIntent({
          surface: surface(),
          readyMode: readyScreen?.dataset?.mode ?? "",
          secondPad: other != null && pad.index === other,
        });
        if (intent === "join2p" && toyFight?.open) {
          toyFight.open();
          applyMenu(toyFight.session, "players");
        } else if (intent === "escape") {
          pressEscape();
        }
      }
    } else {
      // The toy fight reads its own pads; give the menu driver an empty frame
      // so it clears its highlight instead of leaving a stale pad-focus mark.
      menuPad([], now);
      started.clear();
    }
    raf(frame);
  };
  raf(frame);
  return {surface};
}
