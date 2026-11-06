// TV game launcher. The pad moves a gold highlight; A launches; B leaves
// fullscreen. The menu model (which game, last game) lives in menu.mjs.
import {createMenuPad} from "../rc/gamepad-menu.mjs";
import {padKind, padSvg} from "../rc/pad-art.mjs";
import {GAMES, columnsFor, storedId, writeLast} from "./menu.mjs";

const theme = new URLSearchParams(location.search).get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

function storage() {
  try {
    const bin = localStorage;
    bin.getItem("tv.lastGame");
    return bin;
  } catch {
    return {getItem() { return null; }, setItem() {}};
  }
}

const memory = storage();
const shot = new URLSearchParams(location.search).get("shot");
if (shot === "full") writeLast(memory, "guns");
const games = document.querySelector("#games");
const tiles = [...games.querySelectorAll(".tile")];
games.style.setProperty("--cols", String(columnsFor(tiles.length)));
const remembered = storedId(memory);
const initial = tiles.find((tile) => tile.dataset.id === remembered) ?? tiles[0];
const named = GAMES.find((game) => game.id === remembered);
document.querySelector("#last").textContent = named ? `last ${named.name}` : "";

const menu = createMenuPad({
  root: () => games,
  back() {
    if (document.fullscreenElement) document.exitFullscreen?.();
  },
  initial: () => initial,
});

for (const tile of tiles) {
  tile.addEventListener("click", () => {
    const game = GAMES.find((item) => item.id === tile.dataset.id);
    if (!game) return;
    writeLast(memory, game.id);
    try {
      document.documentElement.requestFullscreen?.();
    } catch {
      /* denied, or already fullscreen */
    }
    location.assign(game.href);
  });
}

let padKey = "";
function livePads() {
  if (shot === "full") {
    const buttons = () => Array.from({length: 16}, () => ({value: 0, pressed: false}));
    return [
      {connected: true, index: 0, id: "8BitDo Ultimate 2", mapping: "standard", axes: [0.4, -0.2, 0, 0], buttons: buttons()},
      {connected: true, index: 1, id: "8BitDo SN30 Pro", mapping: "standard", axes: [-0.3, 0.5, 0, 0], buttons: buttons()},
    ];
  }
  return navigator.getGamepads?.() ?? [];
}

function paintPads() {
  const live = Array.from(livePads()).filter((pad) => pad?.connected);
  document.querySelector("#pad-count").textContent = String(live.length);
  const key = live
    .map((pad) => {
      const axes = Array.from(pad.axes ?? [])
        .map((axis) => (Math.round(Number(axis) * 5) / 5).toFixed(1))
        .join(",");
      const buttons = Array.from(pad.buttons ?? [])
        .map((button) => ((button.value ?? 0) > 0.5 || button.pressed ? "1" : "0"))
        .join("");
      return `${pad.index}:${pad.id}:${axes}:${buttons}`;
    })
    .join("|");
  if (key === padKey) return;
  padKey = key;
  const host = document.querySelector("#pads");
  host.replaceChildren();
  for (const pad of live) {
    const pressed = new Set();
    pad.buttons?.forEach((button, index) => {
      if ((button.value ?? 0) > 0.5 || button.pressed) pressed.add(index);
    });
    const wrap = document.createElement("span");
    wrap.className = "pad";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", pad.id || "controller");
    const parsed = new DOMParser().parseFromString(
      padSvg(padKind(pad.id), {pressed, axes: Array.from(pad.axes ?? [])}, {labels: false, width: 150}),
      "image/svg+xml",
    );
    const drawing = parsed.documentElement;
    if (drawing?.tagName?.toLowerCase() === "svg") wrap.append(drawing);
    host.append(wrap);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  menu(livePads(), now);
  paintPads();
  document.querySelector("#back").hidden = !document.fullscreenElement;
  for (const tile of tiles) {
    tile.setAttribute("aria-current", tile.classList.contains("pad-focus") ? "true" : "false");
  }
}
requestAnimationFrame(frame);
