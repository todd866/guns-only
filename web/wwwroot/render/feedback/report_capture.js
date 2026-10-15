import { REPORT_BINARY_BYTES, trimReportHistory } from "./report_payload.js";

function jpeg(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Screenshot encoding failed")), "image/jpeg", .85));
}

/** Call synchronously immediately after scene render + HUD draw, before yielding the frame.
 * Copying WebGL into a 2D canvas here preserves pixels without preserveDrawingBuffer. */
export function captureReportFrame(scene, hud, { makeCanvas = () => document.createElement("canvas"),
  hudOpacity = 1, maximumBytes = REPORT_BINARY_BYTES } = {}) {
  const frozen = makeCanvas();
  if (!scene.width || !scene.height) throw new Error("Scene is not ready");
  frozen.width = scene.width;
  frozen.height = scene.height;
  const context = frozen.getContext("2d");
  if (!context) throw new Error("Screenshot canvas is unavailable");
  context.drawImage(scene, 0, 0, frozen.width, frozen.height);
  if (hud?.width && hud?.height) {
    context.globalAlpha = hudOpacity;
    context.drawImage(hud, 0, 0, frozen.width, frozen.height);
    context.globalAlpha = 1;
  }
  // Encoding is async; only the detached, frozen 2D copy is read after this call returns.
  return (async () => {
    let surface = frozen;
    for (let attempt = 0; attempt < 12; attempt++) {
      const blob = await jpeg(surface);
      if (blob.type !== "image/jpeg") throw new Error("JPEG encoding is unavailable");
      if (blob.size <= maximumBytes) return blob;
      const smaller = makeCanvas();
      const scale = Math.min(.8, Math.sqrt(maximumBytes / blob.size) * .9);
      smaller.width = Math.max(1, Math.floor(surface.width * scale));
      smaller.height = Math.max(1, Math.floor(surface.height * scale));
      smaller.getContext("2d").drawImage(surface, 0, 0, smaller.width, smaller.height);
      surface = smaller;
    }
    throw new Error("Screenshot exceeds report limit");
  })();
}

export async function blobBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function encodeReportUpload(report, screenshot, maximumBytes = REPORT_BINARY_BYTES) {
  if (screenshot.size > maximumBytes) throw new RangeError("Screenshot exceeds upload limit");
  let bounded = report;
  for (;;) {
    const compressed = await new Response(new Blob([JSON.stringify(bounded)])
      .stream().pipeThrough(new CompressionStream("gzip"))).blob();
    if (compressed.size <= maximumBytes)
      return JSON.stringify({ reportGzip: await blobBase64(compressed), jpeg: await blobBase64(screenshot) });
    if (!bounded.telemetry.length && !bounded.inputs.length)
      throw new RangeError("Full report state exceeds upload limit");
    bounded = trimReportHistory(bounded);
  }
}
