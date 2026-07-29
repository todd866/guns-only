#!/usr/bin/env node
// Renders createRapierDispersedStrip() from three angles so the launch ramp and the covered
// gallery can actually be LOOKED AT before shipping. Structural tests pass on geometry that is
// visually wrong; this session has already been saved twice by reading a rendered pixel.
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "/Users/iantodd/Projects/guns-only/web/wwwroot/render/hud/tests/harness/static_server.mjs";

const require = createRequire("file:///Users/iantodd/Projects/guns-only/web/smoke/package.json");
const { chromium } = require("playwright");

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WWWROOT = process.env.WWWROOT ?? resolve(REPO_ROOT, "web/wwwroot");
const OUT = process.env.SHOT_DIR
  ?? resolve(REPO_ROOT, "analysis/launch-complex-shots");

const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mjs": "text/javascript", ".png": "image/png" };

// The launch axis lives at x = -70 since the vicinity rebuild (the harness prints
// launchEnd from the live geometry — retarget these views if it moves again).
const VIEWS = [
  // Down the launch axis from behind the shuttle start: what the pilot sees at t=0.
  { name: "01-pilot-at-launch", pos: [-70, 3.5, 10], look: [-70, 8, -560], fov: 70 },
  // Inside the gallery mid-run, showing the ribs and the daylight at the far end.
  { name: "02-inside-gallery", pos: [-70, 3.0, -180], look: [-70, 6, -560], fov: 75 },
  // Three-quarter exterior: the mound, the portal, and the ski jump rising out of it.
  { name: "03-ramp-exterior", pos: [140, 70, -700], look: [-70, 10, -440], fov: 45 },
  // Side elevation of the ramp so the lip and rise are measurable by eye.
  { name: "04-ramp-side", pos: [-420, 28, -480], look: [-70, 14, -490], fov: 40 },
  // Whole installation from high abeam: gallery, jump, and the open recovery runway beyond.
  { name: "05-whole-site", pos: [700, 340, 500], look: [-40, 0, -220], fov: 42 },
];

const PAGE = (viewJson) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#8fa5b8}</style>
<canvas id="c" width="1280" height="800"></canvas>
<script type="module">
import * as THREE from "/vendor/three.module.js";
import { createRapierDispersedStrip } from "/render/scene/scene_builders.js";
const views = ${viewJson};
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(1280, 800, false);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ab4c8);
scene.add(new THREE.HemisphereLight(0xbcd6ea, 0x6b6a4a, 1.15));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.1);
sun.position.set(-420, 380, 260); sun.castShadow = true;
sun.shadow.camera.left = -700; sun.shadow.camera.right = 700;
sun.shadow.camera.top = 700; sun.shadow.camera.bottom = -700;
sun.shadow.camera.far = 2200; sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
// Steppe: the installation must read as sitting ON something.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
  new THREE.MeshStandardMaterial({ color: 0x7d7a55, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; ground.receiveShadow = true;
scene.add(ground);
const strip = createRapierDispersedStrip();
scene.add(strip);
window.__shoot = (i) => {
  const v = views[i];
  const cam = new THREE.PerspectiveCamera(v.fov, 1280 / 800, 0.5, 12000);
  cam.position.set(...v.pos);
  cam.lookAt(...v.look);
  renderer.render(scene, cam);
  return true;
};
window.__ready = true;
window.__report = () => {
  const box = new THREE.Box3().setFromObject(strip);
  const gallery = strip.getObjectByName("LAUNCH_GALLERY");
  const gb = gallery ? new THREE.Box3().setFromObject(gallery) : null;
  return JSON.stringify({
    stripBounds: { min: box.min.toArray().map(n => +n.toFixed(1)), max: box.max.toArray().map(n => +n.toFixed(1)) },
    galleryPresent: Boolean(gallery),
    galleryBounds: gb ? { min: gb.min.toArray().map(n => +n.toFixed(1)), max: gb.max.toArray().map(n => +n.toFixed(1)) } : null,
    launchEnd: strip.userData.sockets.bowReference.position.toArray().map(n => +n.toFixed(2)),
  });
};
</script>`;

const server = await serveStatic({ root: WWWROOT, mime: MIME, extraRoutes: {} }).catch(async () => {
  const http = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const s = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/strip.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGE(JSON.stringify(VIEWS)));
      return;
    }
    try {
      const body = await readFile(resolve(WWWROOT, "." + url.pathname));
      res.writeHead(200, { "content-type": MIME[extname(url.pathname)] ?? "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404); res.end("no"); }
  });
  await new Promise((r) => s.listen(0, r));
  return { origin: `http://127.0.0.1:${s.address().port}`, close: () => s.close() };
});

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${server.origin}/strip.html`, { waitUntil: "networkidle" });
await page.waitForFunction("window.__ready === true", { timeout: 45000 });
console.log(await page.evaluate("window.__report()"));
for (let i = 0; i < VIEWS.length; i++) {
  await page.evaluate(`window.__shoot(${i})`);
  const shot = await page.locator("#c").screenshot();
  await writeFile(`${OUT}/${VIEWS[i].name}.png`, shot);
  console.log(`  wrote ${VIEWS[i].name}.png  ${(shot.length / 1024).toFixed(0)} KB`);
}
if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
await server.close?.();
