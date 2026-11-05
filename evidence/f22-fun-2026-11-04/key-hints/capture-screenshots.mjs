import {writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "node:http";
import {createReadStream, statSync} from "node:fs";
import {chromium} from "playwright";

const MIME = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png"};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../web/wwwroot");
const OUT = path.dirname(fileURLToPath(import.meta.url));

function serve(root) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const file = path.join(root, decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html");
    if (!file.startsWith(root)) {
      res.writeHead(403); res.end(); return;
    }
    try {
      statSync(file);
      res.writeHead(200, {"content-type": MIME[path.extname(file)] || "application/octet-stream"});
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
}

async function hideBootFailure(page) {
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-launch");
    document.querySelector("#boot")?.classList.add("ready");
    for (const sel of ["#shell-fallback", "#fatal"]) {
      const el = document.querySelector(sel);
      el?.classList.remove("visible");
      el?.setAttribute("hidden", "");
    }
  });
}

async function showPicker(page) {
  await hideBootFailure(page);
  await page.evaluate(() => {
    document.documentElement.classList.remove("run-paused");
    const ready = document.querySelector("#ready-screen");
    ready?.classList.add("visible");
    ready?.setAttribute("data-mode", "program");
    ready?.setAttribute("aria-hidden", "false");
    const selector = document.querySelector("#ready-selector");
    if (selector) selector.hidden = false;
    const start = document.querySelector("#ready-start");
    if (start) start.disabled = false;
    document.querySelector("#settings-screen")?.classList.remove("visible");
    document.querySelector("#controls-onboarding")?.setAttribute("hidden", "");
  });
}

async function showPause(page) {
  await hideBootFailure(page);
  await page.evaluate(() => {
    document.documentElement.classList.add("run-paused");
    const ready = document.querySelector("#ready-screen");
    ready?.classList.add("visible");
    ready?.setAttribute("data-mode", "pause");
    ready?.setAttribute("aria-hidden", "false");
    const selector = document.querySelector("#ready-selector");
    if (selector) selector.hidden = true;
    const strip = document.querySelector("#ready-mission-strip");
    strip?.removeAttribute("hidden");
    const mode = document.querySelector("#ready-mission-mode");
    if (mode) mode.textContent = "Guns Only";
    const start = document.querySelector("#ready-start");
    if (start) {
      start.disabled = false;
      const label = start.querySelector(".shell-action-label");
      if (label) label.textContent = "Resume";
    }
    document.querySelector("#settings-screen")?.classList.remove("visible");
    document.querySelector("#controls-onboarding")?.setAttribute("hidden", "");
  });
}

async function shot(page, name, theme) {
  await page.emulateMedia({colorScheme: theme});
  await page.waitForTimeout(150);
  await page.screenshot({path: path.join(OUT, `${name}-${theme}.png`), fullPage: false});
}

const server = serve(ROOT);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const browser = await chromium.launch({headless: true, channel: "chromium"});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto(base, {waitUntil: "domcontentloaded"});
await page.waitForTimeout(400);

await showPicker(page);
for (const theme of ["light", "dark"]) {
  await shot(page, "picker", theme);
}

await showPause(page);
for (const theme of ["light", "dark"]) {
  await shot(page, "pause", theme);
}

await page.evaluate(async () => {
  const mod = await import("./render/onboarding/first_run_controls.js");
  const {COBRA_ONBOARDING_CONTENT} = await import("./render/onboarding/controls_content.js");
  document.querySelector("#controls-onboarding")?.remove();
  document.querySelector("#controls-onboarding-reopen")?.remove();
  document.querySelector("#controls-onboarding-nudge")?.remove();
  document.documentElement.removeAttribute("data-launch");
  document.querySelector("#boot")?.classList.add("ready");
  for (const sel of ["#shell-fallback", "#fatal"]) {
    const el = document.querySelector(sel);
    el?.classList.remove("visible");
    el?.setAttribute("hidden", "");
  }
  const ready = document.querySelector("#ready-screen");
  ready?.classList.remove("visible");
  ready?.setAttribute("aria-hidden", "true");
  if (ready) ready.style.display = "none";
  mod.createControlsOnboarding({
    modeId: COBRA_ONBOARDING_CONTENT.modeId,
    content: COBRA_ONBOARDING_CONTENT,
    storage: {getItem: () => null, setItem: () => {}},
    touch: false,
  }).open();
});
for (const theme of ["light", "dark"]) {
  await shot(page, "onboarding-controls", theme);
}

await page.evaluate(async () => {
  const {CONTROL_BINDINGS, controlCodeLabel} = await import("./render/settings/player_settings.js");
  const {renderKeyColumn, appendBindingKey} = await import("./render/input/key_label_ui.js");
  document.querySelector("#controls-onboarding")?.remove();
  document.querySelector("#controls-onboarding-reopen")?.remove();
  const tbody = document.querySelector("#settings-bindings");
  const rowsPerColumn = Math.ceil(CONTROL_BINDINGS.length / 2);
  const nodes = Array.from({ length: rowsPerColumn }, (_, index) => {
    const row = document.createElement("tr");
    row.className = "settings-binding";
    for (const definition of [CONTROL_BINDINGS[index], CONTROL_BINDINGS[index + rowsPerColumn]]) {
      if (!definition) continue;
      const label = document.createElement("th");
      label.scope = "row";
      label.textContent = definition.label;
      const cell = document.createElement("td");
      const button = document.createElement("button");
      button.type = "button";
      renderKeyColumn(button, controlCodeLabel(definition.defaultCode), document);
      cell.append(button);
      row.append(label, cell);
    }
    return row;
  });
  const reportRow = document.createElement("tr");
  reportRow.className = "settings-binding";
  const reportLabel = document.createElement("th");
  reportLabel.scope = "row";
  reportLabel.textContent = "Report";
  const reportCell = document.createElement("td");
  appendBindingKey(reportCell, "F8", document);
  reportRow.append(reportLabel, reportCell);
  tbody?.replaceChildren(...nodes, reportRow);
  document.querySelector("#boot")?.classList.add("ready");
  for (const sel of ["#shell-fallback", "#fatal"]) {
    const el = document.querySelector(sel);
    el?.classList.remove("visible");
    el?.setAttribute("hidden", "");
  }
  document.documentElement.classList.remove("run-paused");
  document.querySelector("#ready-screen")?.classList.remove("visible");
  const settings = document.querySelector("#settings-screen");
  settings?.classList.add("visible");
  settings?.setAttribute("aria-hidden", "false");
  settings?.removeAttribute("inert");
});
for (const theme of ["light", "dark"]) {
  await shot(page, "settings", theme);
}

await browser.close();
server.close();
await writeFile(path.join(OUT, "manifest.txt"), `Captured from ${base}\n`);
