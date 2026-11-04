// Fetch binary assets with an optional browser-side gzip sidecar.
// Node consumers intentionally use the raw path so existing filesystem/fetch fixtures
// remain byte-for-byte compatible with the authored GLBs.
async function rawBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Asset unavailable (${response.status})`);
  return response.arrayBuffer();
}

export async function fetchAssetBuffer(url, {compressed = true} = {}) {
  const source = String(url);
  // `document` can be shimmed by Node-side Blender/export tools; `window` keeps
  // those DOM-compatible consumers on the raw fixture path as well.
  if (!compressed || typeof window === 'undefined' || typeof DecompressionStream !== 'function')
    return rawBuffer(source);
  const compressedResponse = await fetch(`${source}.gz`);
  if (compressedResponse.status === 404) return rawBuffer(source);
  if (!compressedResponse.ok) throw Error(`Compressed asset unavailable (${compressedResponse.status})`);
  if (!compressedResponse.body) throw Error('Compressed asset has no response body');
  // Do not catch decode failures: a corrupt sidecar must surface rather than silently
  // switching to the much larger raw asset.
  const stream = compressedResponse.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
