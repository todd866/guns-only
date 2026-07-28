# CASEVAC course scenery

This folder contains a deterministic, procedural presentation for the fictional
orchard pickup and clinic handoff sites described by the accepted CASEVAC
course design.

It is intentionally not wired into the flight scene yet.

```js
import * as THREE from "../../vendor/three.module.js";
import { createCasevacCourseScenery } from "./casevac_course_scenery.js";

const scenery = createCasevacCourseScenery(THREE, {
  qualityTier: "balanced",
  seed: 7,
  anchors: {
    pickup: { x: 0, y: 0, z: 0, yaw: 0 },
    receiver: { x: 840, y: 8, z: -430, yaw: 0 },
  },
});

scene.add(scenery.group);
scenery.update({
  elapsedSeconds,
  windX,
  windZ,
  precipitation01,
  rotorWash: {
    position: aircraftPosition,
    radiusM: 26,
    intensity01: rotorWash01,
  },
  activeSiteId,
  showApproachCue: true,
  capsuleCustody: "AT_PICKUP",
});
```

Call `dispose()` when replacing the course or renderer.

## Mission presentation

`casevac_mission_presentation.js` is a self-contained DOM view for the mission
strip, sparse radio/crew subtitles, quiet handoff interval, and four-axis
debrief. It is not wired into `app.js`.

```js
import {
  casevacDebriefModel,
  createCasevacMissionPresentation,
} from "./casevac_mission_presentation.js";

const missionUi = createCasevacMissionPresentation(document, {
  mount: document.body,
  maxMessages: 4,
  onQuietSkip: () => requestQuietSkipFromMissionAuthority(),
});

missionUi.update({
  streamId: `${scenarioId}:${missionEpochSequence}`,
  strip: {
    visible: true,
    phase: "LOADING",
    targetSiteId: "location.ukraine.casevac-pickup-a.v1",
    rangeM: 18,
    etaSeconds: 4,
    callAgeSeconds: 310,
    requestedHandoffAgeSeconds: 480,
    requestedWindowState: "OPEN",
    occupancy: "EMPTY",
    gateState: "STABLE",
    dwellKind: "LOADING",
    dwellProgress01: 0.42,
  },
  events: observerSafeMissionEvents,
  quiet: { active: false, skippable: false },
});

missionUi.update({
  debrief: casevacDebriefModel(observerSafeAssessedEvidence),
});
```

The exact runtime API is:

```text
{
  element,
  update({ strip?, events?, streamId?, quiet?, debrief? }),
  clearMessages(),
  dispose(),
  disposed
}
```

The module exports exactly these presentation symbols:

```text
CASEVAC_MISSION_PRESENTATION_SCHEMA
casevacMissionStripModel(projection)
casevacRadioMessage(event)
casevacDebriefModel(evidence)
createCasevacMissionPresentation(document, options?)
```

Omitted update members retain their previous presentation value. Explicit
`strip: null`, `quiet: null`, or `debrief: null` hides that section. A changed
`streamId` starts a fresh ordered-event cursor and clears old radio lines.

The strip accepts only already-projected presentation facts. Time values are
seconds; `requestedWindowState` is `OPEN`, `PASSED`, or `NOT_ASSESSED`;
`occupancy` is `EMPTY` or `OCCUPIED`; `gateState` is `OUTSIDE`, `UNSTABLE`,
`STABILIZING`, `STABLE`, `PAUSED`, `COMPLETE`, or `NOT_ASSESSED`; and
`dwellKind` is `STABILIZATION`, `LOADING`, or `HANDOFF`. The view never
compares clock values or resolves these states itself.

Each sparse event is `{ schemaVersion: 1, sequence, kind }`. `sequence` is the
monotonic observer-stream sequence. Event kind is one of the CASEVAC semantic
event names from the accepted design; unrecognized kinds and free-form payload
copy are ignored.

`casevacDebriefModel()` preserves four independent axes: `safe`, `controlled`,
`masked`, and `timely`. It accepts assessed status tokens plus bounded numeric
evidence:

```js
casevacDebriefModel({
  visible: true,
  // Also TRANSFERRED_AFTER_REQUESTED_TIME, CONTROLLED_ABORT,
  // AIRCRAFT_LOST_EMPTY, or AIRCRAFT_LOST_OCCUPIED.
  disposition: "TRANSFERRED_ON_TIME",
  handoffCallAgeSeconds,
  requestedHandoffAgeSeconds,
  axes: {
    safe: {
      status: "CLEAR", // CLEAR, REVIEW, NOT_ASSESSED
      minimumClearanceM,
      obstacleContacts,
      protectionInterventions,
    },
    controlled: {
      status: "CONTROLLED", // CONTROLLED, REVIEW, NOT_ASSESSED
      pickupApproaches,
      handoffApproaches,
      approachDiscontinuations,
      loadingInterruptions,
      handoffInterruptions,
    },
    masked: {
      status: "MIXED", // MASKED, MIXED, EXPOSED, NOT_ASSESSED
      safeBandPercent,
      exposedSeconds,
    },
    timely: {
      status: "WINDOW_PASSED", // WITHIN_REQUEST, WINDOW_PASSED, NOT_ASSESSED
      callToPickupSeconds,
      pickupToHandoffSeconds,
      totalCallToHandoffSeconds,
    },
  },
  correction: {
    kind: "PICKUP_DECELERATION",
    atCallAgeSeconds,
    intervalSeconds,
  },
});
```

Its single correction slot accepts one of:

```text
PICKUP_DECELERATION
APPROACH_DISCIPLINE
LOADING_STABILITY
HANDOFF_STABILITY
ROUTE_MASKING
DEPARTURE_MARGIN
```

Every available correction requires `atCallAgeSeconds`; kinds that make an
interval claim also require `intervalSeconds`. Missing evidence fails closed
to an unavailable correction instead of generating advice.

The DOM uses visible labels, a native ARIA progressbar, polite live regions,
keyboard-focusable quiet-skip control, and reduced-motion styling. The quiet
button emits a request callback only; it does not advance mission state.

## Authority boundary

Every object produced here is decorative and tagged `presentationOnly=true`,
`authoritative=false`, and `collisionSource=false`. Pads, wires, poles, fences,
trees, structures, approach/escape cues, weather, rotor wash, staff, and the
capsule silhouette cannot provide collision, landing-zone, exposure, custody,
or mission truth. Integration must align this presentation with separately
authored authoritative geometry and observer-safe CASEVAC state. Likewise, the
DOM view does not own clocks, gates, progress, custody, outcomes, assessment,
or completion, and it ignores free-form event payload text.
