#!/usr/bin/env node
// Headless Chrome shots of the real toy-gunship page, light and dark, title
// and in-flight (scripted pads via ?shot=). Chrome aborts (SIGABRT) inside the
// workspace sandbox; run it on the host.
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {serveStatic} from "../../../render/hud/tests/harness/static_server.mjs";

const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WWWROOT = fileURLToPath(new URL("../../../", import.meta.url));
const OUT = resolve(process.env.TOY_GUNSHIP_SHOT_DIR ?? join(process.cwd(), "tmp/toy-gunship-shots"));
const profile = join(OUT, "chrome-profile");

const site = await serveStatic(WWWROOT);
try {
  await mkdir(profile, {recursive: true});
  for (const theme of ["dark", "light"]) {
    for (const scene of ["title", "fly"]) {
      const file = join(OUT, `${scene}-${theme}.png`);
      const url = `${site.url}toy-gunship/index.html?shot=${scene}&theme=${theme}`;
      await new Promise((resolvePromise, reject) => {
        // SwiftShader = labeled SOFTWARE rendering: look-QA only, never
        // performance evidence (AGENTS.md browser-QA rule).
        const child = spawn(chrome, [
          "--headless=new",
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          "--no-sandbox",
          "--hide-scrollbars",
          "--force-color-profile=srgb",
          `--user-data-dir=${profile}`,
          "--window-size=1280,720",
          "--virtual-time-budget=20000",
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
