import assert from "node:assert/strict";
import test from "node:test";
import { perfBrowserLaunchOptions } from "./browser_launch.mjs";

test("hardware QA selects full Chromium headless while retaining GPU and scheduling arguments", () => {
  const args = ["--use-angle=metal", "--enable-webgl-draft-extensions", "--disable-background-timer-throttling"];
  const options = perfBrowserLaunchOptions({ hardware: true, args });
  assert.equal(options.headless, true, "hardware qualification must not open a desktop window");
  assert.equal(options.channel, "chromium", "use full Chromium rather than the software-oriented headless shell");
  assert.deepEqual(options.args, args);
  assert.equal(options.args.some(arg => /disable-gpu|swiftshader/.test(arg)), false);
});

test("software CI retains the existing headless shell and exact SwiftShader flags", () => {
  const args = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  assert.deepEqual(perfBrowserLaunchOptions({ hardware: false, args }), { headless: true, args });
  assert.deepEqual(perfBrowserLaunchOptions(), { headless: true, args: [] });
});

test("separate launches own their option arrays and cannot mutate each other's renderer mode", () => {
  const args = ["--use-angle=metal"];
  const hardware = perfBrowserLaunchOptions({ hardware: true, args });
  hardware.args.push("--mute-audio");
  assert.deepEqual(args, ["--use-angle=metal"]);
  assert.deepEqual(perfBrowserLaunchOptions({ hardware: true, args }).args, ["--use-angle=metal"]);
  assert.equal(perfBrowserLaunchOptions({ hardware: false }).channel, undefined);
});
