// Terrain chunk meshing, off the main thread.
//
// The main thread posts a decoded heightfield; this worker runs every loop in
// terrain_mesh_builder.js and posts the finished typed arrays back as transferables. What is left
// on the render thread is wrapping those arrays in BufferAttributes, which is O(1) in the size of
// the chunk.
//
// The pure scenery planner is also executed here so streaming a detailed tile does not spend
// another 7–9 ms selecting procedural candidates on the render thread. The imported planner is a
// renderer-free leaf so the worker bundle never evaluates THREE or BufferGeometryUtils.

import { buildTerrainMeshArrays, terrainMeshTransferables } from "./terrain_mesh_builder.js";
import { planKoreaScenery } from "./korea_scenery_planner.js";

self.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== "build") return;
  const {
    id,
    boundsLocalM,
    heights,
    water,
    sampleCount,
    includeLandcover,
    sceneryPlanRequest,
  } = request;
  try {
    const decoded = {
      heights,
      water,
      sampleCount,
      includeLandcover,
    };
    const built = buildTerrainMeshArrays(boundsLocalM, decoded);
    if (sceneryPlanRequest?.chunk && sceneryPlanRequest?.options) {
      built.sceneryPlan = planKoreaScenery(
        sceneryPlanRequest.chunk,
        decoded,
        sceneryPlanRequest.options,
      );
    }
    // The heightfield arrives as a COPY rather than a transfer, and is not sent back. The main
    // thread still needs those samples to place scenery, and transferring them out would detach
    // its arrays — leaving the synchronous fallback with nothing to rebuild from if this worker
    // then failed. A ~330 kB clone per chunk is far cheaper than that failure mode.
    self.postMessage({ type: "built", id, built }, terrainMeshTransferables(built));
  } catch (error) {
    self.postMessage({ type: "failed", id, message: String(error?.message ?? error) });
  }
};

// Tell the owner the module graph resolved. Until this arrives the pool has no proof the worker is
// usable, and a pool that assumed success would strand every queued chunk on a worker that never
// loaded.
self.postMessage({ type: "ready" });
