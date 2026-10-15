import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createReportUi } from "../report_ui.js";

class Element {
  constructor() { this.listeners = new Map(); this.disabled = false; this.hidden = false; this.open = false; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  async emit(type, values = {}) {
    const event = { preventDefault() {}, stopImmediatePropagation() {}, ...values };
    for (const callback of this.listeners.get(type) || []) await callback(event);
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
}

test("report copies before pausing, Enter sends, and Escape restores only its own pause reason", async () => {
  const previousWindow = global.window, previousDocument = global.document;
  const window = new Element(), trigger = new Element(), dialog = new Element();
  const note = new Element(), send = new Element(), cancel = new Element(), output = new Element(), form = new Element();
  const priorFocus = new Element();
  global.window = window;
  global.document = { activeElement: priorFocus };
  dialog.querySelector = selector => ({ form, input: note, output,
    '[data-action="send"]': send, '[data-action="cancel"]': cancel })[selector];
  form.requestSubmit = () => { form.submission = form.emit("submit"); };
  const reasons = new Set(["ready"]), sequence = [], requests = [];
  const transport = { enabled: true, async submit(id, body) { requests.push({ id, body }); return "Sent"; } };
  try {
    const ui = createReportUi({ dialog, trigger, transport, canCapture: () => true,
      setPaused(paused) { sequence.push(paused ? "pause" : "resume"); paused ? reasons.add("report") : reasons.delete("report"); } });
    await window.emit("keydown", { code: "F8" });
    assert.equal(ui.pending, true);
    assert.deepEqual([...reasons], ["ready"]);
    sequence.push("render");
    ui.capture(() => {
      sequence.push("copy");
      return { report: { id: "12345678-1234-4321-1234-123456789012" },
        screenshot: Promise.resolve(new Blob([new Uint8Array([255, 216])], { type: "image/jpeg" })) };
    });
    await Promise.resolve();
    assert.deepEqual(sequence, ["render", "copy", "pause"]);
    assert.equal(dialog.open, true);
    assert.equal(send.disabled, false);
    note.value = "wrong bank";
    await window.emit("keydown", { code: "Enter" });
    await form.submission;
    assert.equal(requests.length, 1);
    assert.equal(output.textContent, "Sent · 123456");
    await window.emit("keydown", { code: "Escape" });
    assert.equal(dialog.open, false);
    assert.deepEqual([...reasons], ["ready"]);
    assert.equal(priorFocus.focused, true);
    await trigger.emit("click");
    assert.equal(ui.pending, true);
    await window.emit("keydown", { code: "Escape" });
    assert.equal(ui.pending, false);
    assert.deepEqual([...reasons], ["ready"]);
  } finally {
    await cancel.emit("click");
    global.window = previousWindow; global.document = previousDocument;
  }
});

test("app captures after synchronous scene/HUD update and skips authority advance on the requested frame", async () => {
  const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
  assert.match(app, /if \(pauseReasons.size === 0 && !reportUi.pending\) \{[\s\S]*?bridge.Advance/);
  assert.match(app, /view.update\([\s\S]*?\);\s*reportUi.capture\(\(\) => snapshotFeedbackReport/);
  const update = app.slice(app.indexOf("  update(state, dt, nowSeconds, renderFrameMs"), app.indexOf("  presentationDiagnostics()"));
  assert.match(update, /this.visualRuntime.render\(dt\)/);
  assert.match(update, /this.renderer.render\(this.scene, this.camera\)/);
  assert.match(update, /this.hud.draw\(hudFrame\)/);
  assert.doesNotMatch(update, /\bawait\b|\breturn;/);
  assert.match(app, /const state = JSON.parse\(bridge.GetState\(\)\)/);
  const worker = await readFile(new URL("../../../service-worker.js", import.meta.url), "utf8");
  assert.ok(worker.includes('/^\\/report(?:\\/|$)/'), "report capability must never enter the offline cache");
});
