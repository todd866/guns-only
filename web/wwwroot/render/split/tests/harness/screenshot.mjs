#!/usr/bin/env node
// Headless Chrome shots of the real toy-fight overlay, light and dark.
// Chrome aborts (SIGABRT) inside this workspace sandbox; run it on the host.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "../../../hud/tests/harness/static_server.mjs";

const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
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
