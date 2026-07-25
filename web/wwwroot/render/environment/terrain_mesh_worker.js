// Terrain chunk meshing, off the main thread.
//
// The main thread posts a decoded heightfield; this worker runs every loop in
// terrain_mesh_builder.js and posts the finished typed arrays back as transferables. What is left
// on the render thread is wrapping those arrays in BufferAttributes, which is O(1) in the size of
// the chunk.
//
// This file must stay a leaf: it may import terrain_mesh_builder.js and nothing else. Any import
// that reaches THREE, the DOM, or window would fail to load here and silently push every build
// back onto the main thread through the fallback path.

import { buildTerrainMeshArrays, terrainMeshTransferables } from "./terrain_mesh_builder.js";

self.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== "build") return;
  const { id, boundsLocalM, heights, water, sampleCount } = request;
  try {
    const built = buildTerrainMeshArrays(boundsLocalM, { heights, water, sampleCount });
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
