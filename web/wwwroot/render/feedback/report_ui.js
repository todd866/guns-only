import { REPORT_KEY, REPORT_NOTE_LENGTH } from "./report_payload.js";
import { encodeReportUpload } from "./report_capture.js";

export function createReportUi({ dialog, trigger, transport, setPaused, canCapture }) {
  const form = dialog.querySelector("form");
  const note = dialog.querySelector("input");
  const send = dialog.querySelector('[data-action="send"]');
  const cancel = dialog.querySelector('[data-action="cancel"]');
  const status = dialog.querySelector("output");
  let pending = false;
  let draft = null;
  let screenshot = null;
  let generation = 0;
  let returnFocus = null;
  let closeTimer = 0;
  let submitting = false;
  let submittedPayload = null;
  note.maxLength = REPORT_NOTE_LENGTH;
  function close() {
    generation++;
    pending = false;
    draft = null;
    screenshot = null;
    clearTimeout(closeTimer);
    if (dialog.open) dialog.close();
    setPaused(false);
    returnFocus?.focus?.({ preventScroll: true });
  }
  function request() {
    if (!transport.enabled || !canCapture() || pending || dialog.open) return;
    returnFocus = document.activeElement;
    pending = true;
  }
  trigger.addEventListener("click", request);
  cancel.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  // Capture-phase ownership prevents report typing from reaching flight shortcuts or rebindings.
  window.addEventListener("keydown", event => {
    if (dialog.open || pending) {
      event.stopImmediatePropagation();
      if (event.code === "Escape") { event.preventDefault(); close(); }
      else if (event.code === "Enter" || event.code === "NumpadEnter") {
        event.preventDefault();
        if (!send.disabled && !event.isComposing) form.requestSubmit();
      }
      return;
    }
    if (event.code === REPORT_KEY && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) request();
    }
  }, { capture: true });
  window.addEventListener("keyup", event => {
    if (dialog.open || pending || event.code === REPORT_KEY) event.stopImmediatePropagation();
  }, { capture: true });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!draft || !screenshot || submitting) return;
    submitting = true;
    send.disabled = true;
    note.disabled = true;
    const owner = generation;
    const submitted = draft;
    try {
      const body = submittedPayload ?? await encodeReportUpload({ ...submitted, note: note.value.slice(0, REPORT_NOTE_LENGTH) }, screenshot);
      if (owner === generation) submittedPayload = body;
      const result = await transport.submit(submitted.id, body);
      if (owner !== generation) return;
      note.hidden = true;
      send.hidden = true;
      status.hidden = false;
      status.textContent = `${result} · ${draft.id.slice(0, 6)}`;
      closeTimer = setTimeout(close, 2_000);
    } catch (error) {
      if (owner !== generation) return;
      send.textContent = "Retry";
      send.title = String(error.message || error);
      send.disabled = false;
      // Preserve the exact note/body/ID after an ambiguous or partial server write.
      note.disabled = submittedPayload !== null;
    } finally { submitting = false; }
  });
  return {
    get pending() { return pending; },
    get active() { return pending || dialog.open; },
    // Called in the render callback; snapshot() MUST copy the canvases before returning.
    capture(snapshot) {
      if (!pending) return;
      pending = false;
      submittedPayload = null;
      const owner = ++generation;
      note.value = "";
      note.hidden = false;
      note.disabled = false;
      send.hidden = false;
      send.disabled = true;
      send.textContent = "Send";
      send.title = "Send report";
      status.hidden = true;
      let capture;
      try { capture = snapshot(); }
      catch (error) { send.title = String(error.message || error); }
      dialog.showModal();
      setPaused(true);
      note.focus({ preventScroll: true });
      if (!capture) { note.placeholder = "Capture failed"; return; }
      note.placeholder = "What's wrong?";
      draft = capture.report;
      Promise.resolve(capture.screenshot).then(blob => {
        if (owner !== generation) return;
        screenshot = blob;
        send.disabled = false;
      }).catch(error => {
        if (owner !== generation) return;
        note.placeholder = "Capture failed";
        send.title = String(error.message || error);
      });
    },
  };
}
