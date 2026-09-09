import { PRACTICE_EXERCISES } from "./practice.js";
import { compareAttempts } from "../progression/pilot_logbook.js";

// Native modal ownership keeps flight controls inert, including on a keyboard or screen reader.
// Built once; only refresh the history at a user-requested open, never on every flight frame.
export function createPilotNotebook({ logbook, onPractice, onOpen, onClose }) {
  const dialog = document.createElement("dialog");
  dialog.className = "pilot-notebook";
  dialog.setAttribute("aria-labelledby", "pilot-notebook-title");
  const element = (tag, value, parent = dialog) => {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    parent.append(node); return node;
  };
  const header = element("header");
  const title = element("h2", "Pilot logbook", header);
  title.id = "pilot-notebook-title";
  const close = element("button", "Close", header); close.type = "button";
  close.addEventListener("click", () => dialog.close());
  const body = element("div");
  document.body.append(dialog);
  dialog.addEventListener("close", () => onClose?.());
  const guard = (event) => {
    if (!dialog.open) return;
    // Stop gameplay shortcuts at the window capture boundary; preserve native Tab/activation.
    event.stopImmediatePropagation();
    if (event.code === "Escape" && event.type === "keydown") {
      event.preventDefault(); dialog.close();
    }
  };
  window.addEventListener("keydown", guard, true);
  window.addEventListener("keyup", guard, true);
  function render(mode) {
    body.replaceChildren();
    title.textContent = mode === "practice" ? "Practice one skill" : "Pilot logbook";
    if (mode === "practice") {
      element("p", "Short F-22 exercises using the full flight model. Each has its own result; all aircraft remain available.", body);
      for (const exercise of PRACTICE_EXERCISES) {
        const card = element("article", "", body);
        element("h3", exercise.title, card);
        element("p", exercise.brief, card);
        element("small", `${exercise.limit} · repeat as often as you like`, card);
        const choose = element("button", `Brief: ${exercise.title}`, card);
        choose.type = "button";
        choose.addEventListener("click", () => { dialog.close(); onPractice(exercise.id); });
      }
      return;
    }
    element("p", "Saved on this browser only. Your last 100 attempts record outcomes and corrections, without unlocks or aircraft changes.", body);
    const attempts = logbook.list();
    if (!logbook.storageAvailable) element("p", "Browser storage is unavailable. New attempts remain in memory until this page closes.", body);
    if (!attempts.length) element("p", "Your first completed or ended attempt will appear here. Practice is a good place to start.", body);
    for (const attempt of [...attempts].reverse()) {
      const card = element("article", "", body);
      element("h3", `${attempt.activity} · ${attempt.outcome}`, card);
      element("small", `${attempt.kind === "practice" ? "Practice" : "Sortie"} · ${new Date(attempt.endedAt).toLocaleString()}`, card);
      const facts = [];
      if (attempt.durationSeconds != null) facts.push(`${Math.round(attempt.durationSeconds)} seconds`);
      if (attempt.rounds > 0) facts.push(attempt.hits == null ? `${attempt.rounds} rounds` : `${attempt.hits} hits / ${attempt.rounds} rounds`);
      if (attempt.kills > 0) facts.push(`${attempt.kills} kills`);
      if (attempt.valleyCleared) facts.push("Valley cleared");
      if (attempt.recovered) facts.push("Recovered");
      if (attempt.laps != null) facts.push(`${attempt.laps} laps`);
      if (attempt.laps > 0 && attempt.bestLapSeconds > 0) facts.push(`${attempt.bestLapSeconds.toFixed(2)} s best clean lap`);
      if (attempt.effectiveDrops != null) facts.push(`${attempt.effectiveDrops} effective drops`);
      if (attempt.waterKg != null) facts.push(`${Math.round(attempt.waterKg)} kg effective water`);
      if (attempt.cycles != null) facts.push(`${attempt.cycles} circuits`);
      if (facts.length) element("p", facts.join(" · "), card);
      if (attempt.correction) element("p", attempt.correction, card);
      element("small", compareAttempts(attempts.filter((a) => a.endedAt <= attempt.endedAt), attempt), card);
    }
    if (attempts.length) {
      const actions = element("footer", "", body);
      const download = element("button", "Export logbook", actions); download.type = "button";
      download.addEventListener("click", () => {
        const url = URL.createObjectURL(new Blob([logbook.exportJson()], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "guns-only-logbook.json";
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      const erase = element("button", "Clear this logbook", actions); erase.type = "button";
      erase.addEventListener("click", () => {
        if (erase.dataset.confirm !== "true") {
          erase.dataset.confirm = "true"; erase.textContent = "Confirm clear all local attempts"; return;
        }
        logbook.clear(); render("logbook");
      });
    }
  }
  return {
    get open() { return dialog.open; },
    show(mode = "logbook") {
      if (dialog.open) return;
      onOpen?.(); render(mode); dialog.showModal(); close.focus();
    },
  };
}
