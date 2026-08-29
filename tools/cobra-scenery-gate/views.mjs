// Exterior park poses used by every automated Cobra scenery proof. eastM/northM match
// landmark.positionLocalM [east, up, north] (camera z = -north). Keep this list shared so
// still-image composition and temporal-artifact probes grade the same authored landmarks.
export const COBRA_SCENERY_SCREENSHOT_TIMEOUT_MS = 120_000;

export const COBRA_SCENERY_VIEWS = Object.freeze([
  Object.freeze({
    name: "iron-bell",
    // South-west three-quarter: complete crossing, both bridgeheads and the active east-west
    // exchange fit together. The previous inside-cell broadside sat under the east approach and
    // turned its conservative collision volume into the whole composition.
    eastM: -3_050,
    northM: -700,
    aglM: 50,
    yawRad: -1.075,
    pitchRad: -0.05,
    fovDeg: 56,
    battleSiteId: "site.iron-bell-bridge.v1",
  }),
  Object.freeze({
    name: "plantation-fight",
    // Downward south-east quarter: both exact endpoints and the complete water tower remain in the
    // safe frame. The former positive pitch looked above the fight, leaving its shooter hundreds
    // of pixels below the photographed viewport even while the authority sidecar passed.
    eastM: 50,
    northM: -3_750,
    aglM: 40,
    yawRad: -2.125,
    pitchRad: -0.12,
    fovDeg: 46,
    battleSiteId: "site.plantation-water-tower.v1",
  }),
  Object.freeze({
    name: "camp-ember",
    // Actual 300-degree short final: this mirrored pose sees the paired approach panels, FATO and
    // vertical compound mass in their operational order. The old north-west pose looked back from
    // the departure side while claiming to grade final approach.
    eastM: -3_605,
    northM: -4_712,
    aglM: 18,
    yawRad: 1.047,
    pitchRad: -0.08,
  }),
  Object.freeze({
    name: "mid-gorge",
    // Long Fang approach: look across village/canopy rather than up a blank hillside.
    eastM: -4_557,
    northM: -3_661,
    aglM: 50,
    yawRad: -0.5,
    pitchRad: -0.2,
  }),
]);
