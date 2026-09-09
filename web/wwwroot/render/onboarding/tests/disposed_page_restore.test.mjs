import test from "node:test";
import assert from "node:assert/strict";
import { installDisposedPageRestore } from "../disposed_page_restore.js";
test("a disposed BFCache document restarts at its brief; ordinary pageshow never loops", () => {
  const target = new EventTarget(); let reloads = 0;
  const uninstall = installDisposedPageRestore(target, () => reloads++);
  target.dispatchEvent(new Event("pageshow")); assert.equal(reloads, 0);
  const restored = new Event("pageshow"); Object.defineProperty(restored, "persisted", { value: true });
  target.dispatchEvent(restored); assert.equal(reloads, 1);
  uninstall(); target.dispatchEvent(restored); assert.equal(reloads, 1);
});
