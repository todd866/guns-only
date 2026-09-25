// F-22 ramp blob. The kernel owns the rung. This module only stores the opaque
// string and decides when a route may hand it back. A v1 blob is armed so the
// kernel can migrate it (that migration opens at rung 0). Anything else that
// is not a v2 snapshot is left unarmed, which is also rung 0.

export const DIRECTOR_STATE_STORAGE = "guns-only.fight-director.v2";
export const DIRECTOR_STATE_STORAGE_V1 = "guns-only.fight-director.v1";

const VISUAL_MERGE_MISSION =
  "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1";
const VALLEY_MISSION = "mission.modern.visual-merge.first-run-valley.v1";

export function rampMissionActive({ programId = "", missionId = "" } = {}) {
  return programId === "first-merge"
    || missionId === VISUAL_MERGE_MISSION
    || missionId === VALLEY_MISSION;
}

/** Valley boot and the Guns Only Fly path are the only restores. */
export function routeRestoresDirector({ valley = false, programId = "" } = {}) {
  return valley === true || programId === "first-merge";
}

export function readDirectorBlob(storage) {
  try {
    return storage?.getItem?.(DIRECTOR_STATE_STORAGE)
      || storage?.getItem?.(DIRECTOR_STATE_STORAGE_V1)
      || "";
  } catch {
    return "";
  }
}

export function classifyDirectorBlob(blob) {
  const text = String(blob ?? "").trim();
  if (!text) return { kind: "empty", rung: 0, arm: false };
  const parts = text.split("|");
  if (parts.length === 15 && parts[0] === "v1")
    return { kind: "v1", rung: 0, arm: true };
  if (parts.length === 20 && parts[0] === "v2") {
    const rung = Number(parts[1]);
    if (Number.isInteger(rung) && rung >= 0 && rung <= 3)
      return { kind: "v2", rung, arm: true };
  }
  return { kind: "corrupt", rung: 0, arm: false };
}

export function createDirectorPersistence({
  storage,
  exportState,
  armState,
  missionActive,
}) {
  let observationKey = "";

  function save() {
    try {
      if (!missionActive()) return false;
      const state = exportState?.() ?? "";
      if (!state) return false;
      storage?.setItem?.(DIRECTOR_STATE_STORAGE, state);
      return true;
    } catch {
      return false;
    }
  }

  function persistObservation(state) {
    if (!missionActive(state)) return false;
    const key = [
      state?.engagement_number,
      state?.kill_count,
      state?.difficulty_rung,
      state?.session_phase,
    ].join("|");
    if (key === observationKey) return false;
    const hadPrior = observationKey !== "";
    observationKey = key;
    return hadPrior ? save() : false;
  }

  function restore() {
    const saved = readDirectorBlob(storage);
    const classified = classifyDirectorBlob(saved);
    if (classified.arm) {
      try { armState?.(saved); } catch { /* a bad stored value opens at rung 0 */ }
    }
    return classified;
  }

  function onPageHide() {
    return save();
  }

  function onVisibilityChange(hidden) {
    return hidden ? save() : false;
  }

  return {
    save,
    persistObservation,
    restore,
    onPageHide,
    onVisibilityChange,
  };
}
