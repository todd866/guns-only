import {mkdir, writeFile} from "node:fs/promises";
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

async function shot(page, name, theme) {
  await page.emulateMedia({colorScheme: theme});
  await page.screenshot({path: path.join(OUT, `${name}-${theme}.png`), fullPage: false});
}

const server = serve(ROOT);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const browser = await chromium.launch({headless: true, channel: "chromium"});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto(base, {waitUntil: "domcontentloaded"});

await page.evaluate(() => {
  const ready = document.querySelector("#ready-screen");
  ready?.classList.add("visible");
  ready?.setAttribute("data-mode", "program");
  ready?.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("run-paused");
  document.querySelector("#boot")?.setAttribute("hidden", "");
});

for (const theme of ["light", "dark"]) {
  await shot(page, "picker", theme);
}

await page.evaluate(() => {
  const ready = document.querySelector("#ready-screen");
  ready?.setAttribute("data-mode", "pause");
  ready?.classList.add("visible");
});

for (const theme of ["light", "dark"]) {
  await shot(page, "pause", theme);
}

await page.evaluate(async () => {
  const mod = await import("./render/onboarding/first_run_controls.js");
  const {WEEKEND_RIDE_ONBOARDING_CONTENT} = await import("./render/onboarding/controls_content.js");
  mod.createControlsOnboarding({
    modeId: WEEKEND_RIDE_ONBOARDING_CONTENT.modeId,
    content: WEEKEND_RIDE_ONBOARDING_CONTENT,
    storage: {getItem: () => null, setItem: () => {}},
    touch: false,
  }).open();
});

for (const theme of ["light", "dark"]) {
  await shot(page, "onboarding-controls", theme);
}

await browser.close();
server.close();
await writeFile(path.join(OUT, "manifest.txt"), `Captured from ${base}\n`);
