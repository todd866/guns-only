#!/usr/bin/env node
// Headless Chrome shots of the real toy-fight overlay, light and dark.
// Chrome aborts (SIGABRT) inside this workspace sandbox; run it on the host.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../../../hud/tests/harness/static_server.mjs";

function defaultChromeBinary() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).sort().reverse();
    for (const d of dirs) {
      if (d.startsWith("chromium_headless_shell-")) {
        for (const sub of ["chrome-headless-shell-mac-arm64", "chrome-headless-shell-mac-x64"]) {
          const bin = join(cache, d, sub, "chrome-headless-shell");
          if (existsSync(bin)) return bin;
        }
      }
    }
    for (const d of dirs) {
      if (d.startsWith("chromium-")) {
        for (const sub of ["chrome-mac-arm64", "chrome-mac-x64"]) {
          const bin = join(cache, d, sub, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
          if (existsSync(bin)) return bin;
        }
      }
    }
  }
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

const chrome = defaultChromeBinary();
const WWWROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const OUT = resolve(process.env.TOY_FIGHT_SHOT_DIR ?? join(process.cwd(), "tmp/toy-fight-shots"));
const profile = join(OUT, "chrome-profile");

const site = await serveStatic(WWWROOT);
try {
  await mkdir(profile, {recursive: true});
  for (const theme of ["dark", "light"]) {
    for (const scene of ["menu", "fight"]) {
      const file = join(OUT, `${scene}-${theme}.png`);
      const url = `${site.url}render/split/tests/harness/preview.html?theme=${theme}&scene=${scene}`;
      await new Promise((resolvePromise, reject) => {
        const child = spawn(chrome, [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--hide-scrollbars",
          "--force-color-profile=srgb",
          `--user-data-dir=${profile}`,
          "--window-size=1280,720",
          "--virtual-time-budget=2500",
          `--screenshot=${file}`,
          url,
        ], {stdio: ["ignore", "inherit", "inherit"]});
        child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`chrome exited ${code}`))));
      });
      console.log(file);
    }
  }
} finally {
  await site.close();
}
